// 세션 모델 (spec MN-01·MN-02·MN-05, FR-18·FR-19, rules-vectors.md "세션 흐름은 호출자가 이어 붙인다").
// 엔진 한 판(GameState) + 원장(Ledger) + 판 기록을 하나의 직렬화 가능한 값으로 묶는 순수 함수들.
// 판 번호·다음 판 선(settle().nextDealer)·나가리 배수(settle().nextCarry)를 이어 붙이고,
// 즉시 정산은 이벤트가 나온 즉시, 판 정산은 판이 끝날 때 원장에 기록한다. 잔액 0이면 재충전/종료를 묻는다(MN-02).
// 솔로(M3)와 호스트(M4)가 같이 쓸 수 있도록 좌석 이름만 알고 사람/CPU를 구분하지 않는다.
import {
  applyInstantPayout,
  applySettlement,
  createLedger,
  newRound,
  reduce,
  type Action,
  type CapturedPile,
  type EndReason,
  type EngineEvent,
  type GameState,
  type Ledger,
  type PresetId,
  type RejectReason,
  type RuleOptions,
  type Seat,
  type Settlement,
} from '@p2p-gostop/engine';
import { PRESETS } from '@p2p-gostop/engine';

export interface SessionConfig {
  readonly preset: PresetId;
  /** 세션 시작 시 확정한 규칙 (FR-24: 세션 중 변경 불가) */
  readonly rules: RuleOptions;
  readonly perPoint: number;
  readonly startBalance: number;
  readonly names: readonly [string, string];
  /** 세션 시드 (판별 셔플 시드는 여기서 파생, plan.md 원칙 6) */
  readonly seed: number;
}

export interface RoundRecord {
  readonly round: number;
  readonly winner: Seat | null;
  readonly reason: EndReason;
  /** 판 정산 최종 점수 (나가리 0) */
  readonly points: number;
  /** 판 시작 시 잔액 (즉시 정산 전) */
  readonly before: readonly [number, number];
  /** 판 정산 후 잔액 */
  readonly after: readonly [number, number];
  /** 판 정산으로 실제 옮겨진 금액 (올인 상한 적용) */
  readonly amount: number;
  readonly settlement: Settlement;
  /** 판이 끝난 시점의 획득 패 (정산 화면 족보 분해) */
  readonly captured: readonly [CapturedPile, CapturedPile];
}

/**
 * playing: 판 진행 중 / roundOver: 정산 화면(다음 판 대기) / bankrupt: 잔액 0 → 재충전·종료 선택(MN-02) / ended: 종료
 */
export type SessionPhase = 'playing' | 'roundOver' | 'bankrupt' | 'ended';

export interface SessionState {
  readonly version: 1;
  readonly config: SessionConfig;
  readonly phase: SessionPhase;
  readonly roundNumber: number;
  readonly game: GameState;
  readonly ledger: Ledger;
  /** 이번 판 시작 시 잔액 */
  readonly roundStart: readonly [number, number];
  readonly records: readonly RoundRecord[];
  /** 이번 판 액션 열 (리플레이·버그 재현용, FR-33) */
  readonly actions: readonly Action[];
  /** 재충전으로 더한 금액 합 [좌석0, 좌석1] (제로섬 검사: 잔액 합 = 시작 잔액×2 + 재충전 합) */
  readonly refilled: readonly [number, number];
}

export type SessionStep =
  | { readonly ok: true; readonly session: SessionState; readonly events: readonly EngineEvent[] }
  | { readonly ok: false; readonly reason: RejectReason | 'notPlaying'; readonly message: string };

