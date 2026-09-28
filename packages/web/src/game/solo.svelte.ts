// 혼자 연습 세션 (spec 2.5, FR-10~19, MN-01·02·05, AI-05, 6.3·6.4).
// 엔진 + CPU + 원장을 이어 붙이는 오케스트레이터. 좌석 0 = 사람, 좌석 1 = CPU.
// - 순수 세션 모델(session.ts)로 상태를 바꾸고, 바뀔 때마다 localStorage에 저장한다(MN-05).
// - 액션 하나가 낸 이벤트 묶음을 큐에 넣고, 보드 루트가 붙어 있으면 이벤트를 애니메이션으로 재생한 뒤
//   최신 뷰로 스냅한다(spec 6.4). 큐가 비면 CPU 차례인지 보고 Web Worker에 결정을 맡긴다(AI-05, UI를 막지 않음).
// - 화면은 반응형 필드(board·extras·banner·toast·busy·thinking·settlementReady)만 읽는다.
// M4 호스트 모드는 같은 모양(board·extras·submit·skipAnimations)을 원격 좌석으로 구현하면 된다(docs/ui.md 4장).
import type { Difficulty } from '@p2p-gostop/ai';
import {
  getCard,
  playerView,
  redactEvent,
  sameAction,
  type Action,
  type EngineEvent,
  type PlayerView,
  type Seat,
} from '@p2p-gostop/engine';
import { tick } from 'svelte';
import { deal, replay, skip, unskip, type ReplayHost } from '../anim/choreo.ts';
import { DUR, scaledMs } from '../anim/durations.ts';
import { readJson, removeKey, STORAGE_KEYS, writeJson } from '../storage/local.ts';
import { bannerForEngineEvent, type Banner } from '../ui/banner.ts';
import { cardLabel } from '../ui/cards.ts';
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import { inFlightOf, toBoardExtras, toBoardView, type BoardExtras } from './adapter.ts';
import type { AiClient } from './ai-client.ts';
import { isDealBatch, snap, type DisplayBoard } from './display.ts';
import { log } from './log.svelte.ts';
import {
  actingSeats,
  createSession,
  endSession,
  parseSession,
  refill,
  roundSeed,
  sessionAct,
  startNextRound,
  type SessionConfig,
  type SessionState,
} from './session.ts';
import { sounds, type SoundKind } from './sound.ts';

const HUMAN: Seat = 0;
const CPU: Seat = 1;

export const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  easy: '쉬움',
  normal: '보통',
  commercial: '상용급',
};

/** localStorage에 저장하는 솔로 세션 (MN-05) */
export interface SoloSave {
  readonly version: 1;
  readonly difficulty: Difficulty;
  readonly session: SessionState;
}

export interface SoloOptions {
  readonly difficulty: Difficulty;
  /** CPU 결정 시간 제한 ms (timeBudgetFor로 난이도별 조정) */
  readonly timeBudgetMs: number;
  readonly ai: AiClient;
  /** false면 저장하지 않는다(테스트) */
  readonly persist?: boolean;
}

/** 탭 → 그 액션의 이벤트 재생 끝까지 걸린 시간 (spec AC-06, 6.4 "탭부터 턴 종료까지") */
export interface TurnTiming {
  readonly action: Action['type'];
  readonly ms: number;
  /** 재생 뒤 내 프롬프트(대상·고/스톱 등)가 떴는지: 이 경우 턴 종료가 아니라 프롬프트 표시까지 */
  readonly promptAfter: boolean;
}

interface Batch {
  readonly events: readonly EngineEvent[];
  /** 재생이 끝난 뒤 스냅할 뷰 */
  readonly board: DisplayBoard;
  readonly extras: BoardExtras;
  readonly action: Action | null;
  /** 사람이 탭한 시각 (performance.now) */
  readonly tapAt: number | null;
}

const BANNER_SOUND: Readonly<Record<Banner['kind'], SoundKind>> = {
  ppeok: 'ppeok',
  jjok: 'jjok',
  ttadak: 'ttadak',
  sseul: 'sseul',
  shake: 'shake',
  bomb: 'bomb',
  go: 'go',
  stop: 'stop',
  chongtong: 'bomb',
  nagari: 'end',
  hudang: 'end',
};

/** CPU 결정 시드: 세션 시드 × 판 번호 × 액션 순번 (AI-08 재현성) */
function decisionSeed(session: SessionState): number {
  return roundSeed(roundSeed(session.config.seed, session.roundNumber), session.actions.length + 1);
}

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

