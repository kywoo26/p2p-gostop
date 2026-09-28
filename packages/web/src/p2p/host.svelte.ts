// 호스트 모드 (spec 2.1·2.3·2.4, FR-01~07·11, MN-01·02·05, NP-02~06). 좌석 0 = 이 기기, 좌석 1 = 원격 게스트.
// - 로비: 게스트 hello에 welcome(토큰·규칙·원장·이름)으로 답하며 규칙·금액을 고른다. "시작"을 누르면 protocol
//   HostSession을 만들고 게스트의 마지막 hello를 넘겨 첫 판 커밋 교환을 시작한다(로비 이후 토큰 없는 접속 거절, NF-06).
// - 게임: HostSession이 권위 엔진·원장·게스트 전송을 맡는다. 화면은 SoloSession과 같은 재생 큐(Playback)를 쓴다.
//   게스트로 나가는 events/snapshot을 전송 층에서 지켜보고, 같은 액션을 엔진 reduce로 다시 계산해(순수 함수) 좌석 0으로
//   가린 이벤트 묶음 + hostView()를 큐에 넣는다. 정산 스냅샷은 정산 화면이 된다.
// - 연결: 중계 알림과 60초 시계(NP-05)로 게스트 연결 상태를 보이고, 3분 넘게 돌아오지 않으면 계속 기다릴지 묻는다(spec 2.4).
// - 저장: 판이 끝날 때마다 토큰·원장·판 번호·선·이월 배수를 localStorage(127.0.0.1 고정 origin)에 둔다(MN-05).
//
// fix/protocol-review가 HostSession에 로비·판 사이 대기(settled/nextRound)·양쪽 파산 API·toJSON/fromJSON을 더하면
// 전송 층 관찰과 receive() 대행(파산 선택)을 그 API로 바꾼다. 바꿀 곳은 이 파일뿐이다.
import {
  createLedger,
  GUKJIN_ID,
  legalActions,
  reduce,
  redactEvent,
  type Action,
  type EngineEvent,
  type GameState,
  type Ledger,
  type PresetId,
  type RuleOptions,
  type Seat,
} from '@p2p-gostop/engine';
import {
  decode,
  HostSession,
  PROTOCOL_VERSION,
  type HostMessage,
  type Message,
  type SettlementView,
  type Transport,
} from '@p2p-gostop/protocol';
import { getBridge } from '../bridge/bridge.ts';
import type { GameController, GameStats } from '../game/controller.ts';
import { log } from '../game/log.svelte.ts';
import { Playback, type RoundSummary } from '../game/playback.svelte.ts';
import { toRecordRow } from '../game/adapter.ts';
import type { RecordRow } from '../lib/view-types.ts';
import { readJson, removeKey, writeJson } from '../storage/local.ts';
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import { emptyBoard, random32, randomHex, vibrateFor } from './common.ts';
import { Link, type LinkState, type RelayPeer } from './link.ts';
import type { RelayAddress } from './role.ts';

const ME: Seat = 0;
const GUEST: Seat = 1;
/** spec 2.4: 게스트가 이만큼 돌아오지 않으면 호스트에 선택지를 보인다 */
const WAIT_PROMPT_MS = 3 * 60_000;
/** NP-05 시계 주기 (60초 판정의 해상도) */
const CLOCK_MS = 5_000;
const HOST_SAVE_KEY = 'gostop.host.v1';

export interface HostConfig {
  readonly preset: PresetId;
  readonly rules: RuleOptions;
  readonly perPoint: number;
  readonly startBalance: number;
  readonly hostName: string;
}

/** localStorage 저장 (MN-05). 판 경계에서만 저장하므로 이어하기는 다음 판부터 새로 나눈다 */
export interface HostSave {
  readonly version: 1;
  readonly token: string;
  readonly config: HostConfig;
  readonly guestName: string | null;
  readonly ledger: Ledger;
  readonly roundNumber: number;
  readonly dealer: Seat | null;
  readonly carry: number;
  readonly refilled: readonly [number, number];
  readonly records: readonly RecordRow[];
  readonly ended: boolean;
}

