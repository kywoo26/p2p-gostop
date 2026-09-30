// 이벤트 재생 큐 (spec 6.3·6.4, plan.md 1.6): 솔로·호스트·게스트가 같은 반응형 화면 상태를 쓴다.
// 액션 하나가 낸 이벤트 묶음(보는 좌석으로 가린 것)과 그 뒤의 권위 뷰를 큐에 넣으면, 보드 루트가 붙어 있을 때
// anim/choreo.ts로 재생하고 최신 뷰로 스냅한다. 판이 끝난 묶음(정산 포함)을 재생하면 정산 화면을 띄우고
// release()까지 다음 묶음을 멈춘다(다음 판 분배는 사용자가 "다음 판"을 누른 뒤에 보인다).
// 화면은 board·busy·banner·toast·timings·settlement만 읽는다. 사람/CPU/원격을 구분하지 않는다.
import {
  getCard,
  scoreCaptured,
  type Action,
  type EngineEvent,
  type ScoreBreakdown,
  type Seat,
} from '@p2p-gostop/engine';
import { tick } from 'svelte';
import { deal, planTurn, replay, skip, unskip, waitHold, type ReplayHost } from '../anim/choreo.ts';
import { baseMs, durationMs, scaledMs } from '../anim/durations.ts';
import type { BoardView } from '../lib/view-types.ts';
import { bannerForEngineEvent, completedJokbo, type Banner } from '../ui/banner.ts';
import { cardLabel } from '../ui/cards.ts';
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import type { SettlementDisplay } from './adapter.ts';
import { isDealBatch, snap, type DisplayBoard } from './display.ts';
import { log } from './log.svelte.ts';
import { sounds, type SoundKind } from './sound.ts';

/** 탭 → 그 액션의 이벤트 재생 끝까지 걸린 시간 (spec AC-06, 6.4 "탭부터 턴 종료까지") */
export interface TurnTiming {
  readonly action: Action['type'];
  /** 이벤트 단계의 이동·정지 계획 합(ms). 실측 시간과 분리한다. */
  readonly plannedMs: number;
  readonly ms: number;
  /** 같은 기기 단조 시계. enqueue는 수락/수신 이후 경계이며 wire ACK가 아니다. */
  readonly inputToEnqueueMs: number;
  readonly queueMs: number;
  readonly replayMs: number;
  readonly snapMs: number;
  /** 첫 재생 DOM commit 완료. 눌림 피드백·paint·NF-03 최초 응답과는 별개다. */
  readonly firstCommitMs: number;
  readonly steps: readonly { readonly kind: string; readonly ms: number }[];
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
  readonly enqueuedAt: number;
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

export interface PlaybackOptions {
  /** 보는 좌석 (배너·토스트 문구의 "내"/상대 구분) */
  readonly viewer: Seat;
  /** 좌석 이름 (토스트 문구) */
  readonly names: () => readonly [string, string];
  /** 큐가 비고 멈춤이 풀렸을 때 (솔로: CPU 차례 확인) */
  readonly onIdle?: (skipped: boolean) => void;
  /** 처음부터 정산 화면을 띄운다 (이어하기) */
  readonly settlement?: RoundSummary | null;
  /** 배너 이벤트 (진동 등 기기 피드백, spec 6.5) */
  readonly onBanner?: (kind: Banner['kind']) => void;
}

/** 정산 화면 입력: 정산 뷰 + 즉시 정산 줄 + 나가리 다음 판 배수 (FR-18, G9) */
export interface RoundSummary {
  /** 국진 위치(gukjin)는 판을 다 본 호스트·솔로만 넣는다 */
  readonly view: SettlementDisplay;
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
  /** ScoreChanged가 확정한 족보 완료. 재생 단계가 빠르게 이어져도 항목을 잃지 않는다. */
  milestones = $state.raw<
    readonly {
      readonly id: number;
      readonly round: number;
      readonly seat: Seat;
      readonly text: string;
    }[]
  >([]);
  timings = $state.raw<readonly TurnTiming[]>([]);
  /** 재생을 마친 판의 정산 화면. 떠 있는 동안 다음 묶음은 기다린다 */
  settlement = $state.raw<RoundSummary | null>(null);
  /** 재생할 묶음이 남아 있다 */
  pending = $state(0);

