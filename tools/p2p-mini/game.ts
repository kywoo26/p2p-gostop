// MVP용 최소 P2P 게임 로직 (호스트 권위). UI·네트워크와 분리해 Node 자가 테스트가 가능하다.
import { newRound } from '../../packages/engine/src/deal.ts';
import { reduce } from '../../packages/engine/src/reduce.ts';
import { legalActions } from '../../packages/engine/src/legal.ts';
import { settle, previewStop } from '../../packages/engine/src/settle.ts';
import { PRESETS } from '../../packages/engine/src/rules.ts';
import { cardName } from '../../packages/engine/src/names.ts';
import type {
  Action,
  EngineEvent,
  GameState,
  Seat,
  Settlement,
} from '../../packages/engine/src/state.ts';

export interface Proj {
  seat: Seat;
  phase: GameState['phase'];
  turn: Seat;
  myTurn: boolean;
  hand: number[];
  handCount: number;
  oppHandCount: number;
  captured: { gwang: number[]; yeol: number[]; tti: number[]; pi: number[] };
  oppCaptured: { gwang: number[]; yeol: number[]; tti: number[]; pi: number[] };
  score: number;
  oppScore: number;
  go: number;
  oppGo: number;
  floor: { month: number; cards: number[]; kind: string }[];
  deck: number;
  pending: unknown;
  firstPick: { poolSize: number; picked: boolean } | null;
  stopMoney: number | null;
  legal: Action[];
  log: string[];
  balances: number[];
  perPoint: number;
  round: number;
  carry: number;
  result: { text: string; winner: Seat | null } | null;
  peer: boolean;
}

const KO: Record<string, string> = {
  CardPlayed: '카드 냄',
  CardFlipped: '뒤집음',
  Captured: '획득',
  Ppeok: '뻑!',
  PpeokTaken: '뻑 먹음',
  SelfPpeok: '자뻑!',
  Jjok: '쪽!',
  Ttadak: '따닥!',
  Sseul: '쓸!',
  Bomb: '폭탄!',
  Shake: '흔들기',
  Chongtong: '총통!',
  PiStolen: '피 뺏김',
  InstantPayout: '즉시 정산',
  Go: '고!',
  Stop: '스톱',
  RoundEnded: '판 종료',
  Nagari: '나가리',
  BonusGained: '보너스',
  Dealt: '분배',
  FirstPicked: '선 고르기',
  FirstPickerChosen: '선 결정',
  Hudang: '허당',
  GukjinPlaced: '국진',
  Redealt: '재분배',
};

