// 게스트 모드 (spec 2.2·2.3·2.4, FR-04·05·30, NP-02~06·09, NF-04·05). 좌석 1 = 이 기기(iPhone Safari).
// - protocol GuestSession이 hello·커밋 교환·순번 검사·재동기화를 맡는다. 호스트가 보낸 이벤트는 이미 좌석 1로 가려져 있다.
// - 화면은 솔로·호스트와 같은 재생 큐(Playback)로 이벤트 묶음을 재생하고 스냅샷으로 보정한다(spec 6.4).
// - 세션 토큰·이름은 메모리와 URL 프래그먼트(#g=…&n=…)에만 둔다(MN-05: 게스트 origin은 세션마다 바뀐다). 새로고침·
//   탭 복원 뒤에도 같은 토큰으로 돌아온다. 화면 복귀(visibilitychange·pageshow)는 전송이 곧바로 다시 붙는다(NF-04).
// fix/protocol-review가 GuestSession에 갱신 훅·파산·종료 알림을 더하면 전송 층 관찰을 그 API로 바꾼다(이 파일만).
import type { Action, EngineEvent, Ledger, RuleOptions, Seat } from '@p2p-gostop/engine';
import {
  decode,
  GuestSession,
  type BoardView,
  type HostMessage,
  type SettlementView,
  type Transport,
} from '@p2p-gostop/protocol';
import type { GameController, GameStats } from '../game/controller.ts';
import { log } from '../game/log.svelte.ts';
import { Playback, type RoundSummary } from '../game/playback.svelte.ts';
import { INSTANT_LABEL } from '../ui/settle-labels.ts';
import { emptyBoard, random32 } from './common.ts';
import { Link, type LinkState, type RelayPeer } from './link.ts';
import { writeTicket, type GuestTicket } from './ticket.ts';
import type { RelayAddress } from './role.ts';

const ME: Seat = 1;

export type GuestPhase = 'lobby' | 'playing' | 'ended' | 'rejected';

export interface LobbyInfo {
  readonly names: readonly [string, string];
  readonly rules: RuleOptions;
  readonly ledger: Ledger;
}

export interface GuestOptions {
  readonly name: string;
  readonly token?: string | null;
  readonly address?: RelayAddress;
  /** 테스트용 전송 (주면 WebSocket을 열지 않는다) */
  readonly transport?: Transport;
  /** 토큰을 받으면 (기본: URL 프래그먼트에 쓴다) */
  readonly onTicket?: (ticket: GuestTicket) => void;
}

interface Awaiting {
  readonly action: Action;
  readonly tapAt: number;
}

export class GuestGame implements GameController {
  readonly mode = 'guest' as const;
  phase = $state<GuestPhase>('lobby');
  link = $state<LinkState>('connecting');
  /** 중계 알림으로 본 호스트 소켓 (알림이 없는 중계면 null) */
  hostPresent = $state<boolean | null>(null);
  lobby = $state.raw<LobbyInfo | null>(null);
  error = $state<string | null>(null);
  bankrupt = $state(false);
  roundsPlayed = $state(0);
  balances = $state.raw<readonly [number, number]>([0, 0]);
  seq = $state(0);
  /** 보낸 액션의 응답을 기다리는 중 */
  private awaiting = $state.raw<Awaiting | null>(null);
  readonly playback: Playback;
  readonly name: string;

  private readonly session: GuestSession;
  private readonly linkObject: Link | null;
  private readonly onTicket: (ticket: GuestTicket) => void;
  private prevSeq = 0;
  private prevErrors = 0;
  private awaitingSettlement = false;
  private roundInstant: EngineEvent[] = [];
  private disposed = false;