export function loadHostSave(): HostSave | null {
  const raw = readJson(HOST_SAVE_KEY);
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Partial<HostSave>;
  if (
    o.version !== 1 ||
    typeof o.token !== 'string' ||
    typeof o.config?.rules !== 'object' ||
    !Array.isArray(o.ledger?.balances) ||
    typeof o.roundNumber !== 'number' ||
    typeof o.carry !== 'number' ||
    !Array.isArray(o.records)
  )
    return null;
  return o as HostSave;
}

export function clearHostSave(): void {
  removeKey(HOST_SAVE_KEY);
}

export type HostPhase = 'lobby' | 'playing' | 'ended';

interface PendingAction {
  readonly before: GameState;
  readonly action: Action;
  readonly tapAt: number | null;
  readonly mine: boolean;
}

export interface HostOptions {
  readonly config: HostConfig;
  /** 이어하기 */
  readonly resume?: HostSave | null;
  readonly address?: RelayAddress;
  /** 테스트용 전송 (주면 WebSocket을 열지 않는다) */
  readonly transport?: Transport;
  readonly clock?: boolean;
  readonly now?: () => number;
}

export class HostGame implements GameController {
  readonly mode = 'host' as const;
  phase = $state<HostPhase>('lobby');
  link = $state<LinkState>('connecting');
  /** 게스트가 hello에 적은 이름 */
  guestName = $state<string | null>(null);
  /** 중계 알림으로 본 게스트 소켓 (알림이 없는 중계면 null) */
  peer = $state<RelayPeer | null>(null);
  config: HostConfig;
  bankrupt = $state(false);
  roundsPlayed = $state(0);
  balances = $state.raw<readonly [number, number]>([0, 0]);
  refilled = $state.raw<readonly [number, number]>([0, 0]);
  seq = $state(0);
  records = $state.raw<readonly RecordRow[]>([]);
  /** 게스트가 끊긴 시각 (재접속하면 null) */
  offlineSince = $state<number | null>(null);
  /** 3분 대기 선택지 (spec 2.4) */
  waitPrompt = $state(false);
  /** 반응형 갱신 신호 (세션의 일반 필드가 바뀔 때) */
  private version = $state(0);
  readonly playback: Playback;
  readonly token: string;

  private session: HostSession | null = null;
  private readonly transport: Transport;
  private readonly linkObject: Link | null;
  private readonly resume: HostSave | null;
  private readonly now: () => number;
  private lastHello: string | null = null;
  private lastGuestMessage = 0;
  private pending: PendingAction | null = null;
  private awaitingSettlement = false;
  private needsSave = false;
  private roundStart: readonly [number, number] = [0, 0];
  private stopLobby: (() => void) | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(options: HostOptions) {
    this.config = $state.raw(options.config);
    this.resume = options.resume ?? null;
    this.now = options.now ?? (() => Date.now());
    this.token = this.resume?.token ?? randomHex();
    const ledger =
      this.resume?.ledger ?? createLedger(options.config.perPoint, options.config.startBalance);
    this.balances = ledger.balances;
    this.refilled = this.resume?.refilled ?? [0, 0];
    this.records = this.resume?.records ?? [];
    this.roundsPlayed = this.records.length;
    this.guestName = null;
    if (options.transport) {
      this.linkObject = null;
      this.transport = this.wrap(options.transport);
      this.link = 'open';
    } else {
      const link = new Link({
        role: 'host',
        ...(options.address ? { address: options.address } : {}),
        log: (line) => log.info(`호스트 ${line}`),
      });
      this.linkObject = link;
      link.onState((state) => {
        this.link = state;
        if (state === 'replaced') log.warn('다른 창이 호스트 연결을 가져갔습니다 (4001)');
      });
      link.onRelay((peer) => this.onRelay(peer));
      this.transport = this.wrap(link);
    }
    this.playback = new Playback(emptyBoard(ME, this.names, this.balances), {
      viewer: ME,
      names: () => this.names,
      onBanner: vibrateFor,
    });
    this.stopLobby = this.transport.onMessage((raw) => this.lobbyReceive(raw));
    if (options.clock ?? true) this.clock = setInterval(() => this.tick(), CLOCK_MS);
  }

