// 게스트 모드 (spec 2.2·2.3·2.4, FR-04·05·30, NP-02~06·09, NF-04·05). 좌석 1 = 이 기기(iPhone Safari).
// - protocol GuestSession(v3)이 hello·커밋 교환·순번·재동기화·공정성 검증을 맡는다. 호스트 이벤트는 이미 좌석 1로 가려져 있다.
// - 화면은 솔로·호스트와 같은 재생 큐(Playback)로 이벤트 묶음을 재생하고 스냅샷으로 보정한다(spec 6.4). 게스트 화면은
//   guest.view와 view.legal만 보고 액션을 만든다(호스트가 다시 검사한다).
// - 세션 토큰·이름은 URL 프래그먼트(#g=…&n=…), 커밋·관찰 기록은 탭 수명 저장소(sessionStorage)에만 둔다(MN-05: 게스트
//   origin은 세션마다 바뀐다). 새로고침·탭 복원 뒤에도 같은 토큰으로 돌아오고 그 판도 검증된다(docs/protocol.md 6장).
import {
  sameAction,
  type Action,
  type EngineEvent,
  type RuleOptions,
  type Seat,
} from '@p2p-gostop/engine';
import {
  decode,
  GuestSession,
  type BoardView,
  type GuestConnection,
  type GuestSessionState,
  type HostMessage,
  type LedgerSummary,
  type RoundCheck,
  type SessionStage,
  type Transport,
  type DecisionClock,
  type TimerSettings,
} from '@p2p-gostop/protocol';
import {
  AutoChoice,
  type GameController,
  type GameStats,
  type PushDecision,
} from '../game/controller.ts';
import { log } from '../game/log.svelte.ts';
import { Playback, type RoundSummary } from '../game/playback.svelte.ts';
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import { WsTransport } from '../net/index.ts';
import { emptyBoard, random32 } from './common.ts';
import { linkStateOf, openLink, type LinkState } from './link.ts';
import type { RelayAddress } from './role.ts';
import { saveGuestState, writeTicket, type GuestTicket } from './ticket.ts';

const ME: Seat = 1;
/** NP-03·NF-05: 5초 응답 기한을 1초 해상도로 확인한다. */
const CLOCK_MS = 500;

export type GuestPhase = 'lobby' | 'playing' | 'ended' | 'rejected';

export interface LobbyInfo {
  readonly names: readonly [string, string];
  readonly rules: RuleOptions;
  readonly ledger: LedgerSummary;
  readonly timerSettings: TimerSettings;
}

export interface GuestOptions {
  readonly name: string;
  readonly token?: string | null;
  /** 새로고침 전 GuestSession.toJSON() (sessionStorage) */
  readonly restore?: GuestSessionState | null;
  readonly address?: RelayAddress;
  /** 테스트용 전송 (주면 WebSocket을 열지 않는다) */
  readonly transport?: Transport;
  /** 토큰을 받으면 (LAN 기본: URL 프래그먼트, 원격: URL에 쓰지 않음) */
  readonly onTicket?: (ticket: GuestTicket) => void;
  /** false면 sessionStorage에 두지 않는다 (테스트) */
  readonly persist?: boolean;
  /** 테스트에서 시계를 직접 움직인다. */
  readonly clock?: boolean;
  readonly now?: () => number;
}

interface Awaiting {
  readonly action: Action;
  readonly tapAt: number;
}

const CHECK_LABEL: Readonly<Record<RoundCheck['result'], string>> = {
  verified: '셔플 공정성 검증 통과',
  aborted: '판 무효 (검증 대상 아님)',
  unverifiable: '검증 불가 (새로고침으로 기록을 잃음)',
  failed: '공정성 검증 실패',
};

