// 이벤트 재생 큐 (spec 6.3·6.4, plan.md 1.6): 솔로·호스트·게스트가 같은 반응형 화면 상태를 쓴다.
// 액션 하나가 낸 이벤트 묶음(보는 좌석으로 가린 것)과 그 뒤의 권위 뷰를 큐에 넣으면, 보드 루트가 붙어 있을 때
// anim/choreo.ts로 재생하고 최신 뷰로 스냅한다. 판이 끝난 묶음(정산 포함)을 재생하면 정산 화면을 띄우고
// release()까지 다음 묶음을 멈춘다(다음 판 분배는 사용자가 "다음 판"을 누른 뒤에 보인다).
// 화면은 board·busy·banner·toast·timings·settlement만 읽는다. 사람/CPU/원격을 구분하지 않는다.
import { getCard, type Action, type EngineEvent, type Seat } from '@p2p-gostop/engine';
import { tick } from 'svelte';
import { deal, replay, skip, unskip, type ReplayHost } from '../anim/choreo.ts';
import { DUR, scaledMs } from '../anim/durations.ts';
import type { BoardView, SettlementView } from '../lib/view-types.ts';
import { bannerForEngineEvent, type Banner } from '../ui/banner.ts';
import { cardLabel } from '../ui/cards.ts';
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import { isDealBatch, snap, type DisplayBoard } from './display.ts';
import { log } from './log.svelte.ts';
import { sounds, type SoundKind } from './sound.ts';

/** 탭 → 그 액션의 이벤트 재생 끝까지 걸린 시간 (spec AC-06, 6.4 "탭부터 턴 종료까지") */
export interface TurnTiming {
  readonly action: Action['type'];
  readonly ms: number;
  /** 재생 뒤 내 프롬프트(대상·고/스톱 등)가 떴는지: 이 경우 턴 종료가 아니라 프롬프트 표시까지 */
  readonly promptAfter: boolean;
}

export interface EnqueueOptions {
  /** 이 묶음을 낸 보는 좌석의 액션 (시간 계측) */
  readonly action?: Action | null;
  /** 사람이 탭한 시각 (performance.now) */
  readonly tapAt?: number | null;
  /** 판이 끝났으면 정산 화면 (재생이 끝나면 띄우고 멈춘다) */
  readonly settlement?: RoundSummary | null;
}

interface Batch {
  readonly events: readonly EngineEvent[];
  readonly board: DisplayBoard;
  readonly action: Action | null;
  readonly tapAt: number | null;
  readonly settlement: RoundSummary | null;
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

/** 토스트 표시 시간 (빠름 기준, 속도 배율 적용). 이슈 #6: 지우는 타이머가 없어 판을 넘어 남던 문구 */
const TOAST_MS = 1600;
/** 즉시 모드(배율 0)에서도 한 번은 읽을 수 있게 */
const TOAST_MIN_MS = 400;

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PlaybackOptions {
  /** 보는 좌석 (배너·토스트 문구의 "내"/상대 구분) */
  readonly viewer: Seat;
  /** 좌석 이름 (토스트 문구) */
  readonly names: () => readonly [string, string];
  /** 큐가 비고 멈춤이 풀렸을 때 (솔로: CPU 차례 확인) */
  readonly onIdle?: () => void;
  /** 처음부터 정산 화면을 띄운다 (이어하기) */
  readonly settlement?: RoundSummary | null;
  /** 배너 이벤트 (진동 등 기기 피드백, spec 6.5) */
  readonly onBanner?: (kind: Banner['kind']) => void;
}

/** 정산 화면 입력: 정산 뷰 + 즉시 정산 줄 + 나가리 다음 판 배수 (FR-18, G9) */
export interface RoundSummary {
  readonly view: SettlementView;
  readonly instant: readonly {
    readonly label: string;
    readonly name: string;
    readonly points: number;
  }[];
  /** 나가리면 다음 판 배수 (모르면 null) */
  readonly nextCarry: number | null;
}

export class Playback {
  /** 화면에 그리는 판: 재생 중에는 중간 모습, 끝나면 최신 뷰 */
  board: DisplayBoard;
  /** 이벤트 재생 중 (입력 잠금, 탭하면 건너뛰기) */
  busy = $state(false);
  banner = $state.raw<(Banner & { readonly id: number }) | null>(null);
  toast = $state.raw<{ readonly id: number; readonly text: string } | null>(null);
  timings = $state.raw<readonly TurnTiming[]>([]);
  /** 재생을 마친 판의 정산 화면. 떠 있는 동안 다음 묶음은 기다린다 */
  settlement = $state.raw<RoundSummary | null>(null);
  /** 재생할 묶음이 남아 있다 */
  pending = $state(0);

  private readonly viewer: Seat;
  private readonly names: () => readonly [string, string];
  private readonly onIdle: (() => void) | undefined;
  private readonly onBanner: ((kind: Banner['kind']) => void) | undefined;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private host: ReplayHost | null = null;
  private queue: Batch[] = [];
  private pumping = false;
  private disposed = false;
  private bannerSeq = 0;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: BoardView, options: PlaybackOptions) {
    this.viewer = options.viewer;
    this.names = options.names;
    this.onIdle = options.onIdle;
    this.onBanner = options.onBanner;
    this.board = $state.raw(snap(initial, initial.inFlight));
    this.settlement = options.settlement ?? null;
  }