  constructor(options: GuestOptions) {
    this.name = options.name;
    this.onTicket = options.onTicket ?? writeTicket;
    let inner: Transport;
    if (options.transport) {
      this.linkObject = null;
      inner = options.transport;
      this.link = 'open';
    } else {
      const link = new Link({
        role: 'guest',
        ...(options.address ? { address: options.address } : {}),
        log: (line) => log.info(`게스트 ${line}`),
      });
      this.linkObject = link;
      link.onState((state) => this.onLinkState(state));
      link.onRelay((peer) => this.onRelay(peer));
      inner = link;
    }
    this.playback = new Playback(emptyBoard(ME, ['호스트', options.name], [0, 0]), {
      viewer: ME,
      names: () => this.names,
    });
    const transport: Transport = {
      send: (message) => inner.send(message),
      onMessage: (handler) =>
        inner.onMessage((raw) => {
          this.before(raw);
          handler(raw);
          this.after(raw);
        }),
      onClose: (handler) => inner.onClose(handler),
      reconnect: () => inner.reconnect(),
    };
    this.session = new GuestSession(transport, {
      name: options.name,
      random32,
      ...(options.token ? { sessionToken: options.token } : {}),
    });
    this.session.join();
    log.info(`게스트 참가 요청: ${options.name}${options.token ? ' (토큰으로 복귀)' : ''}`);
  }

  // ---- 표시 값 ----

  get names(): readonly [string, string] {
    return this.lobby?.names ?? ['호스트', this.name];
  }

  private get view(): BoardView | null {
    void this.seq;
    return this.session.view;
  }

  get canAct(): boolean {
    const view = this.view;
    return (
      this.phase === 'playing' &&
      this.link === 'open' &&
      this.awaiting === null &&
      !this.bankrupt &&
      this.playback.idle &&
      view !== null &&
      view.legal.length > 0
    );
  }

  get thinking(): boolean {
    const view = this.view;
    return (
      this.phase === 'playing' &&
      this.awaiting === null &&
      this.playback.idle &&
      view !== null &&
      view.pending !== null &&
      view.legal.length === 0
    );
  }

  get notice(): string | null {
    if (this.error !== null) return this.error;
    if (this.link === 'replaced') return '다른 창에서 이 게임을 열었습니다';
    if (this.link !== 'open') return '호스트에 다시 연결하는 중…';
    if (this.hostPresent === false) return '호스트 앱이 연결되어 있지 않습니다';
    if (this.awaiting !== null && this.playback.idle) return '보내는 중…';
    return null;
  }

  get stats(): GameStats {
    return {
      round: this.view?.round ?? 0,
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
      refilled: null,
      startBalance: this.lobby?.ledger.startBalance ?? 0,
      seq: this.seq,
    };
  }

  get token(): string | null {
    return this.session.token ?? null;
  }

  // ---- 수신 ----

  private before(raw: string): void {
    this.prevSeq = this.session.seq;
    this.prevErrors = this.session.errors.length;
    const parsed = decode(raw, 'host');
    if (!parsed.ok) return;
    const m = parsed.message;
    // 호스트 앱이 다시 시작해 순번이 처음부터면(이어하기) 게스트 순번도 되돌려 새 세션을 따라간다
    const restarted =
      (m.t === 'events' && m.from === 1 && m.to < this.session.seq) ||
      (m.t === 'snapshot' && m.seq < this.session.seq);
    if (restarted) {
      log.warn(
        `호스트 순번이 처음부터 다시 시작: ${this.session.seq} → ${m.t === 'events' ? m.from : m.seq}`,
      );
      this.session.seq = 0;
      this.prevSeq = 0;
      this.awaitingSettlement = false;
    }
  }

  private after(raw: string): void {
    const parsed = decode(raw, 'host');
    if (!parsed.ok) {
      log.warn(`호스트 메시지 거부: ${parsed.reason}`);
      return;
    }
    this.handle(parsed.message);
    this.seq = this.session.seq;
  }

