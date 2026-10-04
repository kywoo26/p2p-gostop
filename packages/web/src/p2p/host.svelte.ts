import { isSocialFrame } from '@p2p-gostop/protocol';
import {
  EMPTY_SOCIAL,
  SocialConversation,
  type SocialControl,
  type SocialView,
} from '../game/social-compose.ts';
import type { AcceptedPlayTarget } from '@p2p-gostop/protocol';
// 호스트 모드 (spec 2.1·2.3·2.4, FR-01~07·11, MN-01·02·05, NP-02~06). 좌석 0 = 이 기기, 좌석 1 = 원격 게스트.
// - 로비: 게스트의 hello가 오면 그 이름으로 protocol HostSession(autoStart:false)을 만들어 welcome을 보낸다.
//   규칙·금액·이름이 바뀌면 같은 토큰으로 세션을 다시 만들고 마지막 hello를 다시 넘겨 welcome을 새로 보낸다.
//   "시작"은 HostSession.start()다(로비 이후 토큰 없는 접속은 세션이 거절한다, NF-06).
// - 게임: HostSession(v3)이 권위 엔진·원장·판 사이 대기(settled)·파산·재동기화를 맡는다. 화면은 솔로와 같은
//   재생 큐(Playback)를 쓴다. 호스트 좌석이 볼 이벤트는 게스트로 나가는 events를 전송 층에서 지켜보며 같은 액션을
//   엔진 reduce로 다시 계산해(순수 함수) 좌석 0으로 가린다. 판이 끝나면(settled·bankrupt) 정산 화면을 띄운다.
// - 연결: 중계 알림(WsTransport onRelay)과 60초 시계(NP-05)로 게스트 연결을 보이고, 3분 넘게 돌아오지 않으면
//   계속 기다릴지 묻는다(spec 2.4).
// - 저장: 바뀔 때마다 HostSession.toJSON()을 localStorage(127.0.0.1 고정 origin)에 둔다. 이어하기는 fromJSON으로
//   진행 중인 판까지 되살린다(MN-05, docs/protocol.md 7장).
import {
  legalActions,
  type Action,
  type EngineEvent,
  type GameState,
  type Seat,
} from '@p2p-gostop/engine';
import {
  decode,
  HostSession,
  summarizeLedger,
  type BoardView,
  type HostMessage,
  type Message,
  type RelayNotice,
  type SessionStage,
  type Transport,
  type DecisionClock,
} from '@p2p-gostop/protocol';
import { getBridge } from '../bridge/bridge.ts';
import { pushOffer, toRecordRow } from '../game/adapter.ts';
import {
  AutoChoice,
  latestBalanceChanges,
  remoteResultKey,
  remoteResultVisible,
  type GameController,
  type GameStats,
  type PushDecision,
  type DisplayRoundResult,
  type RemoteRoundResult,
} from '../game/controller.ts';
import { log } from '../game/log.svelte.ts';
import { Playback, type RoundSummary } from '../game/playback.svelte.ts';
import type { RecordRow } from '../lib/view-types.ts';
import { WsTransport } from '../net/index.ts';
import { emptyBoard, random32, randomHex, vibrateFor } from './common.ts';
import { linkStateOf, openLink, type LinkState, type RelayPeer } from './link.ts';
import type { RelayAddress } from './role.ts';
import { HostSaveStore, saveTimerPreference, type HostConfig, type HostSave } from './host-save.ts';
import {
  hostBoard,
  hostEvents,
  hostSummary,
  pendingHostSummary,
  type PendingAction,
} from './host-view.ts';
import { SessionPort } from './session-port.ts';

// 호출자의 공개 import 경로를 유지한다.
export { loadHostSave, clearHostSave, type HostConfig, type HostSave } from './host-save.ts';

const ME: Seat = 0;
const GUEST: Seat = 1;
/** spec 2.4: 게스트가 이만큼 돌아오지 않으면 호스트에 선택지를 보인다 */
const WAIT_PROMPT_MS = 3 * 60_000;
/** NP-05 시계 주기 (60초 판정의 해상도) */
const CLOCK_MS = 500;

export type HostPhase = 'lobby' | 'playing' | 'ended';