/** 세션 시드와 판 번호로 셔플 시드를 만든다 (murmur3 finalizer 섞기) */
export function roundSeed(seed: number, round: number): number {
  let h = (seed ^ Math.imul(round, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 새 세션: 첫 판은 선 고르기(R4)부터 */
export function createSession(config: SessionConfig): {
  session: SessionState;
  events: readonly EngineEvent[];
} {
  const { state, events } = newRound(config.rules, roundSeed(config.seed, 1), { roundNumber: 1 });
  const ledger = createLedger(config.perPoint, config.startBalance);
  return {
    session: {
      version: 1,
      config,
      phase: 'playing',
      roundNumber: 1,
      game: state,
      ledger,
      roundStart: ledger.balances,
      records: [],
      actions: [],
      refilled: [0, 0],
    },
    events,
  };
}

/** 판이 끝났으면 정산을 원장에 기록하고 기록을 남긴다 */
function closeRound(session: SessionState, events: readonly EngineEvent[]): SessionState {
  // 밀기(push)로 이어진 판은 Settled를 두 번 낸다: 마지막 정산이 그 판의 결과다
  const settled = events.findLast((e) => e.type === 'Settled');
  if (session.game.phase !== 'end' || settled?.type !== 'Settled') return session;
  const settlement = settled.settlement;
  const before = session.ledger;
  const ledger = applySettlement(before, settlement, session.config.rules);
  const amount = ledger.balances[0] - before.balances[0];
  const record: RoundRecord = {
    round: session.roundNumber,
    winner: settlement.winner,
    reason: settlement.reason,
    points: settlement.finalPoints,
    before: session.roundStart,
    after: ledger.balances,
    amount: Math.abs(amount),
    settlement,
    captured: [session.game.seats[0].captured, session.game.seats[1].captured],
  };
  const bankrupt = ledger.balances.some((b) => b <= 0);
  return {
    ...session,
    ledger,
    records: [...session.records, record],
    phase: bankrupt ? 'bankrupt' : 'roundOver',
  };
}

/** 액션 하나를 적용한다. 즉시 정산 이벤트는 바로 원장에 기록한다(FR-18) */
export function sessionAct(session: SessionState, action: Action): SessionStep {
  if (session.phase !== 'playing') {
    return { ok: false, reason: 'notPlaying', message: `판 진행 중이 아닙니다: ${session.phase}` };
  }
  const result = reduce(session.game, action);
  if (!result.ok) return result;
  let ledger = session.ledger;
  for (const e of result.events) {
    if (e.type === 'InstantPayout' && e.seat !== null) {
      ledger = applyInstantPayout(
        ledger,
        { kind: e.kind, to: e.seat, from: e.from, points: e.points },
        session.config.rules,
      );
    }
  }
  const next: SessionState = {
    ...session,
    game: result.state,
    ledger,
    actions: [...session.actions, action],
  };
  return { ok: true, session: closeRound(next, result.events), events: result.events };
}

/** 다음 판: 선은 직전 승자(나가리면 유지), 나가리 배수 이월 (R5·G9) */
export function startNextRound(session: SessionState): {
  session: SessionState;
  events: readonly EngineEvent[];
} {
  const last = session.records.at(-1);
  if (session.phase !== 'roundOver' || last === undefined) {
    return { session, events: [] };
  }
  const roundNumber = session.roundNumber + 1;
  const { state, events } = newRound(
    session.config.rules,
    roundSeed(session.config.seed, roundNumber),
    {
      dealer: last.settlement.nextDealer,
      carry: last.settlement.nextCarry,
      roundNumber,
    },
  );
  const started: SessionState = {
    ...session,
    phase: 'playing',
    roundNumber,
    game: state,
    roundStart: session.ledger.balances,
    actions: [],
  };
  // 바닥·양측 총통처럼 분배만으로 끝나는 판도 있다(R6·E13)
  return { session: closeRound(started, events), events };
}

/** MN-02 재충전: 잔액이 0인 좌석을 시작 잔액으로. 승패 기록은 유지한다 */
export function refill(session: SessionState): SessionState {
  if (session.phase !== 'bankrupt') return session;
  const start = session.config.startBalance;
  const balances: [number, number] = [session.ledger.balances[0], session.ledger.balances[1]];
  const refilled: [number, number] = [session.refilled[0], session.refilled[1]];
  for (const seat of [0, 1] as const) {
    if (balances[seat] <= 0) {
      refilled[seat] += start - balances[seat];
      balances[seat] = start;
    }
  }
  return {
    ...session,
    ledger: { ...session.ledger, balances },
    refilled,
    phase: 'roundOver',
  };
}

export function endSession(session: SessionState): SessionState {
  return { ...session, phase: 'ended' };
}

/** 지금 입력해야 하는 좌석들 (선 고르기는 아직 고르지 않은 좌석 모두) */
export function actingSeats(game: GameState): readonly Seat[] {
  const p = game.pending;
  if (game.phase === 'end' || p === null) return [];
  return p.kind === 'pickFirst' ? p.seats : [p.seat];
}

/** 제로섬 검사용: 잔액 합 = 시작 잔액 × 2 + 재충전 합 (MN-01) */
export function ledgerIsBalanced(session: SessionState): boolean {
  const [a, b] = session.ledger.balances;
  const [ra, rb] = session.refilled;
  return a + b === session.config.startBalance * 2 + ra + rb;
}

// ---- 저장 (MN-05) ----

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function money(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function pair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(money);
}

function cards(value: unknown): boolean {
  return Array.isArray(value) && value.every((id) => Number.isInteger(id) && id >= 0 && id <= 50);
}

function validSeat(value: unknown): boolean {
  if (!object(value) || !cards(value['hand']) || !object(value['captured'])) return false;
  const captured = value['captured'];
  return ['gwang', 'yeol', 'tti', 'pi'].every((key) => cards(captured[key]));
}

/** v0(재충전 합계 필드 전) 저장은 잔액 합이 초기값일 때만 안전하게 보완한다. */
function migrateSession(raw: Record<string, unknown>): Record<string, unknown> | null {
  if (raw['version'] === 1) return raw;
  if (raw['version'] !== 0 || !object(raw['config']) || !object(raw['ledger'])) return null;
  const start = raw['config']['startBalance'];
  const balances = raw['ledger']['balances'];
  if (!money(start) || !pair(balances) || balances[0] + balances[1] !== start * 2) return null;
  return { ...raw, version: 1, refilled: [0, 0], roundStart: raw['roundStart'] ?? balances };
}

/** localStorage에서 읽은 값(신뢰할 수 없음)을 검사한다. 모양이 다르면 null */
export function parseSession(raw: unknown): SessionState | null {
  if (!object(raw)) return null;
  const o = migrateSession(raw);
  if (o === null || !object(o['config']) || !object(o['ledger']) || !object(o['game'])) return null;
  const config = o['config'];
  const ledger = o['ledger'];
  const game = o['game'];
  const phases: readonly SessionPhase[] = ['playing', 'roundOver', 'bankrupt', 'ended'];
  const preset = config['preset'];
  const rules = config['rules'];
  const seats = game['seats'];
  const floor = game['floor'];
  if (
    o['version'] !== 1 ||
    !Number.isSafeInteger(o['roundNumber']) ||
    Number(o['roundNumber']) < 1 ||
    !phases.includes(o['phase'] as SessionPhase) ||
    typeof preset !== 'string' ||
    !(preset in PRESETS) ||
    !object(rules) ||
    !Object.entries(PRESETS[preset as PresetId]).every(
      ([key, value]) =>
        key in rules &&
        (value === null
          ? rules[key] === null || object(rules[key])
          : typeof rules[key] === typeof value),
    ) ||
    !money(config['seed']) ||
    config['seed'] > 0xffffffff ||
    !money(config['perPoint']) ||
    !money(config['startBalance']) ||
    !Array.isArray(config['names']) ||
    config['names'].length !== 2 ||
    !config['names'].every((name: unknown) => typeof name === 'string') ||
    !pair(ledger['balances']) ||
    !money(ledger['perPoint']) ||
    !money(ledger['startBalance']) ||
    !Array.isArray(ledger['entries']) ||
    ledger['perPoint'] !== config['perPoint'] ||
    ledger['startBalance'] !== config['startBalance'] ||
    !pair(o['refilled']) ||
    !pair(o['roundStart']) ||
    ledger['balances'][0] + ledger['balances'][1] !==
      config['startBalance'] * 2 + o['refilled'][0] + o['refilled'][1] ||
    !Array.isArray(seats) ||
    seats.length !== 2 ||
    !seats.every(validSeat) ||
    !cards(game['deck']) ||
    !Array.isArray(floor) ||
    !floor.every(
      (group: unknown) =>
        object(group) && cards(group['cards']) && Number.isInteger(group['month']),
    ) ||
    !object(game['round']) ||
    game['round']['number'] !== o['roundNumber'] ||
    !Array.isArray(game['instantPayouts']) ||
    !Array.isArray(o['records']) ||
    !o['records'].every(
      (record: unknown) =>
        object(record) &&
        money(record['round']) &&
        pair(record['before']) &&
        pair(record['after']) &&
        object(record['settlement']) &&
        Array.isArray(record['captured']),
    ) ||
    !Array.isArray(o['actions'])
  ) {
    return null;
  }
  return o as unknown as SessionState;
}