export class SoloSession {
  // ---- 반응형 상태 (화면이 읽는다) ----
  state: SessionState;
  /** 화면에 그리는 판: 재생 중에는 중간 모습, 끝나면 최신 뷰 */
  board: DisplayBoard;
  extras: BoardExtras;
  /** 이벤트 재생 중 (입력 잠금, 탭하면 건너뛰기) */
  busy = $state(false);
  /** CPU가 생각 중 */
  thinking = $state(false);
  banner = $state.raw<(Banner & { readonly id: number }) | null>(null);
  toast = $state.raw<{ readonly id: number; readonly text: string } | null>(null);
  /** 판이 끝나고 마지막 재생까지 마쳐 정산 화면을 보여 줄 때 */
  settlementReady = $state(false);
  timings = $state.raw<readonly TurnTiming[]>([]);

  readonly difficulty: Difficulty;
  private readonly timeBudgetMs: number;
  private readonly ai: AiClient;
  private readonly persist: boolean;
  private host: ReplayHost | null = null;
  private queue: Batch[] = [];
  private pumping = false;
  private disposed = false;
  /** 상태가 바뀔 때마다 증가: CPU 결정이 오래된 상태에 적용되지 않게 한다 */
  private generation = 0;
  private bannerSeq = 0;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(session: SessionState, options: SoloOptions) {
    this.difficulty = options.difficulty;
    this.timeBudgetMs = options.timeBudgetMs;
    this.ai = options.ai;
    this.persist = options.persist ?? true;
    this.state = $state.raw(session);
    const view = this.viewOf(session);
    this.board = $state.raw(snap(toBoardView(view, this.meta(session)), inFlightOf(view)));
    this.extras = $state.raw(toBoardExtras(view));
    this.settlementReady = session.phase === 'roundOver' || session.phase === 'bankrupt';
    this.save();
  }

  /** 새 세션 (첫 판은 선 고르기부터) */
  static create(config: SessionConfig, options: SoloOptions): SoloSession {
    const { session } = createSession(config);
    log.info(
      `솔로 세션 시작: ${DIFFICULTY_LABEL[options.difficulty]}, 규칙 ${config.preset}, 점당 ${config.perPoint}, 시작 ${config.startBalance}, 시드 ${config.seed}`,
    );
    return new SoloSession(session, options);
  }