export interface HostOptions {
  readonly config: HostConfig;
  /** 이어하기 (저장된 세션) */
  readonly resume?: HostSave | null;
  readonly address?: RelayAddress;
  /** 테스트용 전송 (주면 WebSocket을 열지 않는다) */
  readonly transport?: Transport;
  readonly clock?: boolean;
  readonly now?: () => number;
  /** false면 저장하지 않는다 (테스트) */
  readonly persist?: boolean;
}

export class HostGame implements GameController {
  get balanceChanges(): readonly [number, number] {
    return latestBalanceChanges(this.session?.ledger.entries ?? []);
  }
  get perPoint(): number {
    return this.session?.ledger.perPoint ?? this.config.perPoint;
  }
  readonly mode = 'host' as const;
  link = $state<LinkState>('connecting');
  /** 게스트가 hello에 적은 이름 */
  guestName = $state<string | null>(null);
  /** 중계 알림으로 본 게스트 소켓 (알림이 없는 중계면 null) */
  peer = $state<RelayPeer | null>(null);
  config: HostConfig;
  timerSaveFailed = $state(false);
  stage = $state<SessionStage>('lobby');
  roundsPlayed = $state(0);
  balances = $state.raw<readonly [number, number]>([0, 0]);
  refilled = $state.raw<readonly [number, number]>([0, 0]);
  seq = $state(0);
  records = $state.raw<readonly RecordRow[]>([]);
  /** 게스트가 끊긴 시각 (재접속하면 null) */
  offlineSince = $state<number | null>(null);
  /** 3분 대기 선택지 (spec 2.4) */
  waitPrompt = $state(false);
  private timerWaitDismissed = false;
  /** 게스트가 settled에서 다음 판을 요청했다 */
  guestReady = $state(false);
  /** 파산으로 선택을 기다리는 좌석 */
  bankruptSeats = $state.raw<readonly Seat[]>([]);
  /** 반응형 갱신 신호 (세션의 일반 필드가 바뀔 때) */
  private version = $state(0);
  readonly playback: Playback;
  readonly token: string;

  private session: HostSession | null = null;
  private port: SessionPort | null = null;
  private readonly transport: Transport;
  private readonly ws: { dispose(): void; reconnect(force?: boolean): void } | null;
  private readonly resume: HostSave | null;
  private readonly now: () => number;
  private readonly saves: HostSaveStore;
  private lastHello: string | null = null;
  private pending: PendingAction | null = null;
  private settledRound = 0;
  private clock: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private socialView = $state.raw<SocialView>(EMPTY_SOCIAL);
  private readonly conversation: SocialConversation;
  get social(): SocialControl {
    return {
      view: this.socialView,
      send: (body) => {
        this.syncSocial();
        return this.conversation.send(body);
      },
      mute: (value) => this.conversation.mute(value),
      open: () => {
        this.syncSocial();
        this.conversation.open();
      },
      validate: (text) => this.conversation.validate(text),
    };
  }

  private roundResults = $state.raw<readonly RemoteRoundResult[]>([]);
  private autoHeld = true;
  private readonly autoChoice = new AutoChoice(
    () => ({ view: this.board(), ready: !this.autoHeld && this.canAct && this.link === 'open' }),
    (action) => this.submit(action),
    (action) => {
      if (action.type !== 'chooseTarget') this.playback.showToast('유일한 수 자동 진행');
    },
  );

