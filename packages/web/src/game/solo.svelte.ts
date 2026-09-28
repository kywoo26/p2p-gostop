// 혼자 연습 세션 (spec 2.5, FR-10~19, MN-01·02·05, AI-05, 6.3·6.4).
// 엔진 + CPU + 원장을 이어 붙이는 오케스트레이터. 좌석 0 = 이 기기, 좌석 1 = CPU.
// - 순수 세션 모델(session.ts)로 상태를 바꾸고, 바뀔 때마다 localStorage에 저장한다(MN-05).
// - 액션 하나가 낸 이벤트 묶음을 재생 큐(playback.svelte.ts)에 넣는다. 큐가 비면 CPU 차례인지 보고
//   Web Worker에 결정을 맡긴다(AI-05, UI를 막지 않음). 호스트·게스트 모드도 같은 재생 큐와 GameController 모양을 쓴다.
import type { Difficulty } from '@p2p-gostop/ai';
import {
  playerView,
  redactEvent,
  sameAction,
  type Action,
  type EngineEvent,
  type PlayerView,
  type Seat,
} from '@p2p-gostop/engine';
import { toBoardView, type BoardView } from '@p2p-gostop/protocol';
import { scaledMs } from '../anim/durations.ts';
import { settings } from '../settings/settings.svelte.ts';
import { readJson, removeKey, STORAGE_KEYS, writeJson } from '../storage/local.ts';
import type { AiClient } from './ai-client.ts';
import type { GameController, GameStats } from './controller.ts';
import { log } from './log.svelte.ts';
import { Playback, type RoundSummary } from './playback.svelte.ts';
import { soloSummary } from './records.ts';
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

const ME: Seat = 0;
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

/** CPU 결정 시드: 세션 시드 × 판 번호 × 액션 순번 (AI-08 재현성) */
function decisionSeed(session: SessionState): number {
  return roundSeed(roundSeed(session.config.seed, session.roundNumber), session.actions.length + 1);
}

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

export class SoloSession implements GameController {
  readonly mode = 'solo' as const;
  state: SessionState;
  /** CPU가 생각 중 */
  thinking = $state(false);
  readonly playback: Playback;
  readonly difficulty: Difficulty;
  readonly notice = null;
  private readonly timeBudgetMs: number;
  private readonly ai: AiClient;
  private readonly persist: boolean;
  private disposed = false;
  /** 상태가 바뀔 때마다 증가: CPU 결정이 오래된 상태에 적용되지 않게 한다 */
  private generation = 0;

  constructor(session: SessionState, options: SoloOptions) {
    this.difficulty = options.difficulty;
    this.timeBudgetMs = options.timeBudgetMs;
    this.ai = options.ai;
    this.persist = options.persist ?? true;
    this.state = $state.raw(session);
    const over = session.phase === 'roundOver' || session.phase === 'bankrupt';
    this.playback = new Playback(this.boardOf(session), {
      viewer: ME,
      names: () => this.state.config.names,
      onIdle: () => this.kick(),
      settlement: over ? this.summary(session) : null,
    });
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

  private viewOf(session: SessionState, seat: Seat = ME): PlayerView {
    // 원장을 넘기면 스톱 미리보기 금액이 올인 상한까지 반영된다(FR-14, MN-02)
    return playerView(session.game, seat, { ledger: session.ledger });
  }

  private boardOf(session: SessionState): BoardView {
    return toBoardView(this.viewOf(session), {
      names: session.config.names,
      ledger: session.ledger,
    });
  }

  private summary(session: SessionState): RoundSummary | null {
    const record = session.records.at(-1);
    if (record === undefined) return null;
    return soloSummary({
      record,
      names: session.config.names,
      unit: settings.value.unit,
      perPoint: session.config.perPoint,
    });
  }

  get names(): readonly [string, string] {
    return this.state.config.names;
  }

  /** 지금 사람이 입력할 차례인지 (재생·CPU 생각 중이 아니고 내 합법 수가 있다) */
  get canAct(): boolean {
    return (
      this.playback.idle &&
      !this.thinking &&
      this.state.phase === 'playing' &&
      actingSeats(this.state.game).includes(ME)
    );
  }

  get bankrupt(): boolean {
    return this.state.phase === 'bankrupt';
  }

  get stats(): GameStats {
    const s = this.state;
    return {
      round: s.roundNumber,
      phase: s.phase,
      roundsPlayed: s.records.length,
      balances: s.ledger.balances,
      refilled: s.refilled,
      startBalance: s.config.startBalance,
      seq: null,
    };
  }

  // ---- 화면 연결 ----

  attach(root: HTMLElement | null): void {
    this.playback.attach(root);
    this.kick();
  }

  /** 이 기기 좌석의 액션 (spec 6.3 탭 한 번). 받아들이면 true */
  submit(action: Action, tapAt: number = performance.now()): boolean {
    if (this.disposed || !this.canAct || action.seat !== ME) return false;
    const step = sessionAct(this.state, action);
    if (!step.ok) {
      log.warn(`액션 거부: ${step.message}`);
      return false;
    }
    this.commitState(step.session);
    this.enqueue(step.events, action, tapAt);
    return true;
  }

  skipAnimations(): void {
    this.playback.skip();
  }

  /** 정산 화면 → 다음 판 */
  nextRound(): void {
    if (this.state.phase !== 'roundOver' || this.playback.busy) return;
    const { session, events } = startNextRound(this.state);
    this.commitState(session);
    log.info(`판 ${session.roundNumber} 시작`);
    // 분배만으로 끝나는 판(바닥 총통 등)은 곧바로 정산 화면이 다시 뜬다
    this.enqueue(events, null, null);
    this.playback.release();
  }

  /** MN-02 재충전 (정산 화면은 그대로 두고 "다음 판"을 누르게 한다) */
  refill(): void {
    if (this.state.phase !== 'bankrupt') return;
    this.commitState(refill(this.state));
    log.info('재충전: 잔액 0인 좌석을 시작 잔액으로');
  }

  /** 세션 종료 (기록은 남는다) */
  end(): void {
    this.commitState(endSession(this.state));
    log.info(`세션 종료: ${this.state.records.length}판`);
  }

  dispose(): void {
    this.disposed = true;
    this.playback.dispose();
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

  private enqueue(events: readonly EngineEvent[], action: Action | null, tapAt: number | null) {
    const s = this.state;
    const over = s.phase === 'roundOver' || s.phase === 'bankrupt';
    this.playback.enqueue(
      events.map((e) => redactEvent(e, ME)),
      this.boardOf(s),
      { action, tapAt, settlement: over ? this.summary(s) : null },
    );
  }

  /** 큐가 비었을 때 다음 할 일: CPU 차례면 결정을 맡긴다 */
  private kick(): void {
    if (this.disposed || this.thinking || !this.playback.idle) return;
    const s = this.state;
    if (s.phase !== 'playing') return;
    const seats = actingSeats(s.game);
    if (seats.includes(ME) || !seats.includes(CPU)) return;
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
    this.enqueue(step.events, null, null);
  }
}