  private readonly viewer: Seat;
  private readonly names: () => readonly [string, string];
  private readonly onIdle: ((skipped: boolean) => void) | undefined;
  private readonly onBanner: ((kind: Banner['kind']) => void) | undefined;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private host: ReplayHost | null = null;
  private queue: Batch[] = [];
  private pumping = false;
  private generation = 0;
  private activeRoot: HTMLElement | null = null;
  /** 현재 재생 묶음에서 탭 스킵을 요청했는지, 다음 AI 생각 간격에 전달한다 */
  private skipped = false;
  private disposed = false;
  private bannerSeq = 0;
  private toastSeq = 0;
  private milestoneSeq = 0;
  private scoreRound: number;
  private previousScores: [ScoreBreakdown | null, ScoreBreakdown | null];
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: BoardView, options: PlaybackOptions) {
    this.viewer = options.viewer;
    this.names = options.names;
    this.onIdle = options.onIdle;
    this.onBanner = options.onBanner;
    this.board = $state.raw(snap(initial, initial.inFlight));
    this.scoreRound = initial.round;
    this.previousScores = this.initialScores(initial);
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
      // 마운트가 사라져도 수락된 정상 이벤트는 한 번씩 끝내고 최신 뷰로 스냅한다.
      if (this.activeRoot !== null) skip(this.activeRoot);
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
      enqueuedAt: performance.now(),
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
    if (this.disposed) return;
    this.invalidate();
    this.queue = [];
    this.pending = 0;
    this.board = snap(board, board.inFlight);
    this.scoreRound = board.round;
    this.previousScores = this.initialScores(board);
    this.milestones = [];
    this.settlement = settlement;
    this.skipped = false;
  }