export class Game {
  state: GameState | null = null;
  dealer: Seat | undefined = undefined;
  carry = 1;
  round = 0;
  balances = [150000, 150000];
  perPoint = 100;
  log: string[] = [];
  result: { text: string; winner: Seat | null } | null = null;
  private seed: number;
  constructor(seed = Date.now() % 1_000_000) {
    this.seed = seed;
  }
  start(): void {
    this.round += 1;
    this.result = null;
    const opts =
      this.dealer === undefined
        ? { roundNumber: this.round }
        : { dealer: this.dealer, carry: this.carry, roundNumber: this.round };
    const r = newRound(PRESETS.standard, this.seed + this.round * 7919, opts);
    this.state = r.state;
    this.log = [];
    this.push(r.events);
    this.checkEnd();
  }
  legal(seat: Seat): Action[] {
    return this.state ? legalActions(this.state, seat) : [];
  }
  act(seat: Seat, action: Action): boolean {
    if (!this.state || this.state.phase === 'end') return false;
    if (action.seat !== seat) return false;
    const r = reduce(this.state, action);
    if (!r.ok) {
      this.log.push('거절: ' + r.message);
      return false;
    }
    this.state = r.state;
    this.push(r.events);
    this.checkEnd();
    return true;
  }
  private push(events: readonly EngineEvent[]): void {
    for (const e of events) {
      const any = e as unknown as Record<string, unknown>;
      let s = KO[e.type] ?? e.type;
      if (typeof any['seat'] === 'number') s = (any['seat'] === 0 ? '호스트' : '게스트') + ' ' + s;
      if (typeof any['card'] === 'number') s += ' ' + cardName(any['card'] as never);
      if (typeof any['count'] === 'number') s += ' ' + any['count'];
      if (typeof any['points'] === 'number') s += ' ' + any['points'] + '점';
      if (
        e.type === 'Dealt' ||
        e.type === 'CardDrawn' ||
        e.type === 'Placed' ||
        e.type === 'Matched' ||
        e.type === 'ScoreChanged'
      )
        continue;
      this.log.push(s);
    }
    if (this.log.length > 40) this.log = this.log.slice(-40);
  }
  private checkEnd(): void {
    const st = this.state;
    if (!st || st.phase !== 'end') return;
    const s: Settlement = settle(st);
    let text = '';
    if (s.winner === null) {
      text = `나가리 (다음 판 ×${s.nextCarry})`;
    } else {
      const money = Math.min(s.finalPoints * this.perPoint, this.balances[s.loser as number] ?? 0);
      this.balances[s.winner] += money;
      this.balances[s.loser as number] -= money;
      text = `${s.winner === 0 ? '호스트' : '게스트'} 승 ${s.basePoints}점 ×${s.multiplier} = ${s.finalPoints}점 → ${money.toLocaleString()}냥`;
    }
    for (const p of st.instantPayouts) {
      const m = Math.min(p.points * this.perPoint, this.balances[p.from] ?? 0);
      this.balances[p.to] += m;
      this.balances[p.from] -= m;
    }
    this.result = { text, winner: s.winner };
    this.dealer = s.nextDealer;
    this.carry = s.nextCarry;
    this.log.push('판 종료: ' + text);
  }
  proj(seat: Seat, peer: boolean): Proj {
    const st = this.state;
    const opp: Seat = seat === 0 ? 1 : 0;
    const empty = { gwang: [], yeol: [], tti: [], pi: [] };
    if (!st) {
      return {
        seat,
        phase: 'end',
        turn: 0,
        myTurn: false,
        hand: [],
        handCount: 0,
        oppHandCount: 0,
        captured: empty,
        oppCaptured: empty,
        score: 0,
        oppScore: 0,
        go: 0,
        oppGo: 0,
        floor: [],
        deck: 0,
        pending: null,
        firstPick: null,
        stopMoney: null,
        legal: [],
        log: this.log,
        balances: this.balances,
        perPoint: this.perPoint,
        round: this.round,
        carry: this.carry,
        result: this.result,
        peer,
      };
    }
    const me = st.seats[seat];
    const o = st.seats[opp];
    const legal = st.phase === 'end' ? [] : legalActions(st, seat);
    let stopMoney: number | null = null;
    if (st.pending && st.pending.kind === 'goStop' && st.pending.seat === seat) {
      try {
        stopMoney = previewStop(st, seat).finalPoints * this.perPoint;
      } catch {
        stopMoney = null;
      }
    }
    return {
      seat,
      phase: st.phase,
      turn: st.turn,
      myTurn: legal.length > 0,
      hand: [...me.hand],
      handCount: me.hand.length,
      oppHandCount: o.hand.length,
      captured: {
        gwang: [...me.captured.gwang],
        yeol: [...me.captured.yeol],
        tti: [...me.captured.tti],
        pi: [...me.captured.pi],
      },
      oppCaptured: {
        gwang: [...o.captured.gwang],
        yeol: [...o.captured.yeol],
        tti: [...o.captured.tti],
        pi: [...o.captured.pi],
      },
      score: me.score.total,
      oppScore: o.score.total,
      go: me.goCount,
      oppGo: o.goCount,
      floor: st.floor.map((g) => ({ month: g.month, cards: [...g.cards], kind: g.kind })),
      deck: st.deck.length,
      pending: st.pending,
      firstPick: st.firstPick
        ? { poolSize: st.firstPick.pool.length, picked: st.firstPick.picks[seat] !== null }
        : null,
      stopMoney,
      legal,
      log: this.log,
      balances: this.balances,
      perPoint: this.perPoint,
      round: this.round,
      carry: this.carry,
      result: this.result,
      peer,
    };
  }
}