  // ---- 표시 값 ----

  get names(): readonly [string, string] {
    return [this.config.hostName, this.guestName ?? this.resume?.guestName ?? '상대'];
  }

  /** 게스트가 지금 이어져 있는지: hello를 받았고, 중계가 떠났다고 하지 않았고, 60초 안에 소리가 있었다(NP-05) */
  get guestOnline(): boolean {
    void this.version;
    if (this.guestName === null) return false;
    if (this.peer === 'left' || this.peer === 'absent') return false;
    if (this.session !== null) return this.session.connected;
    return this.now() - this.lastGuestMessage < 60_000;
  }

  get resumable(): HostSave | null {
    return this.resume !== null && !this.resume.ended ? this.resume : null;
  }

  private get state(): GameState | null {
    void this.version;
    return this.session?.state ?? null;
  }

  get canAct(): boolean {
    const state = this.state;
    return (
      this.phase === 'playing' &&
      this.playback.idle &&
      !this.bankrupt &&
      this.guestOnline &&
      state !== null &&
      state.phase !== 'end' &&
      legalActions(state, ME).length > 0
    );
  }

  get thinking(): boolean {
    const state = this.state;
    return (
      this.phase === 'playing' &&
      this.playback.idle &&
      state !== null &&
      state.phase !== 'end' &&
      legalActions(state, GUEST).length > 0 &&
      legalActions(state, ME).length === 0
    );
  }

  get notice(): string | null {
    void this.version;
    if (this.phase === 'ended') return '세션이 끝났습니다';
    if (this.link === 'replaced') return '다른 창이 호스트 연결을 가져갔습니다';
    if (this.link !== 'open') return '중계에 다시 연결하는 중…';
    if (this.phase === 'playing' && !this.guestOnline) {
      const name = this.guestName ?? '상대';
      const since = this.offlineSince;
      const minutes = since === null ? 0 : Math.floor((this.now() - since) / 60_000);
      return `${name} 연결 끊김 — 돌아오기를 기다리는 중${minutes > 0 ? ` (${minutes}분)` : ''}`;
    }
    if (this.phase === 'playing' && this.state === null && !this.bankrupt && this.playback.idle)
      return '판을 나누는 중…';
    return null;
  }

  get stats(): GameStats {
    return {
      round: this.session?.roundNumber ?? this.resume?.roundNumber ?? 1,
      phase:
        this.phase === 'ended'
          ? 'ended'
          : this.bankrupt
            ? 'bankrupt'
            : this.playback.settlement !== null
              ? 'roundOver'
              : 'playing',
      roundsPlayed: this.roundsPlayed,
      balances: this.balances,
      refilled: this.refilled,
      startBalance: this.config.startBalance,
      seq: this.seq,
    };
  }

  // ---- 로비 ----

  /** 로비에서 규칙·금액·이름을 바꾼다. 게스트가 있으면 welcome을 다시 보낸다 (FR-05, FR-24: 시작 뒤에는 불가) */
  configure(config: HostConfig): void {
    if (this.phase !== 'lobby') return;
    this.config = config;
    if (this.resume === null) this.balances = [config.startBalance, config.startBalance];
    this.playback.reset(emptyBoard(ME, this.names, this.balances));
    if (this.guestName !== null) this.sendWelcome();
  }

  private lobbyLedger(): Ledger {
    return this.resume?.ledger ?? createLedger(this.config.perPoint, this.config.startBalance);
  }

  private sendWelcome(): void {
    this.transport.send({
      t: 'welcome',
      v: PROTOCOL_VERSION,
      seat: GUEST,
      sessionToken: this.token,
      rules: this.config.rules,
      ledger: this.lobbyLedger(),
      names: this.names,
    });
  }