export class GuestGame implements GameController {
  readonly mode = 'guest' as const;
  link = $state<LinkState>('connecting');
  /** 중계 알림으로 본 호스트 소켓 (알림이 없는 중계면 null) */
  hostPresent = $state<boolean | null>(null);
  connection = $state<GuestConnection>('idle');
  lobby = $state.raw<LobbyInfo | null>(null);
  stage = $state<SessionStage | null>(null);
  error = $state<string | null>(null);
  bankruptSeats = $state.raw<readonly Seat[]>([]);
  endReason = $state<'bankruptcy' | 'host' | null>(null);
  roundsPlayed = $state(0);
  balances = $state.raw<readonly [number, number]>([0, 0]);
  refilled = $state.raw<readonly [number, number]>([0, 0]);
  seq = $state(0);
  checks = $state.raw<readonly RoundCheck[]>([]);
  /** 정산 뒤 다음 판을 요청했다 */
  ready = $state(false);
  /** 보낸 액션의 응답을 기다리는 중 */
  private awaiting = $state.raw<Awaiting | null>(null);
  private started = $state(false);
  readonly playback: Playback;
  readonly name: string;

  private readonly session: GuestSession;
  private readonly ws: { dispose(): void; reconnect(force?: boolean): void } | null;
  private readonly onTicket: (ticket: GuestTicket) => void;
  private readonly persist: boolean;
  private readonly now: () => number;
  private clock: ReturnType<typeof setInterval> | null = null;
  private prevSeq = 0;
  private settledRound = 0;
  private pushPending = $state(false);
  private roundInstant: EngineEvent[] = [];
  private disposed = false;
  private autoHeld = true;
  private timerVersion = $state(0);
  private clockReceivedAt = 0;
  private lastClockRevision = -1;
  private lastClockHostNow = -1;
  private suspectedDecision: string | null = null;
  private readonly autoChoice = new AutoChoice(
    () => ({ view: this.view, ready: !this.autoHeld && this.canAct && this.hostPresent !== false }),
    (action) => this.submit(action),
    (action) => {
      if (action.type !== 'chooseTarget') this.playback.showToast('유일한 수 자동 진행');
    },
  );