  private handle(m: HostMessage): void {
    const s = this.session;
    switch (m.t) {
      case 'welcome': {
        this.lobby = { names: m.names, rules: m.rules, ledger: m.ledger };
        this.balances = m.ledger.balances;
        this.error = null;
        if (this.phase === 'rejected') this.phase = 'lobby';
        this.onTicket({ token: m.sessionToken, name: this.name });
        break;
      }
      case 'events':
        if (s.seq !== m.to || this.prevSeq >= m.to) break;
        this.onEvents(m.list, m.view);
        this.balances = m.ledger.balances;
        break;
      case 'snapshot':
        // GuestSession은 순번이 뒤로 가지 않는 스냅샷만 받는다
        if (m.seq < this.prevSeq) break;
        this.balances = m.ledger.balances;
        this.awaiting = null;
        if (m.settlement !== undefined && this.awaitingSettlement)
          this.onSettled(m.view, m.settlement);
        else this.playback.enqueue([], m.view);
        this.phase = 'playing';
        break;
      case 'reject':
        this.awaiting = null;
        log.warn(`호스트 거절: ${m.reason}`);
        if (m.reason === 'TOKEN_INVALID') {
          this.phase = 'rejected';
          this.error = '이미 다른 사람이 참가 중이거나 방이 바뀌었습니다';
          this.onTicket({ token: null, name: this.name });
        } else if (m.reason === 'VERSION_MISMATCH') {
          this.error = '호스트 앱과 버전이 다릅니다. 페이지를 새로 고치세요';
        }
        break;
      case 'bankruptcyPrompt':
        this.bankrupt = true;
        break;
      case 'commitHost':
        this.bankrupt = false;
        break;
      case 'revealHost': {
        const failed = s.errors.slice(this.prevErrors).includes('COMMIT_INVALID');
        if (failed) {
          log.error(`${m.round}판 셔플 검증 실패 (NP-06)`);
          this.playback.showToast(`${m.round}판 셔플 검증 실패`);
        } else log.info(`${m.round}판 셔플 검증 통과`);
        break;
      }
      default:
        break;
    }
  }

  private onEvents(list: readonly EngineEvent[], view: BoardView): void {
    if (list.some((e) => e.type === 'Dealt')) {
      this.roundInstant = [];
      this.awaitingSettlement = false;
    }
    for (const e of list) if (e.type === 'InstantPayout') this.roundInstant.push(e);
    if (list.some((e) => e.type === 'RoundEnded')) this.awaitingSettlement = true;
    // 보낸 액션 뒤의 첫 묶음이 그 응답이다 (좌석 1은 자기 차례에만 보낸다). 탭→재생 끝 시간을 잰다(AC-06)
    const awaiting = this.awaiting;
    this.playback.enqueue(list, view, {
      action: awaiting?.action ?? null,
      tapAt: awaiting?.tapAt ?? null,
    });
    this.awaiting = null;
    this.phase = 'playing';
  }

  private onSettled(view: BoardView, settlement: SettlementView): void {
    this.awaitingSettlement = false;
    const names = this.names;
    const summary: RoundSummary = {
      view: { ...settlement, names, amount: settlement.winner === null ? 0 : settlement.amount },
      instant: this.roundInstant.flatMap((e) =>
        e.type === 'InstantPayout' && e.seat !== null
          ? [{ label: INSTANT_LABEL[e.kind] ?? e.kind, name: names[e.seat], points: e.points }]
          : [],
      ),
      nextCarry: null,
    };
    this.roundsPlayed += 1;
    this.playback.enqueue([], view, { settlement: summary });
  }

  private onRelay(peer: RelayPeer): void {
    this.hostPresent = peer === 'present' || peer === 'joined';
    if (peer === 'joined') {
      // 호스트 앱이 (다시) 붙었다: 인사를 다시 보내 로비·판을 맞춘다
      this.session.join();
    }
  }

  private onLinkState(state: LinkState): void {
    this.link = state;
    if (state === 'replaced') log.warn('다른 창이 게스트 연결을 가져갔습니다 (4001)');
    if (state !== 'open') this.awaiting = null;
  }

  // ---- 입력 ----

  submit(action: Action, tapAt: number = performance.now()): boolean {
    if (!this.canAct || action.seat !== ME) return false;
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

  nextRound(): void {
    if (this.bankrupt) return;
    this.playback.release();
  }

  refill(): void {
    if (this.bankrupt) this.session.chooseBankruptcy('recharge');
  }

  /** 끊긴 연결을 사용자가 되살린다 (교체 4001 뒤 "다시 연결") */
  reconnect(): void {
    this.error = null;
    this.linkObject?.reconnect();
    this.session.join();
  }

  /** 진단 로그를 호스트로 올린다 (FR-30, NP-09: 줄 2KB·메시지 64KB 바이트 상한은 GuestSession이 자른다) */
  uploadLogs(lines: readonly string[]): number {
    if (this.link !== 'open') return 0;
    this.session.sendLogs(lines);
    return lines.length;
  }

  end(): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.onTicket({ token: null, name: this.name });
    log.info('게스트 나가기');
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.linkObject?.dispose();
    this.playback.dispose();
  }
}