  private lobbyReceive(raw: string): void {
    if (this.session !== null) return;
    const parsed = decode(raw, 'guest');
    if (!parsed.ok) return;
    const m = parsed.message;
    this.lastGuestMessage = this.now();
    if (m.t === 'hello') {
      if (m.sessionToken !== undefined && m.sessionToken !== this.token) {
        this.transport.send({
          t: 'reject',
          seq: 0,
          reason: 'TOKEN_INVALID',
          message: '다른 방의 토큰',
        });
        return;
      }
      this.lastHello = raw;
      if (this.guestName !== m.name) log.info(`게스트 입장: ${m.name}`);
      this.guestName = m.name;
      this.sendWelcome();
    } else if (m.t === 'ping') {
      this.transport.send({ t: 'pong' });
    } else if (m.t === 'log') {
      this.forwardGuestLog(m.entries);
    }
    this.version++;
  }

  /** "시작": HostSession을 만들고 게스트의 마지막 hello로 첫 판 커밋 교환을 시작한다 */
  start(): boolean {
    if (this.phase !== 'lobby' || this.lastHello === null || this.guestName === null) return false;
    const r = this.resume;
    this.session = new HostSession(this.transport, {
      rules: this.config.rules,
      names: this.names,
      random32,
      sessionToken: this.token,
      perPoint: this.config.perPoint,
      startBalance: this.config.startBalance,
      ...(r === null
        ? {}
        : {
            ledger: r.ledger,
            roundNumber: r.roundNumber,
            carry: r.carry,
            ...(r.dealer === null ? {} : { dealer: r.dealer }),
          }),
    });
    this.stopLobby?.();
    this.stopLobby = null;
    this.phase = 'playing';
    this.roundStart = this.session.ledger.balances;
    // 세션의 60초 시계를 지금 시각에 맞춘다(첫 메시지가 0시각으로 찍히지 않게)
    this.session.advanceTime(this.now());
    log.info(
      `호스트 세션 시작: ${this.config.preset}, 점당 ${this.config.perPoint}, 시작 ${this.config.startBalance}${r ? ` (이어하기 ${r.roundNumber}판째)` : ''}`,
    );
    this.kickSession();
    this.save();
    return true;
  }

  private kickSession(): void {
    if (this.session === null || this.lastHello === null) return;
    this.session.receive(this.lastHello);
    this.afterChange();
  }

  // ---- 전송 층 관찰 ----

  private wrap(inner: Transport): Transport {
    return {
      send: (message: Message) => {
        this.observe(message);
        inner.send(message);
      },
      onMessage: (handler) =>
        inner.onMessage((raw) => {
          if (this.session === null) {
            handler(raw);
            return;
          }
          this.beforeIncoming(raw);
          try {
            handler(raw);
          } finally {
            this.pending = null;
            this.afterChange();
          }
        }),
      onClose: (handler) => inner.onClose(handler),
      reconnect: () => inner.reconnect(),
    };
  }

  private beforeIncoming(raw: string): void {
    const parsed = decode(raw, 'guest');
    if (!parsed.ok) return;
    const m = parsed.message;
    this.lastGuestMessage = this.now();
    if (m.t === 'hello') {
      this.lastHello = raw;
      this.guestName = m.name;
    } else if (m.t === 'action' && this.session?.state) {
      this.pending = { before: this.session.state, action: m.payload, tapAt: null, mine: false };
    } else if (m.t === 'log') {
      this.forwardGuestLog(m.entries);
    }
  }

  private observe(message: Message): void {
    if (this.session === null) return;
    const m = message as HostMessage;
    switch (m.t) {
      case 'events':
        this.onEventsSent(m.list, m.to);
        break;
      case 'snapshot':
        if (this.bankrupt) this.syncRefill(m.ledger.balances);
        if (m.settlement !== undefined && this.awaitingSettlement) this.onSettled(m.settlement);
        else this.onSnapshotSent(m.seq);
        break;
      case 'bankruptcyPrompt':
        this.bankrupt = true;
        break;
      case 'commitHost':
        this.bankrupt = false;
        break;
      default:
        break;
    }
  }