  constructor(options: GuestOptions) {
    this.name = options.name;
    this.onTicket =
      options.onTicket ?? (options.transport instanceof WsTransport ? () => {} : writeTicket);
    this.persist = options.persist ?? true;
    this.now = options.now ?? (() => performance.now());
    let inner: Transport;
    if (options.transport) {
      inner = options.transport;
      if (options.transport instanceof WsTransport) {
        const remote = options.transport;
        const off = remote.onConnection((event) => {
          const state = linkStateOf(event);
          if (state !== null) this.onLinkState(state);
        });
        this.ws = {
          dispose: off,
          reconnect: (force) => remote.reconnect(force),
        };
        this.link = remote.state === 'open' ? 'open' : 'connecting';
      } else {
        this.ws = null;
        this.link = 'open';
      }
    } else {
      const ws = openLink({
        role: 'guest',
        ...(options.address ? { address: options.address } : {}),
        log: (line) => log.info(`게스트 ${line}`),
        onState: (state) => this.onLinkState(state),
      });
      this.ws = ws;
      inner = ws;
    }
    this.playback = new Playback(emptyBoard(ME, ['호스트', options.name], [0, 0]), {
      viewer: ME,
      names: () => this.names,
    });
    // 세션 처리 앞뒤로 받은 메시지를 본다: 이벤트 목록은 세션이 들고 있지 않으므로 화면이 여기서 받는다
    const transport: Transport = {
      send: (message) => inner.send(message),
      onMessage: (handler) =>
        inner.onMessage((raw) => {
          this.prevSeq = this.session.seq;
          handler(raw);
          this.after(raw);
        }),
      onClose: (handler) => inner.onClose(handler),
      reconnect: () => inner.reconnect(),
      ...(inner.onRelay ? { onRelay: inner.onRelay.bind(inner) } : {}),
    };
    this.session = new GuestSession(transport, {
      name: options.name,
      random32,
      ...(options.token ? { sessionToken: options.token } : {}),
      ...(options.restore ? { restore: options.restore } : {}),
      log: (line) => log.info(`게스트 세션 ${line}`),
    });
    this.session.onChange(() => this.sync());
    this.session.advanceTime(this.now());
    this.session.join();
    if (options.clock ?? true) {
      this.clock = setInterval(() => this.tick(), CLOCK_MS);
      document.addEventListener('visibilitychange', this.onVisible);
    }
    log.info(`게스트 참가 요청: ${options.name}${options.token ? ' (토큰으로 복귀)' : ''}`);
  }

  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') {
      this.tick();
      // 소켓이 열린 채 숨김→복귀할 때도 hello로 재인증·snapshot·새 offer를 요청한다.
      this.session.join();
      this.decisionRendered();
    } else this.session.decisionUnavailable('background');
  };

  /** 응답이 없는 요청과 hello 재시도 기한을 진행한다. */
  tick(): void {
    if (this.disposed) return;
    this.session.advanceTime(this.now());
    const clock = this.session.decision;
    if (
      clock?.state === 'running' &&
      this.now() - this.clockReceivedAt >= clock.remainingMs + 2_000
    ) {
      const key = `${clock.key.epoch}:${clock.key.decisionId}:${clock.attempt}`;
      if (this.suspectedDecision !== key) {
        this.suspectedDecision = key;
        this.session.decisionUnavailable('resync');
        this.session.join();
      }
    }
    this.timerVersion++;
  }

  // ---- 표시 값 ----

  get names(): readonly [string, string] {
    return this.lobby?.names ?? ['호스트', this.name];
  }
  get decisionClock(): DecisionClock | null {
    void this.timerVersion;
    return this.session.decision;
  }
  get timeoutResult() {
    void this.timerVersion;
    return this.session.timeoutHistory.at(-1) ?? null;
  }
  get timerDecisionMs(): number | null {
    void this.timerVersion;
    return this.session.timerSettings?.decisionMs ?? null;
  }
  get timerRemainingMs(): number | null {
    const clock = this.decisionClock;
    if (clock === null) return null;
    if (clock.state !== 'running') return clock.remainingMs;
    return Math.max(0, clock.remainingMs - Math.max(0, this.now() - this.clockReceivedAt));
  }
  get timerUncertain(): boolean {
    void this.timerVersion;
    const clock = this.session.decision;
    return (
      clock !== null &&
      this.suspectedDecision === `${clock.key.epoch}:${clock.key.decisionId}:${clock.attempt}`
    );
  }
  decisionRendered(): void {
    if (
      this.link !== 'open' ||
      this.hostPresent === false ||
      !this.playback.idle ||
      document.visibilityState !== 'visible'
    )
      return;
    const seq = this.playback.board.eventSeq;
    this.session.decisionReady(seq);
    this.session.ackExpiry(seq, true);
  }

  get phase(): GuestPhase {
    if (this.endReason !== null) return 'ended';
    if (this.connection === 'tokenRejected') return 'rejected';
    return this.started ? 'playing' : 'lobby';
  }

  private get view(): BoardView | null {
    void this.seq;
    return this.session.view;
  }

  get bankrupt(): boolean {
    return this.bankruptSeats.includes(ME);
  }

  get pushDecision(): PushDecision | null {
    const view = this.view;
    if (
      this.stage !== 'settled' ||
      this.session.settlement !== null ||
      this.playback.settlement !== null ||
      view?.phase !== 'end'
    )
      return null;
    const canPush = view.legal.some((action) => action.type === 'push' && action.seat === ME);
    return {
      winner: canPush,
      canPush,
      nextMultiplier: 2 ** ((view.pushes ?? 0) + 1),
      acceptAmount: null,
      forfeitedPoints: null,
    };
  }

  get canAct(): boolean {
    void this.timerVersion;
    const view = this.view;
    return (
      this.phase === 'playing' &&
      this.stage === 'playing' &&
      this.link === 'open' &&
      this.awaiting === null &&
      this.playback.idle &&
      view !== null &&
      view.legal.length > 0 &&
      this.session.decisionInputReady &&
      !this.timerUncertain
    );
  }

  get thinking(): boolean {
    const view = this.view;
    return (
      this.stage === 'playing' &&
      this.awaiting === null &&
      this.playback.idle &&
      view !== null &&
      view.pending !== null &&
      view.legal.length === 0
    );
  }

  get notice(): string | null {
    if (this.error !== null) return this.error;
    if (this.endReason !== null)
      return this.endReason === 'host' ? '호스트가 대전을 끝냈습니다' : '세션이 끝났습니다';
    if (this.link === 'replaced') return '다른 창에서 이 게임을 열었습니다';
    if (this.link !== 'open') return '호스트에 다시 연결하는 중…';
    if (this.hostPresent === false) return '호스트 앱이 연결되어 있지 않습니다';
    if (this.timerUncertain) return '호스트 응답 대기 · 시간 확인 중';
    const clock = this.decisionClock;
    if (clock?.state === 'paused')
      return clock.pauseReason === 'clockUnknown'
        ? '호스트 대기 · 시간 확인 필요'
        : '호스트 대기 · 남은 시간 보존';
    if (clock?.state === 'checking') return '시간 종료 · 연결 확인 중';
    if (this.stage === 'handshake' && this.playback.idle) return '판을 나누는 중…';
    if (this.stage === 'settled' && this.ready && this.playback.idle)
      return '호스트가 다음 판을 시작하기를 기다리는 중';
    if (this.pushPending) return '밀기 요청을 보내는 중…';
    if (this.awaiting !== null && this.playback.idle) return '보내는 중…';
    return null;
  }

  /** 정산 화면 안내: 이 판의 셔플 검증 결과(NP-06)와 상대 파산 선택 대기 */
  get settlementNote(): string | null {
    const lines: string[] = [];
    const round = this.settledRound;
    const check = this.checks.findLast((c) => c.round === round);
    if (check !== undefined) lines.push(`${round}판 ${CHECK_LABEL[check.result]}`);
    if (check?.result === 'verified' && check.time === 'verified') lines.push('시간 기록 일치');
    if (check?.result === 'verified' && check.time === 'unverifiable')
      lines.push('시간 검증 불가 (관찰 기록 없음)');
    if (this.stage === 'bankrupt' && !this.bankrupt)
      lines.push(`${this.names[0]}의 재충전·종료 선택을 기다리는 중`);
    if (this.endReason !== null) lines.push(this.notice ?? '세션이 끝났습니다');
    return lines.length > 0 ? lines.join(' · ') : null;
  }

  get settlementWaiting(): boolean {
    return this.stage === 'bankrupt' && !this.bankrupt;
  }

  get stats(): GameStats {
    return {
      round: this.view?.round ?? 0,
      phase:
        this.phase === 'ended'
          ? 'ended'
          : this.stage === 'bankrupt'
            ? 'bankrupt'
            : this.playback.settlement !== null
              ? 'roundOver'
              : 'playing',
      roundsPlayed: this.roundsPlayed,
      balances: this.balances,
      refilled: this.refilled,
      startBalance: this.lobby?.ledger.startBalance ?? 0,
      seq: this.seq,
    };
  }

  get token(): string | null {
    return this.session.token ?? null;
  }

  // ---- 수신 ----

  /** 세션 상태를 화면 상태로 옮긴다 (onChange) */
  private sync(): void {
    const s = this.session;
    this.connection = s.connection;
    this.hostPresent = s.hostPresent;
    this.stage = s.status?.stage ?? null;
    this.bankruptSeats = s.bankruptcy?.seats ?? [];
    this.endReason = s.ended?.reason ?? null;
    this.checks = [...s.checks];
    if (s.ledger !== null) {
      this.balances = s.ledger.balances;
      this.refilled = s.ledger.recharged;
    }
    if (s.names !== null && s.rules !== null && s.ledger !== null && s.timerSettings !== null)
      this.lobby = {
        names: s.names,
        rules: s.rules,
        ledger: s.ledger,
        timerSettings: s.timerSettings,
      };
    if (this.stage !== 'settled') this.ready = false;
    if (s.settlement !== null || this.stage !== 'settled') this.pushPending = false;
    if (this.persist) saveGuestState(this.name, s.toJSON());
    this.seq = s.seq;
    if (
      s.decision !== null &&
      (s.decision.timerRev !== this.lastClockRevision ||
        s.decision.hostNowMs !== this.lastClockHostNow)
    ) {
      this.lastClockRevision = s.decision.timerRev;
      this.lastClockHostNow = s.decision.hostNowMs;
      this.clockReceivedAt = this.now();
      this.suspectedDecision = null;
    }
    this.timerVersion++;
  }

  private after(raw: string): void {
    const parsed = decode(raw, 'host');
    if (!parsed.ok) return;
    this.handle(parsed.message);
    this.sync();
  }

  private handle(m: HostMessage): void {
    const s = this.session;
    switch (m.t) {
      case 'welcome':
        this.error = null;
        this.onTicket({ token: m.sessionToken, name: this.name });
        break;
      case 'events':
        if (s.seq !== m.to || this.prevSeq >= m.to) break;
        this.onEvents(m.list, m.view);
        this.maybeSettled(m.view);
        break;
      case 'snapshot':
        // GuestSession은 순번이 뒤로 가지 않는 스냅샷만 받는다(호스트 복원은 welcome의 세대로 되감는다)
        if (s.seq !== m.seq) break;
        this.awaiting = null;
        this.started = true;
        this.playback.enqueue([], m.view);
        this.maybeSettled(m.view);
        break;
      case 'expiryCheck':
        // 확인 프레임에는 새 뷰가 없으므로 이미 재생을 마친 최신 뷰로 바로 답한다.
        this.decisionRendered();
        break;
      case 'reject':
        this.awaiting = null;
        this.pushPending = false;
        log.warn(`호스트 거절: ${m.reason}`);
        if (m.reason === 'TOKEN_INVALID') {
          this.error = '이미 다른 사람이 참가 중이거나 호스트가 새 방을 열었습니다';
          this.onTicket({ token: null, name: this.name });
        } else if (m.reason === 'VERSION_MISMATCH') {
          this.error = '호스트 앱과 버전이 다릅니다. 페이지를 새로 고치세요';
        }
        break;
      case 'revealHost': {
        const check = s.checks.findLast((c) => c.round === m.round);
        if (check?.result === 'failed') {
          log.error(`${m.round}판 공정성 검증 실패: ${check.reason}`);
          this.playback.showToast(`${m.round}판 공정성 검증 실패`);
        } else if (check !== undefined) log.info(`${m.round}판 셔플 검증: ${check.result}`);
        break;
      }
      case 'sessionEnd':
        log.info(`세션 종료 알림: ${m.reason}`);
        if (s.view !== null) {
          const summary = this.settlementSummary();
          if (summary !== null) this.playback.reset(s.view, summary);
        }
        break;
      default:
        break;
    }
  }

  private onEvents(list: readonly EngineEvent[], view: BoardView): void {
    if (list.some((e) => e.type === 'Dealt')) this.roundInstant = [];
    for (const e of list) if (e.type === 'InstantPayout') this.roundInstant.push(e);
    // 보낸 액션 뒤의 첫 묶음이 그 응답이다 (좌석 1은 자기 차례에만 보낸다). 탭→재생 끝 시간을 잰다(AC-06)
    const awaiting = this.awaiting;
    this.playback.enqueue(list, view, {
      action: awaiting?.action ?? null,
      tapAt: awaiting?.tapAt ?? null,
    });
    this.awaiting = null;
    this.started = true;
  }

  /** 판이 끝났다(settled·bankrupt, 정산이 실린 뷰): 정산 화면을 한 번 띄운다 */
  private maybeSettled(view: BoardView): void {
    const s = this.session;
    const stage = s.status?.stage;
    if (stage !== 'settled' && stage !== 'bankrupt') return;
    if (this.settledRound === view.round) return;
    const summary = this.settlementSummary();
    if (summary === null) return;
    this.settledRound = view.round;
    this.roundsPlayed += 1;
    this.playback.enqueue([], view, { settlement: summary });
  }

  private settlementSummary(): RoundSummary | null {
    const s = this.session;
    const settlement = s.settlement;
    if (settlement === null) return null;
    const names = this.names;
    return {
      view: { ...settlement, names },
      instant: this.roundInstant.flatMap((e) =>
        e.type === 'InstantPayout' && e.seat !== null
          ? [{ label: INSTANT_LABEL[e.kind] ?? e.kind, name: names[e.seat], points: e.points }]
          : [],
      ),
      nextCarry: settlement.winner === null ? (s.status?.carry ?? null) : null,
    };
  }

  private onLinkState(state: LinkState): void {
    this.link = state;
    if (state === 'replaced') log.warn('다른 창이 게스트 연결을 가져갔습니다 (4001)');
    if (state !== 'open') {
      this.awaiting = null;
      this.session.decisionUnavailable('resync');
    }
  }

  // ---- 입력 ----

  submit(action: Action, tapAt: number = performance.now()): boolean {
    if (!this.canAct || action.seat !== ME) return false;
    if (!this.view?.legal.some((a) => sameAction(a, action))) return false;
    this.awaiting = { action, tapAt };
    this.session.sendAction(action);
    return true;
  }

  skipAnimations(): void {
    this.playback.skip();
  }

  attach(root: HTMLElement | null): void {
    this.playback.attach(root);
  }

  autoAdvance(held: boolean): void {
    this.autoHeld = held;
    this.autoChoice.advance(held);
  }

  /** 정산 화면 → 다음 판 요청 (시작은 호스트, #26) */
  nextRound(): void {
    if (this.stage === 'bankrupt' || this.pushDecision !== null) return;
    this.playback.release();
    this.ready = true;
    this.session.requestNextRound();
  }

  choosePush(push: boolean): void {
    if (!this.pushDecision?.winner || this.pushPending || this.ready || this.link !== 'open')
      return;
    if (push) {
      this.pushPending = true;
      this.session.push();
    } else {
      this.ready = true;
      this.session.requestNextRound();
    }
  }

  refill(): void {
    if (this.bankrupt) this.session.chooseBankruptcy('recharge');
  }

  /** MN-02: 파산한 게스트 좌석의 종료 선택을 호스트에 보낸다. */
  endBankruptcy(): void {
    if (this.bankrupt && this.stage === 'bankrupt') this.session.chooseBankruptcy('end');
  }

  /** 끊긴 연결을 사용자가 되살린다: 교체(4001) 뒤 다시 연결, 토큰 거절이면 새 게스트로 */
  reconnect(): void {
    this.error = null;
    if (this.session.connection === 'tokenRejected') {
      this.session.joinFresh();
      return;
    }
    this.ws?.reconnect(true);
    this.session.join();
  }

  /** 진단 로그를 호스트로 올린다 (FR-30, NP-09: 줄 2KB·메시지 64KB 바이트 상한은 GuestSession이 자른다) */
  uploadLogs(lines: readonly string[]): number {
    if (this.link !== 'open') return 0;
    this.session.sendLogs(lines);
    return lines.length;
  }

  end(): void {
    if (this.disposed) return;
    this.onTicket({ token: null, name: this.name });
    if (this.persist) saveGuestState(this.name, null);
    log.info('게스트 나가기');
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.autoChoice.dispose();
    if (this.clock !== null) clearInterval(this.clock);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.ws?.dispose();
    this.playback.dispose();
  }
}