  /** 저장된 세션 읽기 (MN-05). 끝난 세션도 기록 화면을 위해 돌려준다 */
  static load(): SoloSave | null {
    const raw = readJson(STORAGE_KEYS.soloSession);
    if (typeof raw !== 'object' || raw === null) return null;
    const o = raw as Partial<SoloSave>;
    const session = parseSession(o.session);
    if (o.version !== 1 || session === null) return null;
    const difficulty = o.difficulty;
    if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'commercial') {
      return null;
    }
    return { version: 1, difficulty, session };
  }

  static clearSaved(): void {
    removeKey(STORAGE_KEYS.soloSession);
  }

  // ---- 뷰 ----

  private viewOf(session: SessionState, seat: Seat = HUMAN): PlayerView {
    // 원장을 넘기면 스톱 미리보기 금액이 올인 상한까지 반영된다(FR-14, MN-02)
    return playerView(session.game, seat, { ledger: session.ledger });
  }

  private meta(session: SessionState) {
    return { names: session.config.names, balances: session.ledger.balances };
  }

  private target(session: SessionState): { board: DisplayBoard; extras: BoardExtras } {
    const view = this.viewOf(session);
    return {
      board: snap(toBoardView(view, this.meta(session)), inFlightOf(view)),
      extras: toBoardExtras(view),
    };
  }

  get names(): readonly [string, string] {
    return this.state.config.names;
  }

  /** 지금 사람이 입력할 차례인지 (재생·CPU 생각 중이 아니고 내 합법 수가 있다) */
  get awaitingHuman(): boolean {
    return (
      !this.busy &&
      !this.thinking &&
      this.state.phase === 'playing' &&
      actingSeats(this.state.game).includes(HUMAN)
    );
  }

  get lastTiming(): TurnTiming | null {
    return this.timings.at(-1) ?? null;
  }

  // ---- 화면 연결 ----

  /** 게임판이 마운트되면 보드 루트를 붙인다. null이면 떼어 낸다(재생은 스냅으로 대체) */
  attach(root: HTMLElement | null): void {
    if (root === null) {
      this.host = null;
      return;
    }
    this.host = {
      root,
      commit: async (board) => {
        this.board = board;
        await tick();
      },
      onEvent: (event) => this.onEvent(event),
    };
    this.kick();
  }

  /** 사람 좌석의 액션 (spec 6.3 탭 한 번). 받아들이면 true */
  submit(action: Action, tapAt: number = performance.now()): boolean {
    if (this.disposed || !this.awaitingHuman || action.seat !== HUMAN) return false;
    const step = sessionAct(this.state, action);
    if (!step.ok) {
      log.warn(`액션 거부: ${step.message}`);
      return false;
    }
    this.commitState(step.session);
    this.enqueue(step.events, action, tapAt);
    return true;
  }

  /** 남은 애니메이션을 즉시 끝낸다 (spec 6.3 "화면을 탭하면 즉시 완료") */
  skipAnimations(): void {
    if (this.busy && this.host !== null) skip(this.host.root);
  }

  /** 정산 화면 → 다음 판 */
  nextRound(): void {
    if (this.state.phase !== 'roundOver' || this.busy) return;
    const { session, events } = startNextRound(this.state);
    this.settlementReady = false;
    this.commitState(session);
    log.info(`판 ${session.roundNumber} 시작`);
    this.enqueue(events, null, null);
  }

  /** MN-02 재충전 */
  refill(): void {
    if (this.state.phase !== 'bankrupt') return;
    this.commitState(refill(this.state));
    this.refreshSnapshot();
    log.info('재충전: 잔액 0인 좌석을 시작 잔액으로');
  }

  /** 세션 종료 (기록은 남는다) */
  end(): void {
    this.commitState(endSession(this.state));
    log.info(`세션 종료: ${this.state.records.length}판`);
  }

  dispose(): void {
    this.disposed = true;
    this.host = null;
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
  }

  // ---- 내부 ----

  private commitState(session: SessionState): void {
    this.state = session;
    this.generation += 1;
    this.save();
  }

  private save(): void {
    if (!this.persist) return;
    const save: SoloSave = { version: 1, difficulty: this.difficulty, session: this.state };
    if (!writeJson(STORAGE_KEYS.soloSession, save))
      log.warn('세션 저장 실패 (저장소 없음 또는 용량 초과)');
  }

  private refreshSnapshot(): void {
    const { board, extras } = this.target(this.state);
    this.board = board;
    this.extras = extras;
  }

  private enqueue(events: readonly EngineEvent[], action: Action | null, tapAt: number | null) {
    const { board, extras } = this.target(this.state);
    this.queue.push({ events, board, extras, action, tapAt });
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    this.busy = true;
    try {
      for (let batch = this.queue.shift(); batch !== undefined; batch = this.queue.shift()) {
        await this.play(batch);
        if (batch.tapAt !== null && batch.action !== null) this.recordTiming(batch);
      }
    } catch (error) {
      log.error(`재생 오류: ${String(error)}`);
      this.refreshSnapshot();
    } finally {
      this.pumping = false;
      this.busy = false;
      if (this.host !== null) unskip(this.host.root);
    }
    if (this.state.phase === 'roundOver' || this.state.phase === 'bankrupt') {
      this.settlementReady = true;
    }
    this.kick();
  }

  /** 묶음 하나 재생 → 최신 뷰로 스냅 (spec 6.4) */
  private async play(batch: Batch): Promise<void> {
    const events = batch.events.map((e) => redactEvent(e, HUMAN));
    const host = this.host;
    if (host === null || this.disposed) {
      for (const e of events) this.onEvent(e);
    } else if (isDealBatch(events)) {
      for (const e of events) this.onEvent(e);
      if (events.some((e) => e.type === 'FirstPicked')) {
        // 선 고르기 결과를 읽을 시간
        await sleep(scaledMs(DUR.banner * 2));
      }
      await deal(host, batch.board);
    } else {
      await replay(host, this.board, events);
    }
    this.board = batch.board;
    this.extras = batch.extras;
    await tick();
    if (events.some((e) => e.type === 'RoundEnded') && host !== null) {
      // 마지막 획득·배너를 본 뒤 정산 화면으로
      await sleep(scaledMs(DUR.banner * 2));
    }
  }

  private recordTiming(batch: Batch): void {
    if (batch.tapAt === null || batch.action === null) return;
    const ms = Math.round(performance.now() - batch.tapAt);
    const pending = batch.board.pending;
    const promptAfter = pending !== null && pending.seat === HUMAN && pending.kind !== 'play';
    const timing: TurnTiming = { action: batch.action.type, ms, promptAfter };
    this.timings = [...this.timings.slice(-99), timing];
    log.info(`턴 시간 ${timing.action} ${ms}ms${promptAfter ? ' (프롬프트까지)' : ''}`);
  }

  /** 큐가 비었을 때 다음 할 일: CPU 차례면 결정을 맡긴다 */
  private kick(): void {
    if (this.disposed || this.host === null || this.pumping || this.thinking) return;
    const s = this.state;
    if (s.phase !== 'playing') return;
    const seats = actingSeats(s.game);
    if (seats.includes(HUMAN) || !seats.includes(CPU)) return;
    void this.runCpu();
  }

  private async runCpu(): Promise<void> {
    const generation = this.generation;
    const session = this.state;
    const view = this.viewOf(session, CPU);
    const legal = view.legal;
    const fallback = legal[0];
    if (fallback === undefined) return;
    this.thinking = true;
    let action: Action = fallback;
    try {
      const [result] = await Promise.all([
        this.ai.decide({
          difficulty: this.difficulty,
          view,
          seed: decisionSeed(session),
          timeBudgetMs: this.timeBudgetMs,
        }),
        // CPU 수가 너무 순식간이면 따라가기 어렵다: 빠름 기준 250ms (즉시 모드 0)
        sleep(scaledMs(250)),
      ]);
      if (legal.some((a) => sameAction(a, result.action))) {
        action = result.action;
      } else {
        log.error(`CPU가 합법 수가 아닌 수를 냈습니다: ${JSON.stringify(result.action)}`);
      }
      if (result.ms > 200) log.info(`CPU 결정 ${Math.round(result.ms)}ms (${this.ai.mode})`);
    } catch (error) {
      log.error(`CPU 결정 오류: ${String(error)} → 첫 합법 수`);
    } finally {
      this.thinking = false;
    }
    if (this.disposed || generation !== this.generation) return;
    const step = sessionAct(this.state, action);
    if (!step.ok) {
      log.error(`CPU 액션 거부: ${step.message}`);
      return;
    }
    this.commitState(step.session);
    this.enqueue(step.events, action, null);
  }

  // ---- 이벤트 부수 효과: 배너·토스트·효과음 (spec 6.5, FR-18) ----

  private nameOf(seat: Seat | null): string {
    return seat === null ? '' : this.state.config.names[seat];
  }

  private showBanner(banner: Banner): void {
    this.bannerSeq += 1;
    this.banner = { ...banner, id: this.bannerSeq };
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    // spec 6.4: 350ms 표시 후 다음 단계와 겹쳐 사라진다
    this.bannerTimer = setTimeout(() => (this.banner = null), scaledMs(DUR.banner) + 1);
  }

  private showToast(text: string): void {
    this.toast = { id: (this.toast?.id ?? 0) + 1, text };
  }

  private sound(kind: SoundKind): void {
    sounds.play(kind);
  }

  private onEvent(event: EngineEvent): void {
    const banner = bannerForEngineEvent(event);
    if (banner !== null) {
      this.showBanner(banner);
      this.sound(BANNER_SOUND[banner.kind]);
    }
    switch (event.type) {
      case 'CardPlayed':
        this.sound('play');
        break;
      case 'CardFlipped':
      case 'CardDrawn':
        this.sound('flip');
        break;
      case 'Dealt':
        this.sound('deal');
        break;
      case 'Captured':
        this.sound('capture');
        break;
      case 'PiStolen':
        this.sound('steal');
        break;
      case 'InstantPayout':
        this.sound('payout');
        this.showToast(
          `${this.nameOf(event.seat)} ${INSTANT_LABEL[event.kind] ?? event.kind} 즉시 정산 +${event.points}점`,
        );
        break;
      case 'PpeokTaken':
        this.showToast(`${this.nameOf(event.seat)} 뻑 먹기`);
        break;
      case 'SelfPpeok':
        this.showToast(`${this.nameOf(event.seat)} 자뻑`);
        break;
      case 'FirstPicked': {
        const [a, b] = event.picks;
        this.showToast(
          `선 고르기: ${this.nameOf(0)} ${cardLabel(a)} · ${this.nameOf(1)} ${cardLabel(b)}`,
        );
        break;
      }
      case 'FirstPickTie':
        this.showToast('같은 월: 다시 고릅니다');
        break;
      case 'FirstPickerChosen':
        this.showToast(`${this.nameOf(event.seat)} 선`);
        break;
      case 'Redealt':
        this.showToast('바닥 총통: 다시 나눕니다');
        break;
      case 'GukjinPlaced':
        this.showToast(`${this.nameOf(event.seat)} 국진: ${event.asPi ? '쌍피' : '열끗'}`);
        break;
      case 'RoundEnded':
        this.sound('end');
        break;
      case 'Shake':
        if (event.seat !== HUMAN) {
          this.showToast(
            `${this.nameOf(event.seat)} 흔들기: ${event.cards.map((id) => cardLabel(id)).join(', ')}`,
          );
        }
        break;
      default:
        break;
    }
    if (event.type === 'Bomb' && event.seat !== null) {
      const month = getCard(event.cards[0] ?? 0).month;
      this.showToast(`${this.nameOf(event.seat)} 폭탄 (${month ?? ''}월)`);
    }
  }
}