  /** 남은 애니메이션을 즉시 끝낸다 (spec 6.3 "화면을 탭하면 즉시 완료") */
  skip(): void {
    if (this.busy && this.host !== null) {
      this.skipped = true;
      skip(this.host.root);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
    this.host = null;
    this.queue = [];
    this.pending = 0;
  }

  private invalidate(): void {
    this.generation += 1;
    if (this.activeRoot !== null) skip(this.activeRoot);
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    this.bannerTimer = null;
    this.banner = null;
    this.clearToast();
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    this.busy = true;
    let wasSkipped: boolean;
    try {
      while (this.settlement === null && !this.disposed) {
        const batch = this.queue.shift();
        if (batch === undefined) break;
        this.pending = this.queue.length;
        const generation = this.generation;
        const current = () => !this.disposed && generation === this.generation;
        const startedAt = performance.now();
        const measured = await this.play(batch, current);
        if (!current()) continue;
        // AC-06: 탭→턴 종료는 판 끝 대기(마지막 획득·배너를 읽을 시간) 전에 잰다
        this.recordTiming(batch, startedAt, measured);
        if (batch.events.some((e) => e.type === 'RoundEnded') && this.host !== null) {
          const root = this.host.root;
          this.activeRoot = root;
          try {
            await waitHold(root, baseMs('banner', root) * 2);
          } finally {
            if (!current() || this.host?.root !== root) unskip(root);
            this.activeRoot = null;
          }
        }
        if (!current()) continue;
        if (batch.settlement !== null) this.settlement = batch.settlement;
      }
    } catch (error) {
      log.error(`재생 오류: ${String(error)}`);
      const last = this.queue.at(-1);
      if (last !== undefined) this.board = last.board;
      this.queue = [];
      this.pending = 0;
    } finally {
      wasSkipped = this.skipped;
      this.skipped = false;
      this.pumping = false;
      this.busy = false;
      if (this.host !== null) unskip(this.host.root);
    }
    if (!this.disposed && this.idle) this.onIdle?.(wasSkipped);
  }

  /** 묶음 하나 재생 → 최신 뷰로 스냅 (spec 6.4) */
  private async play(batch: Batch, current: () => boolean) {
    const steps: { kind: string; ms: number }[] = [];
    let firstCommitAt: number | null = null;
    const commit = async (board: DisplayBoard) => {
      if (!current()) return;
      this.board = board;
      await tick();
      firstCommitAt ??= performance.now();
    };
    const events = batch.events;
    if (this.scoreRound !== batch.board.round) {
      this.scoreRound = batch.board.round;
      this.previousScores = this.initialScores(batch.board);
      this.milestones = [];
    }
    const attached = this.host;
    const host: ReplayHost | null =
      attached === null
        ? null
        : {
            root: attached.root,
            isCurrent: current,
            commit,
            onStep: (kind, ms) => {
              if (steps.length < 12) steps.push({ kind, ms: Math.round(ms) });
            },
            onEvent: (event) => {
              if (current()) this.onEvent(event);
            },
          };
    this.activeRoot = host?.root ?? null;
    try {
      if (host === null || this.disposed) {
        for (const e of events) this.onEvent(e);
      } else if (isDealBatch(events)) {
        this.clearToast();
        for (const e of events) this.onEvent(e);
        if (events.some((e) => e.type === 'FirstPicked')) {
          // 선 고르기 결과를 읽을 시간
          await waitHold(host.root, baseMs('banner', host.root) * 2);
        }
        if (!current())
          return {
            firstCommitAt,
            replayEndedAt: performance.now(),
            completedAt: performance.now(),
            steps,
          };
        await deal(host, batch.board);
      } else {
        await replay(host, this.board, events);
      }
      const replayEndedAt = performance.now();
      if (current()) await commit(batch.board);
      return { firstCommitAt, replayEndedAt, completedAt: performance.now(), steps };
    } finally {
      if (host !== null && (!current() || this.host?.root !== host.root)) unskip(host.root);
      this.activeRoot = null;
    }
  }

  private recordTiming(
    batch: Batch,
    startedAt: number,
    measured: {
      firstCommitAt: number | null;
      replayEndedAt: number;
      completedAt: number;
      steps: readonly { kind: string; ms: number }[];
    },
  ): void {
    const detail = `대기=${Math.round(startedAt - batch.enqueuedAt)} 재생=${Math.round(measured.replayEndedAt - startedAt)} 스냅=${Math.round(measured.completedAt - measured.replayEndedAt)} 단계=${measured.steps.map((s) => `${s.kind}:${s.ms}`).join('/') || 'none'}`;
    if (batch.tapAt === null || batch.action === null) {
      // 상대 입력 시각·ACK가 없으므로 상대 탭 시간이나 네트워크 지연으로 표기하지 않는다.
      const played = batch.events.find(
        (e) => e.type === 'CardPlayed' || e.type === 'Bomb' || e.type === 'CardFlipped',
      );
      if (played !== undefined)
        log.info(
          `재생 시간 관측=${played.seat === this.viewer ? '내좌석' : '상대'} 수신이후=${Math.round(measured.completedAt - batch.enqueuedAt)}ms ${detail}`,
        );
      return;
    }
    const ms = Math.round(measured.completedAt - batch.tapAt);
    const plannedMs = planTurn(
      batch.events,
      document.documentElement.dataset['speed'] === 'normal',
    ).plannedMs;
    const pending = batch.board.pending;
    const promptAfter = pending !== null && pending.seat === this.viewer && pending.kind !== 'play';
    const timing: TurnTiming = {
      action: batch.action.type,
      plannedMs,
      ms,
      promptAfter,
      inputToEnqueueMs: Math.round(batch.enqueuedAt - batch.tapAt),
      queueMs: Math.round(startedAt - batch.enqueuedAt),
      replayMs: Math.round(measured.replayEndedAt - startedAt),
      snapMs: Math.round(measured.completedAt - measured.replayEndedAt),
      firstCommitMs: Math.round((measured.firstCommitAt ?? measured.completedAt) - batch.tapAt),
      steps: measured.steps,
    };
    this.timings = [...this.timings.slice(-99), timing];
    log.info(
      `턴 시간 ${timing.action} ${ms}ms${promptAfter ? ' (프롬프트까지)' : ''} 입력→큐=${timing.inputToEnqueueMs} ${detail} 첫commit=${timing.firstCommitMs} 계획=${plannedMs} 속도=${document.documentElement.dataset['speed'] ?? 'fast'}`,
    );
  }

  // ---- 이벤트 부수 효과: 배너·토스트·효과음 (spec 6.5, FR-18) ----

  private nameOf(seat: Seat | null): string {
    return seat === null ? '' : this.names()[seat];
  }

  private showBanner(banner: Banner): void {
    this.bannerSeq += 1;
    this.banner = { ...banner, id: this.bannerSeq };
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    // 사건 문구는 빠름 350ms / 보통 900ms 동안 읽을 수 있게 남긴다.
    this.bannerTimer = setTimeout(() => (this.banner = null), durationMs('banner') + 1);
  }

  /** 짧은 알림. 일정 시간 뒤 사라진다(이슈 #6). 새 판 분배 때도 지운다 */
  showToast(text: string): void {
    // 반응형 값(toast)을 읽지 않는다: 게임판 효과(onnotice) 안에서 불려도 그 효과가 toast에 묶이지 않게
    this.toastSeq += 1;
    this.toast = { id: this.toastSeq, text };
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
    if (event.type === 'ScoreChanged' && event.seat !== null) {
      const before = this.previousScores[event.seat];
      const after = event.breakdown;
      if (before !== null) {
        const text = completedJokbo(before, after);
        if (text !== null)
          this.milestones = [
            ...this.milestones,
            { id: ++this.milestoneSeq, round: this.scoreRound, seat: event.seat, text },
          ];
      }
      this.previousScores[event.seat] = after;
    }
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

  private initialScores(board: BoardView): [ScoreBreakdown | null, ScoreBreakdown | null] {
    const empty = scoreCaptured({ gwang: [], yeol: [], tti: [], pi: [] }, false);
    return ([0, 1] as const).map((seat) => (board.seats[seat].score === 0 ? empty : null)) as [
      ScoreBreakdown | null,
      ScoreBreakdown | null,
    ];
  }
}