  /** 입력을 받아도 되는지: 재생 중이 아니고, 남은 묶음·정산 화면이 없다 */
  get idle(): boolean {
    return !this.busy && this.pending === 0 && this.settlement === null;
  }

  get lastTiming(): TurnTiming | null {
    return this.timings.at(-1) ?? null;
  }

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
    void this.pump();
  }

  /** 가린 이벤트 묶음과 그 뒤의 권위 뷰를 큐에 넣는다 */
  enqueue(events: readonly EngineEvent[], board: BoardView, options: EnqueueOptions = {}): void {
    if (this.disposed) return;
    this.queue.push({
      events,
      board: snap(board, board.inFlight),
      action: options.action ?? null,
      tapAt: options.tapAt ?? null,
      settlement: options.settlement ?? null,
    });
    this.pending = this.queue.length;
    void this.pump();
  }

  /** 정산 화면을 닫고 멈춰 있던 묶음(다음 판 분배)을 이어 재생한다 */
  release(): void {
    if (this.settlement === null) return;
    this.settlement = null;
    void this.pump();
  }

  /** 큐를 비우고 곧바로 이 뷰로 바꾼다 (판 무효·이어하기 등 재생할 이벤트가 없는 전환) */
  reset(board: BoardView, settlement: RoundSummary | null = null): void {
    this.queue = [];
    this.pending = 0;
    this.board = snap(board, board.inFlight);
    this.settlement = settlement;
  }

  /** 남은 애니메이션을 즉시 끝낸다 (spec 6.3 "화면을 탭하면 즉시 완료") */
  skip(): void {
    if (this.busy && this.host !== null) skip(this.host.root);
  }

  dispose(): void {
    this.disposed = true;
    this.host = null;
    this.queue = [];
    this.pending = 0;
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    this.busy = true;
    try {
      while (this.settlement === null && !this.disposed) {
        const batch = this.queue.shift();
        if (batch === undefined) break;
        this.pending = this.queue.length;
        await this.play(batch);
        if (batch.tapAt !== null && batch.action !== null) this.recordTiming(batch);
        if (batch.settlement !== null) this.settlement = batch.settlement;
      }
    } catch (error) {
      log.error(`재생 오류: ${String(error)}`);
      const last = this.queue.at(-1);
      if (last !== undefined) this.board = last.board;
      this.queue = [];
      this.pending = 0;
    } finally {
      this.pumping = false;
      this.busy = false;
      if (this.host !== null) unskip(this.host.root);
    }
    if (this.idle) this.onIdle?.();
  }

  /** 묶음 하나 재생 → 최신 뷰로 스냅 (spec 6.4) */
  private async play(batch: Batch): Promise<void> {
    const events = batch.events;
    const host = this.host;
    if (host === null || this.disposed) {
      for (const e of events) this.onEvent(e);
    } else if (isDealBatch(events)) {
      this.clearToast();
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
    const promptAfter = pending !== null && pending.seat === this.viewer && pending.kind !== 'play';
    const timing: TurnTiming = { action: batch.action.type, ms, promptAfter };
    this.timings = [...this.timings.slice(-99), timing];
    log.info(`턴 시간 ${timing.action} ${ms}ms${promptAfter ? ' (프롬프트까지)' : ''}`);
  }

  // ---- 이벤트 부수 효과: 배너·토스트·효과음 (spec 6.5, FR-18) ----

  private nameOf(seat: Seat | null): string {
    return seat === null ? '' : this.names()[seat];
  }

  private showBanner(banner: Banner): void {
    this.bannerSeq += 1;
    this.banner = { ...banner, id: this.bannerSeq };
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    // spec 6.4: 350ms 표시 후 다음 단계와 겹쳐 사라진다
    this.bannerTimer = setTimeout(() => (this.banner = null), scaledMs(DUR.banner) + 1);
  }

  /** 짧은 알림. 일정 시간 뒤 사라진다(이슈 #6). 새 판 분배 때도 지운다 */
  showToast(text: string): void {
    this.toast = { id: (this.toast?.id ?? 0) + 1, text };
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(
      () => this.clearToast(),
      Math.max(scaledMs(TOAST_MS), TOAST_MIN_MS),
    );
  }

  private clearToast(): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.toast = null;
  }

  private onEvent(event: EngineEvent): void {
    const banner = bannerForEngineEvent(event);
    if (banner !== null) {
      this.showBanner(banner);
      sounds.play(BANNER_SOUND[banner.kind]);
      this.onBanner?.(banner.kind);
    }
    switch (event.type) {
      case 'CardPlayed':
        sounds.play('play');
        break;
      case 'CardFlipped':
      case 'CardDrawn':
        sounds.play('flip');
        break;
      case 'Dealt':
        sounds.play('deal');
        break;
      case 'Captured':
        sounds.play('capture');
        break;
      case 'PiStolen':
        sounds.play('steal');
        break;
      case 'InstantPayout':
        sounds.play('payout');
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
        sounds.play('end');
        break;
      case 'Shake':
        if (event.seat !== this.viewer) {
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