  /** 좌석 0이 볼 이벤트 묶음: 같은 액션을 reduce로 다시 계산한다(순수 함수라 결과가 같다). 분배는 보낸 목록 그대로 */
  private onEventsSent(sent: readonly EngineEvent[], to: number): void {
    let events: readonly EngineEvent[] = sent;
    const pending = this.pending;
    if (pending !== null) {
      const result = reduce(pending.before, pending.action);
      if (result.ok) events = result.events;
    }
    const seat0 = events.map((e) => redactEvent(e, ME));
    if (seat0.some((e) => e.type === 'Dealt'))
      this.roundStart = this.session?.ledger.balances ?? this.roundStart;
    if (seat0.some((e) => e.type === 'RoundEnded')) this.awaitingSettlement = true;
    const board = this.session?.hostView();
    if (board == null) return;
    this.seq = to;
    this.balances = board.seats.map((s) => s.balance) as [number, number];
    this.playback.enqueue(seat0, board, {
      action: pending?.mine ? pending.action : null,
      tapAt: pending?.mine ? pending.tapAt : null,
    });
  }

  /** 이벤트 없는 변화(선 고르기 시작·한쪽만 고른 선 고르기·재동기화): 최신 좌석 0 뷰로 맞춘다 */
  private onSnapshotSent(seq: number): void {
    const board = this.session?.hostView();
    if (board == null) return;
    this.seq = seq;
    this.playback.enqueue([], board);
  }

  private onSettled(view: SettlementView): void {
    this.awaitingSettlement = false;
    const session = this.session;
    const board = session?.hostView();
    const settlement = session?.settlement ?? null;
    if (session === null || board == null || settlement === null) return;
    const names = this.names;
    const state = session.state;
    // 정산에 쓴 국진 위치 (rules S5): 판을 다 본 호스트만 안다
    const gukjin =
      state === null
        ? []
        : ([0, 1] as const)
            .filter((seat) => state.seats[seat].captured.yeol.includes(GUKJIN_ID))
            .map((seat) => ({ seat, asPi: settlement.gukjinAsPi[seat] }));
    const summary: RoundSummary = {
      view: {
        ...view,
        names,
        gukjin,
        // 나가리는 옮긴 금액이 없다 (이전 판 항목을 금액으로 읽지 않게, 이슈 #12)
        amount: settlement.winner === null ? 0 : view.amount,
        // 판 시작(즉시 정산 전) → 정산 후 잔액 (솔로 정산 화면과 같은 기준)
        balances: [
          { before: this.roundStart[0], after: view.balances[0].after },
          { before: this.roundStart[1], after: view.balances[1].after },
        ],
      },
      instant: settlement.instantPayouts.map((p) => ({
        label: INSTANT_LABEL[p.kind] ?? p.kind,
        name: names[p.to],
        points: p.points,
      })),
      nextCarry: settlement.winner === null ? settlement.nextCarry : null,
    };
    const after: readonly [number, number] = [view.balances[0].after, view.balances[1].after];
    this.records = [
      ...this.records,
      toRecordRow({
        round: session.roundNumber,
        winner: settlement.winner,
        reason: settlement.reason,
        points: settlement.finalPoints,
        before: this.roundStart,
        after,
      }),
    ];
    this.roundsPlayed = this.records.length;
    this.balances = after;
    this.roundStart = after;
    this.playback.enqueue([], board, { settlement: summary });
    this.needsSave = true;
    log.info(
      `판 ${session.roundNumber} 정산: ${settlement.winner === null ? '나가리' : `${names[settlement.winner]} ${settlement.finalPoints}점`} · 잔액 ${after.join('/')}`,
    );
  }