  constructor(options: HostOptions) {
    this.config = $state.raw(options.resume?.config ?? options.config);
    this.resume = options.resume ?? null;
    this.now = options.now ?? (() => performance.now());
    this.saves = new HostSaveStore(options.persist ?? true);
    this.token = this.resume?.state.token ?? randomHex();
    this.balances = this.resume?.state.ledger.balances ?? [
      this.config.startBalance,
      this.config.startBalance,
    ];
    this.records = this.resume?.records ?? [];
    this.roundsPlayed = this.records.length;
    if (options.transport) {
      this.transport = options.transport;
      if (options.transport instanceof WsTransport) {
        const remote = options.transport;
        const off = remote.onConnection((event) => {
          const state = linkStateOf(event);
          if (state !== null) {
            this.link = state;
            this.syncSocial();
          }
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
        role: 'host',
        ...(options.address ? { address: options.address } : {}),
        log: (line) => log.info(`호스트 ${line}`),
        onState: (state) => {
          this.link = state;
          this.syncSocial();
          if (state === 'replaced') log.warn('다른 창이 호스트 연결을 가져갔습니다 (4001)');
        },
      });
      this.ws = ws;
      this.transport = ws;
    }
    this.conversation = new SocialConversation({
      now: this.now,
      nonce: () => randomHex(16),
      send: (frame) => this.transport.sendEphemeral?.(frame) ?? false,
      publish: (view) => {
        this.socialView = view;
      },
    });
    this.transport.onMessage((raw) => this.incoming(raw));
    this.transport.onClose(() => {
      // 닫힘도 입력과 같은 단조 시각에서 처리한다. 오래된 tick으로 잔여 예산을 환급하지 않는다.
      this.session?.advanceTime(this.now());
      this.port?.closes.forEach((h) => h());
      this.syncSocial();
    });
    this.transport.onRelay?.((notice) => this.onRelay(notice));
    this.playback = new Playback(emptyBoard(ME, this.names, this.balances), {
      viewer: ME,
      names: () => this.names,
      onBanner: vibrateFor,
    });
    document.addEventListener('visibilitychange', this.onSocialVisibility);
    if (options.clock ?? true) this.clock = setInterval(() => this.tick(), CLOCK_MS);
    if (options.clock ?? true) document.addEventListener('visibilitychange', this.onVisible);
  }
  private syncSocial(): void {
    const session = this.session;
    this.conversation?.sync({
      epoch: session?.epoch ?? '',
      authenticated:
        !this.disposed &&
        session?.authenticated === true &&
        session.state !== null &&
        ['playing', 'settled', 'bankrupt'].includes(session.stage),
      connected:
        this.link === 'open' &&
        session?.connected === true &&
        this.peer !== 'left' &&
        this.peer !== 'absent',
      visible: document.visibilityState === 'visible',
    });
  }

  private readonly onSocialVisibility = () => this.syncSocial();

  private readonly onVisible = () => {
    this.syncSocial();
    const session = this.session;
    if (session === null) return;
    session.advanceTime(this.now());
    if (document.visibilityState !== 'visible') session.pauseDecision('hostBackground');
    else session.resumeDecision();
    this.afterChange();
  };

  // ---- 표시 값 ----

  get phase(): HostPhase {
    return this.stage === 'lobby' ? 'lobby' : this.stage === 'ended' ? 'ended' : 'playing';
  }

  get names(): readonly [string, string] {
    return (
      this.session?.names ?? [
        this.config.hostName,
        this.guestName ?? this.resume?.state.guestName ?? '상대',
      ]
    );
  }

  /** 게스트가 지금 이어져 있는지: hello를 받았고, 중계가 떠났다고 하지 않았고, 60초 안에 소리가 있었다(NP-05) */
  get guestOnline(): boolean {
    void this.version;
    if (this.guestName === null || this.session === null) return false;
    if (this.peer === 'left' || this.peer === 'absent') return false;
    return this.session.connected;
  }

  /** 이어할 수 있는 저장본 (아직 되살리지 않았을 때) */
  get resumable(): HostSave | null {
    void this.version;
    return this.resume !== null && this.resume.state.stage !== 'ended' && this.session === null
      ? this.resume
      : null;
  }

  private get state(): GameState | null {
    void this.version;
    return this.session?.state ?? null;
  }

  get bankrupt(): boolean {
    return this.bankruptSeats.includes(ME);
  }

  private cacheRoundResult(): void {
    const session = this.session;
    const board = this.board();
    if (session === null || board?.phase !== 'end' || board.round !== session.roundNumber) return;
    const existing = this.roundResults.find(
      (result) => result.identity.epoch === session.epoch && result.identity.round === board.round,
    );
    if (
      existing?.displaySeq === board.eventSeq &&
      existing.committed === (session.settlement !== null)
    )
      return;
    const summary = hostSummary(session) ?? pendingHostSummary(session);
    if (summary === null) return;
    const identity = existing?.identity ?? {
      epoch: session.epoch,
      round: board.round,
      terminalSeq: board.eventSeq,
      viewer: ME,
    };
    const result: RemoteRoundResult = {
      key: existing?.key ?? remoteResultKey(identity),
      identity,
      displaySeq: board.eventSeq,
      summary,
      acknowledged: existing?.acknowledged ?? false,
      presented: existing?.presented ?? false,
      committed: session.settlement !== null,
    };
    this.roundResults = [
      ...this.roundResults.filter(
        (item) =>
          item.identity.epoch === session.epoch &&
          item.identity.round >= this.playback.board.round &&
          item.identity.round !== board.round,
      ),
      result,
    ];
  }

  get pendingRoundResult(): DisplayRoundResult | null {
    if (this.disposed) return null;
    const result = this.roundResults.find(
      (item) => item.identity.round === this.playback.board.round,
    );
    return result && remoteResultVisible(this.playback, result, this.session?.epoch ?? null)
      ? result
      : null;
  }

  markRoundResultPresented(key: string): void {
    const result = this.pendingRoundResult;
    if (result?.key !== key) return;
    if (this.roundResults.find((item) => item.key === key)?.presented) return;
    this.roundResults = this.roundResults.map((item) =>
      item.key === key && !item.presented ? { ...item, presented: true } : item,
    );
  }

  acknowledgeRoundResult(key: string): void {
    const result = this.pendingRoundResult;
    if (result?.key !== key || result.acknowledged) return;
    this.roundResults = this.roundResults.map((item) =>
      item.key === key ? { ...item, acknowledged: true } : item,
    );
  }

  get pushDecision(): PushDecision | null {
    const state = this.state;
    if (this.stage !== 'settled' || state?.phase !== 'end' || this.session?.settlement !== null)
      return null;
    const offer = pushOffer(state, this.session.ledger);
    return {
      winner: state.result?.winner === ME,
      canPush: legalActions(state, ME).some((action) => action.type === 'push'),
      nextMultiplier: 2 ** (state.round.pushes + 1),
      acceptAmount: offer.amount,
      forfeitedPoints: offer.points,
    };
  }

  get canAct(): boolean {
    const state = this.state;
    return (
      this.stage === 'playing' &&
      this.link === 'open' &&
      this.playback.idle &&
      this.guestOnline &&
      state !== null &&
      state.phase !== 'end' &&
      legalActions(state, ME).length > 0 &&
      (this.session?.canInput(ME) ?? true)
    );
  }

  get thinking(): boolean {
    const state = this.state;
    return (
      this.stage === 'playing' &&
      this.playback.idle &&
      state !== null &&
      state.phase !== 'end' &&
      legalActions(state, GUEST).length > 0 &&
      legalActions(state, ME).length === 0
    );
  }

  get notice(): string | null {
    void this.version;
    if (this.stage === 'ended') return '세션이 끝났습니다';
    if (this.link === 'replaced') return '다른 창에서 호스트로 접속 중입니다';
    if (this.link !== 'open') return '중계에 다시 연결하는 중…';
    if (this.phase === 'playing' && !this.guestOnline) {
      const name = this.guestName ?? '상대';
      const since = this.offlineSince;
      const minutes = since === null ? 0 : Math.floor((Date.now() - since) / 60_000);
      return `${name} 연결 끊김 · 돌아오기를 기다리는 중${minutes > 0 ? ` (${minutes}분)` : ''}`;
    }
    if (this.session?.decisionClock?.state === 'paused')
      return this.session.decisionClock.pauseReason === 'clockUnknown'
        ? '호스트 대기 · 시간 확인 필요'
        : '호스트 대기 · 남은 시간 보존';
    if (this.stage === 'handshake' && this.playback.idle) return '판을 나누는 중…';
    return null;
  }

  /** 정산 화면 안내: 상대 파산 선택 대기·상대 준비 */
  get settlementNote(): string | null {
    if (this.stage === 'bankrupt' && !this.bankrupt)
      return `${this.names[GUEST]}의 재충전·종료 선택을 기다리는 중`;
    if (this.stage === 'settled' && this.guestReady) return `${this.names[GUEST]} 준비 완료`;
    return null;
  }

  /** 정산 화면의 "다음 판"을 잠글지 (상대 파산 선택 대기) */
  get settlementWaiting(): boolean {
    return this.stage === 'bankrupt' && !this.bankrupt;
  }

  get stats(): GameStats {
    return {
      round: this.session?.roundNumber ?? this.resume?.state.roundNumber ?? 1,
      phase:
        this.stage === 'ended'
          ? 'ended'
          : this.stage === 'bankrupt'
            ? 'bankrupt'
            : this.playback.settlement !== null
              ? 'roundOver'
              : 'playing',
      roundsPlayed: this.roundsPlayed,
      balances: this.balances,
      refilled: this.refilled,
      startBalance: this.session?.ledger.startBalance ?? this.config.startBalance,
      seq: this.seq,
    };
  }

  private board(): BoardView | null {
    return hostBoard(this.session);
  }
  get decisionClock(): DecisionClock | null {
    void this.version;
    return this.session?.decisionClock ?? null;
  }
  get timeoutResult() {
    void this.version;
    return this.session?.timeoutHistory.at(-1) ?? null;
  }
  get timerDecisionMs(): number | null {
    if (this.session !== null) return this.session.timerSettings.decisionMs;
    return this.config.timerDecisionMs === undefined ? 10_000 : this.config.timerDecisionMs;
  }
  get timerRemainingMs(): number | null {
    const clock = this.decisionClock;
    if (clock === null) return null;
    return clock.state === 'running' && clock.deadlineMs !== null
      ? Math.max(0, clock.deadlineMs - this.now())
      : clock.remainingMs;
  }
  decisionRendered(): void {
    const clock = this.session?.decisionClock;
    if (
      clock === null ||
      clock === undefined ||
      !this.playback.idle ||
      document.visibilityState !== 'visible'
    )
      return;
    if (this.playback.board.eventSeq < clock.key.baseSeq) return;
    this.session?.decisionReady(0, clock.key, clock.attempt, this.playback.board.eventSeq);
  }

  // ---- 로비 ----

  /** 로비에서 규칙·금액·이름을 바꾼다. 게스트가 있으면 세션을 다시 만들어 welcome을 새로 보낸다 (FR-05, FR-24) */
  configure(config: HostConfig): void {
    if (this.stage !== 'lobby' || this.resume !== null) return;
    const timerChanged =
      config.timerDecisionMs !== undefined &&
      config.timerDecisionMs !== this.config.timerDecisionMs;
    this.config = config;
    if (timerChanged) this.timerSaveFailed = !saveTimerPreference(config.timerDecisionMs!);
    this.balances = [config.startBalance, config.startBalance];
    this.playback.reset(emptyBoard(ME, this.names, this.balances));
    if (this.lastHello !== null) this.openSession(this.guestName ?? '상대');
  }

  private newPort(): SessionPort {
    const port = new SessionPort(
      (message) => this.outgoing(message),
      () => this.transport.reconnect(),
    );
    this.port = port;
    return port;
  }

  /** 게스트 이름으로 세션을 (다시) 만들고 마지막 hello를 넘긴다. 로비에서만 */
  private openSession(guestName: string): void {
    const c = this.config;
    const session = new HostSession(this.newPort(), {
      rules: c.rules,
      names: [c.hostName, guestName],
      random32,
      sessionToken: this.token,
      perPoint: c.perPoint,
      startBalance: c.startBalance,
      autoStart: false,
      timerSettings: {
        decisionMs: c.timerDecisionMs === undefined ? 10_000 : c.timerDecisionMs,
        policy: 'fixed-v1',
      },
      ...(c.unit ? { unit: c.unit } : {}),
      log: (line) => log.info(`세션 ${line}`),
    });
    this.attachSession(session);
    if (this.lastHello !== null) this.dispatch(this.lastHello);
  }

  private attachSession(session: HostSession): void {
    this.session = session;
    session.advanceTime(this.now());
    session.onChange(() => this.afterChange());
  }

  /** "시작": 첫 판 커밋 교환을 시작한다 */
  start(): boolean {
    if (this.stage !== 'lobby' || this.session === null || !this.guestOnline) return false;
    const ok = this.session.start();
    if (ok)
      log.info(
        `호스트 세션 시작: ${this.config.preset}, 점당 ${this.config.perPoint}, 시작 ${this.config.startBalance}`,
      );
    this.afterChange();
    return ok;
  }

  /** 이어하기: 저장된 세션을 되살린다 (진행 중인 판은 시드+액션 리플레이, MN-05) */
  resumeSaved(): boolean {
    const saved = this.resume;
    if (saved === null || this.session !== null) return false;
    try {
      const session = HostSession.fromJSON(this.newPort(), saved.state, {
        random32,
        log: (line) => log.info(`세션 ${line}`),
      });
      this.guestName = saved.state.guestName;
      this.settledRound = session.settlement !== null ? session.roundNumber : 0;
      this.attachSession(session);
      const board = this.board();
      if (board !== null) this.playback.reset(board, this.settlementSummary());
      log.info(`호스트 세션 이어하기: ${session.roundNumber}판 · ${session.stage}`);
      this.afterChange();
      if (this.lastHello !== null) this.dispatch(this.lastHello);
      return true;
    } catch (error) {
      log.error(`이어하기 실패: ${String(error)}`);
      this.session = null;
      return false;
    }
  }

  // ---- 전송 ----

  private incoming(raw: string): void {
    if (this.disposed) return;
    if (isSocialFrame(raw)) {
      this.syncSocial();
      if (this.session?.authenticated) this.conversation.receive(raw);
      return;
    }
    this.session?.advanceTime(this.now());
    const parsed = decode(raw, 'guest');
    if (!parsed.ok && parsed.reason === 'VERSION_MISMATCH' && this.session === null) {
      this.transport.send({
        t: 'reject',
        seq: 0,
        reason: 'VERSION_MISMATCH',
        message: '앱 버전이 다릅니다. 페이지를 새로고침해 주세요.',
      });
      return;
    }
    const m = parsed.ok ? parsed.message : null;
    if (m?.t === 'hello') {
      if (this.guestName !== m.name) log.info(`게스트 입장: ${m.name}`);
      this.lastHello = raw;
      this.guestName = m.name;
      // 로비: 세션이 없거나 이름이 바뀌었으면 그 이름으로 세션을 (다시) 만든다
      if (this.stage === 'lobby' && this.resume === null && this.session?.names[GUEST] !== m.name) {
        this.openSession(m.name);
        return;
      }
    }
    if (m?.t === 'action' && this.session?.state) {
      this.pending = { before: this.session.state, action: m.payload, tapAt: null, mine: false };
    }
    const acceptedLog = m?.t === 'log' && this.session?.authenticated === true;
    try {
      this.dispatch(raw);
      if (acceptedLog && m?.t === 'log') this.forwardGuestLog(m.entries);
    } finally {
      this.pending = null;
    }
  }

  private dispatch(raw: string): void {
    for (const handler of [...(this.port?.messages ?? [])]) handler(raw);
    this.afterChange();
  }

  private outgoing(message: Message): void {
    this.observe(message as HostMessage);
    this.transport.send(message);
  }

  private observe(m: HostMessage): void {
    if (m.t === 'events') this.onEventsSent(m.list, m.to, m.acceptedPlayTarget);
    else if (m.t === 'snapshot') {
      this.seq = m.seq;
      this.enqueueBoard();
    }
  }

  /** 좌석 0이 볼 이벤트 묶음: 같은 액션을 reduce로 다시 계산한다(순수 함수라 결과가 같다). 분배는 보낸 목록 그대로 */
  private onEventsSent(
    sent: readonly EngineEvent[],
    to: number,
    acceptedPlayTarget?: AcceptedPlayTarget,
  ): void {
    const pending = this.pending;
    const events = hostEvents(sent, pending);
    const board = this.board();
    if (board === null) return;
    const liveTarget = to > this.seq ? acceptedPlayTarget : undefined;
    this.seq = to;
    this.cacheRoundResult();
    this.balances = [board.seats[0].balance, board.seats[1].balance];
    this.playback.enqueue(events, board, {
      action: pending?.mine ? pending.action : null,
      tapAt: pending?.mine ? pending.tapAt : null,
      ...(liveTarget && this.session
        ? {
            publicTarget: {
              evidence: liveTarget,
              namespace: { mode: 'p2p', epoch: this.session.epoch, round: board.round },
            },
          }
        : {}),
    });
  }

  private enqueueBoard(): void {
    const board = this.board();
    if (board !== null) this.playback.enqueue([], board);
  }

  private settlementSummary(): RoundSummary | null {
    return hostSummary(this.session);
  }

  private onSettled(): void {
    const session = this.session;
    const summary = this.settlementSummary();
    const board = this.board();
    if (session === null || summary === null || board === null) return;
    this.settledRound = session.roundNumber;
    const view = summary.view;
    const settlement = session.settlement;
    if (settlement === null) return;
    const names = this.names;
    const before: readonly [number, number] = [view.balances[0].before, view.balances[1].before];
    const after: readonly [number, number] = [view.balances[0].after, view.balances[1].after];
    this.records = [
      ...this.records,
      toRecordRow({
        round: session.roundNumber,
        winner: settlement.winner,
        reason: settlement.reason,
        points: settlement.finalPoints,
        before,
        after,
      }),
    ];
    this.roundsPlayed = this.records.length;
    this.balances = session.ledger.balances;
    this.playback.enqueue([], board, { settlement: summary });
    log.info(
      `판 ${session.roundNumber} 정산: ${settlement.winner === null ? '나가리' : `${names[settlement.winner]} ${settlement.finalPoints}점`} · 잔액 ${session.ledger.balances.join('/')}`,
    );
  }

  private onRelay(notice: RelayNotice): void {
    this.session?.advanceTime(this.now());
    this.peer = notice.peer;
    if (notice.peer === 'left' || notice.peer === 'absent')
      log.warn(`게스트 소켓 ${notice.peer === 'left' ? '떠남' : '없음'}`);
    else if (notice.peer === 'joined') log.info('게스트 소켓 접속');
    this.port?.relays.forEach((h) => h(notice));
    this.afterChange();
  }

  private forwardGuestLog(entries: readonly string[]): void {
    log.info(`게스트 로그 ${entries.length}줄 수신`);
    void getBridge().guestLog(entries);
  }

  private afterChange(): void {
    const session = this.session;
    if (session !== null) {
      const stage = session.stage;
      this.stage = stage;
      this.cacheRoundResult();
      this.guestReady = session.guestReady;
      this.bankruptSeats = session.status.bankrupt;
      this.refilled = summarizeLedger(session.ledger).recharged;
      if (stage === 'bankrupt' || stage === 'settled' || stage === 'ended')
        this.balances = session.ledger.balances;
      if (
        (stage === 'settled' || stage === 'bankrupt' || stage === 'ended') &&
        session.settlement !== null &&
        this.settledRound !== session.roundNumber
      )
        this.onSettled();
      if (stage !== 'lobby') this.save();
    }
    this.version++;
    this.updateOffline();
    this.syncSocial();
  }

  private updateOffline(): void {
    if (this.phase !== 'playing') return;
    if (this.session?.decisionClock?.pauseReason === 'clockUnknown') {
      if (!this.timerWaitDismissed) this.waitPrompt = true;
      return;
    }
    const unavailable = this.session?.unavailableSinceMs ?? null;
    if (this.session?.decisionClock?.state === 'paused' && unavailable !== null) {
      if (!this.timerWaitDismissed && this.now() - unavailable >= WAIT_PROMPT_MS)
        this.waitPrompt = true;
      return;
    }
    this.timerWaitDismissed = false;
    if (this.guestOnline) {
      if (this.offlineSince !== null) log.info('게스트 복귀');
      this.offlineSince = null;
      this.waitPrompt = false;
    } else if (this.offlineSince === null) {
      this.offlineSince = Date.now();
    } else if (!this.waitPrompt && Date.now() - this.offlineSince >= WAIT_PROMPT_MS) {
      this.waitPrompt = true;
    }
  }

  /** NP-05: 외부 시계. 60초 무응답이면 세션이 끊김으로 표시한다 */
  tick(): void {
    this.session?.advanceTime(this.now());
    if (
      document.visibilityState === 'visible' &&
      this.session?.decisionClock?.pauseReason === 'hostGap'
    )
      this.session.resumeDecision();
    this.afterChange();
  }

  // ---- 입력 ----

  submit(action: Action, tapAt: number = performance.now()): boolean {
    this.session?.advanceTime(this.now());
    const session = this.session;
    const before = session?.state ?? null;
    if (!this.canAct || session === null || before === null || action.seat !== ME) return false;
    this.pending = { before, action, tapAt, mine: true };
    try {
      const ok = session.apply(action);
      if (!ok) log.warn(`액션 거부: ${JSON.stringify(action)}`);
      return ok;
    } finally {
      this.pending = null;
      this.afterChange();
    }
  }

  skipAnimations(): void {
    this.playback.skip();
  }

  reconnect(): void {
    this.ws?.reconnect(true);
  }

  attach(root: HTMLElement | null): void {
    this.playback.attach(root);
  }

  autoAdvance(held: boolean): void {
    this.autoHeld = held;
    this.autoChoice.advance(held);
  }

  /** 정산 화면 → 다음 판 (호스트가 시작한다, #26) */
  nextRound(): void {
    if (
      this.disposed ||
      this.playback.busy ||
      this.playback.settlement === null ||
      !this.pendingRoundResult?.acknowledged ||
      this.playback.board.round !== this.session?.roundNumber ||
      this.playback.board.eventSeq !== this.session?.seq ||
      this.stage !== 'settled' ||
      this.session?.settlement === null
    )
      return;
    this.playback.release();
    this.session?.nextRound();
    this.afterChange();
  }

  choosePush(push: boolean): void {
    if (
      this.disposed ||
      !this.pendingRoundResult?.acknowledged ||
      !this.playback.idle ||
      this.playback.board.round !== this.session?.roundNumber ||
      this.playback.board.eventSeq !== this.session?.seq ||
      this.link !== 'open' ||
      !this.pushDecision?.winner
    )
      return;
    if (push) this.session?.push();
    else this.session?.acceptRound();
    this.afterChange();
  }

  acceptAbsentWinner(): void {
    if (!this.waitPrompt || this.pushDecision?.winner !== false) return;
    if (this.session?.acceptRound({ forSeat: 1, reason: 'absent' })) {
      this.waitPrompt = false;
      this.afterChange();
    }
  }

  /** MN-02 재충전 (호스트 좌석이 파산했을 때) */
  refill(): void {
    if (!this.bankrupt) return;
    this.session?.chooseBankruptcy('recharge');
    this.afterChange();
  }

  /** 3분 대기 선택지: 계속 기다린다 */
  keepWaiting(): void {
    this.offlineSince = Date.now();
    this.timerWaitDismissed = true;
    this.waitPrompt = false;
  }

  abortRound(): void {
    if (!this.waitPrompt) return;
    const reason =
      this.session?.decisionClock?.pauseReason === 'clockUnknown'
        ? '호스트 시계 연속성을 확인할 수 없음'
        : '장시간 연결 중단';
    if (this.session?.abortRound(reason)) {
      this.waitPrompt = false;
      this.afterChange();
    }
  }

  /** 세션 종료: 게스트에 알리고(sessionEnd) 저장을 끝남으로 둔 뒤 연결을 닫는다 */
  end(): void {
    if (this.stage === 'ended') return;
    if (this.bankrupt) this.session?.chooseBankruptcy('end');
    else this.session?.end();
    this.afterChange();
    this.stage = 'ended';
    this.waitPrompt = false;
    this.save();
    log.info(`호스트 세션 종료: ${this.roundsPlayed}판`);
    this.dispose();
  }

  /** 게스트가 올린 진단 로그 (FR-30, NP-09) */
  guestLogs(): readonly string[] {
    return this.session?.guestLogs ?? [];
  }

  private save(): void {
    this.saves.write(this.session, this.config, this.records);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.syncSocial();
    this.autoChoice.dispose();
    if (this.clock !== null) clearInterval(this.clock);
    document.removeEventListener('visibilitychange', this.onVisible);
    document.removeEventListener('visibilitychange', this.onSocialVisibility);
    this.ws?.dispose();
    this.playback.dispose();
  }
}