  /** 재충전으로 바뀐 잔액 (재충전 합을 따로 센다, MN-01 제로섬 검사: 잔액 합 = 시작 잔액×2 + 재충전 합) */
  private syncRefill(next: readonly [number, number]): void {
    const refilled: [number, number] = [this.refilled[0], this.refilled[1]];
    for (const seat of [0, 1] as const) refilled[seat] += next[seat] - this.balances[seat];
    this.refilled = refilled;
    this.roundStart = next;
    this.balances = next;
  }

  private onRelay(peer: RelayPeer): void {
    this.peer = peer;
    if (peer === 'left' || peer === 'absent') {
      if (this.session !== null) this.session.connected = false;
      log.warn(`게스트 소켓 ${peer === 'left' ? '떠남' : '없음'}`);
    } else if (peer === 'joined') log.info('게스트 소켓 접속');
    this.afterChange();
  }

  private forwardGuestLog(entries: readonly string[]): void {
    log.info(`게스트 로그 ${entries.length}줄 수신`);
    void getBridge().guestLog(entries);
  }

  private afterChange(): void {
    this.version++;
    this.updateOffline();
    if (this.needsSave) {
      this.needsSave = false;
      this.save();
    }
  }

  private updateOffline(): void {
    if (this.phase !== 'playing') return;
    if (this.guestOnline) {
      if (this.offlineSince !== null) log.info('게스트 복귀');
      this.offlineSince = null;
      this.waitPrompt = false;
    } else if (this.offlineSince === null) {
      this.offlineSince = this.now();
    } else if (!this.waitPrompt && this.now() - this.offlineSince >= WAIT_PROMPT_MS) {
      this.waitPrompt = true;
    }
  }

  /** NP-05: 외부 시계. 60초 무응답이면 세션이 끊김으로 표시한다 */
  tick(): void {
    this.session?.advanceTime(this.now());
    this.afterChange();
  }

  // ---- 입력 ----

  submit(action: Action, tapAt: number = performance.now()): boolean {
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

  attach(root: HTMLElement | null): void {
    this.playback.attach(root);
  }

  /** 정산 화면 → 다음 판 (다음 판 분배는 세션이 이미 준비하고, 화면은 여기서 이어 재생한다) */
  nextRound(): void {
    if (this.bankrupt) return;
    this.playback.release();
  }

  /** MN-02 재충전: 호스트도 게스트와 같은 선택을 보낸다 */
  refill(): void {
    if (!this.bankrupt || this.session === null) return;
    this.session.receive(JSON.stringify({ t: 'bankruptcy', choice: 'recharge' }));
    this.afterChange();
    this.save();
  }

  /** 3분 대기 선택지: 계속 기다린다 */
  keepWaiting(): void {
    this.offlineSince = this.now();
    this.waitPrompt = false;
  }

  /** 세션 종료: 저장을 끝남으로 표시하고 연결을 닫는다(게스트에는 호스트 이탈로 보인다) */
  end(): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.waitPrompt = false;
    this.save();
    log.info(`호스트 세션 종료: ${this.roundsPlayed}판`);
    this.dispose();
  }

  /** 합친 진단 로그 (호스트 + 게스트 업로드, FR-30) */
  guestLogs(): readonly string[] {
    return this.session?.guestLogs ?? [];
  }

  private save(): void {
    if (this.phase === 'lobby') return;
    const session = this.session;
    const save: HostSave = {
      version: 1,
      token: this.token,
      config: this.config,
      guestName: this.guestName,
      ledger: session?.ledger ?? this.lobbyLedger(),
      roundNumber: session?.roundNumber ?? 1,
      dealer: session?.dealer ?? null,
      carry: session?.carry ?? 1,
      refilled: this.refilled,
      records: this.records,
      ended: this.phase === 'ended',
    };
    if (!writeJson(HOST_SAVE_KEY, save)) log.warn('호스트 세션 저장 실패');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.clock !== null) clearInterval(this.clock);
    this.stopLobby?.();
    this.linkObject?.dispose();
    this.playback.dispose();
  }
}
