// NP-02·NP-07: 수신 메시지의 런타임 스키마 (zod/mini). decode는 검증을 통과한 **파싱 결과**를 돌려준다.
// z.object는 모르는 필드를 지우므로 게스트가 붙인 여분 필드가 호스트 상태(액션 열·revealHost)로 들어가지 않는다(#23).
// 엔진 이벤트는 종류마다 필드가 달라 이벤트만 z.looseObject로 두고, 나머지는 모두 모양을 끝까지 검사한다.
import * as z from 'zod/mini';

const nat = z.number().check(z.int(), z.minimum(0));
const seat = z.literal([0, 1]);
const card = z.number().check(z.int(), z.minimum(0), z.maximum(50));
const month = z.number().check(z.int(), z.minimum(1), z.maximum(12));
const cards = z.array(card).check(z.maxLength(51));
const hex64 = z.string().check(z.regex(/^[0-9a-f]{64}$/));
const round = z.number().check(z.int(), z.minimum(1));
const shortText = z.string().check(z.maxLength(80));
const money = z.number();

const actionSchema = z.union([
  z.object({ type: z.literal('pickFirst'), seat, index: nat }),
  z.object({ type: z.literal('chongtong'), seat, choice: z.enum(['end', 'continue']) }),
  z.object({ type: z.literal('play'), seat, card }),
  z.object({ type: z.literal('bomb'), seat, month }),
  z.object({ type: z.literal('flipOnly'), seat }),
  z.object({ type: z.literal('shake'), seat, accept: z.boolean() }),
  z.object({ type: z.literal('chooseTarget'), seat, card }),
  z.object({ type: z.literal('gukjin'), seat, asPi: z.boolean() }),
  z.object({ type: z.literal('go'), seat }),
  z.object({ type: z.literal('stop'), seat }),
  z.object({ type: z.literal('push'), seat }),
]);

const balances = z.tuple([money, money]);
const ledgerEntry = z.union([
  z.object({
    kind: z.enum(['round', 'instant']),
    label: z.string().check(z.maxLength(32)),
    from: seat,
    to: seat,
    points: z.number(),
    requested: money,
    amount: money,
    capped: z.boolean(),
  }),
  z.object({
    kind: z.literal('recharge'),
    label: z.literal('recharge'),
    seat,
    amount: money,
    before: money,
    after: money,
  }),
]);
const ledgerSummary = z.object({
  perPoint: money,
  startBalance: money,
  balances,
  recent: z.array(ledgerEntry).check(z.maxLength(64)),
  entryCount: nat,
  recharged: balances,
});

const captured = z.object({ gwang: cards, yeol: cards, tti: cards, pi: cards });
const seatView = z.object({
  name: shortText,
  handCount: nat,
  hand: z.nullable(cards),
  captured,
  score: z.number(),
  goCount: nat,
  shakes: nat,
  bombs: nat,
  gukjinAsPi: z.boolean(),
  revealed: cards,
  ppeokCount: nat,
  balance: money,
  progress: z.object({ gwang: nat, godori: nat, dan: nat, pi: nat }),
});
const floorGroup = z.object({
  month,
  cards,
  kind: z.enum(['loose', 'ppeok', 'natural']),
  owner: z.nullable(seat),
});
const prompt = z.union([
  z.object({ kind: z.literal('play'), seat }),
  z.object({
    kind: z.literal('target'),
    seat,
    source: z.enum(['play', 'flip']),
    card,
    options: cards,
  }),
  z.object({
    kind: z.literal('goStop'),
    seat,
    score: z.number(),
    goCount: nat,
    stopAmount: money,
  }),
  z.object({ kind: z.literal('shake'), seat, card, month }),
  z.object({ kind: z.literal('gukjin'), seat }),
  z.object({
    kind: z.literal('chongtong'),
    seat,
    months: z.array(month).check(z.maxLength(12)),
  }),
]);
const steps = z
  .array(
    z.object({
      kind: z.enum([
        'base',
        'goBonus',
        'goMultiplier',
        'shake',
        'bomb',
        'piBak',
        'gwangBak',
        'meongtta',
        'goBak',
        'nagariCarry',
        'jackpot',
      ]),
      op: z.enum(['add', 'mul']),
      value: z.number(),
      total: z.number(),
      origin: z.optional(z.literal('push')),
    }),
  )
  .check(z.maxLength(32));
const boardSchema = z.object({
  viewer: seat,
  turn: seat,
  seats: z.tuple([seatView, seatView]),
  floor: z.array(floorGroup).check(z.maxLength(24)),
  deckCount: nat,
  multiplier: z.number(),
  pending: z.nullable(prompt),
  playable: cards,
  round,
  pushes: nat,
  eventSeq: nat,
  legal: z.array(actionSchema).check(z.maxLength(64)),
  firstPick: z.nullable(z.object({ poolSize: nat, taken: z.nullable(nat) })),
  inFlight: z.object({ played: z.nullable(card), staged: cards }),
  goStop: z.nullable(
    z.object({
      points: z.number(),
      steps,
      multiplier: z.number(),
      money: z.nullable(money),
      capped: z.boolean(),
    }),
  ),
  bombMonths: z.array(month).check(z.maxLength(12)),
  canFlipOnly: z.boolean(),
  dealer: z.nullable(seat),
  phase: z.enum(['chooseFirst', 'turn', 'end']),
});
const balanceChange = z.object({ before: money, after: money });
const settlement = z.object({
  winner: z.nullable(seat),
  loser: z.nullable(seat),
  reason: z.enum(['stop', 'autoStop', 'threePpeok', 'chongtong', 'exhausted', 'hudang']),
  names: z.tuple([shortText, shortText]),
  breakdown: z
    .array(
      z.object({
        kind: z.enum(['gwang', 'yeol', 'godori', 'tti', 'hongdan', 'cheongdan', 'chodan', 'pi']),
        points: z.number(),
      }),
    )
    .check(z.maxLength(8)),
  steps,
  finalPoints: z.number(),
  gukjinAsPi: z.tuple([z.boolean(), z.boolean()]),
  pushed: z.boolean(),
  forfeitedPoints: z.number(),
  nextPushes: nat,
  pointValue: money,
  amount: money,
  unit: z.enum(['냥', '원', '점']),
  balances: z.tuple([balanceChange, balanceChange]),
});
const status = z.object({
  rev: nat,
  stage: z.enum(['lobby', 'handshake', 'playing', 'settled', 'bankrupt', 'ended']),
  round: nat,
  ready: z.tuple([z.boolean(), z.boolean()]),
  bankrupt: z.array(seat).check(z.maxLength(2)),
  endReason: z.nullable(z.enum(['bankruptcy', 'host'])),
});
// 엔진 이벤트: 공통 필드만 검사하고 종류별 필드(from·to·kind·points 등)는 보존한다.
const event = z.looseObject({
  seq: nat,
  seat: z.nullable(seat),
  cards: z.array(card).check(z.maxLength(51)),
  type: z.string().check(z.maxLength(32)),
});
const errorCode = z.enum([
  'MALFORMED',
  'TOO_LARGE',
  'VERSION_MISMATCH',
  'TOKEN_INVALID',
  'STALE_SEQ',
  'ILLEGAL_ACTION',
  'COMMIT_INVALID',
  'ROUND_NOT_READY',
  'BANKRUPT',
]);

// 제어 문자 없는 이름 (리뷰 L-3)
const name = z.string().check(z.minLength(1), z.maxLength(80), z.regex(/^[^\p{Cc}]+$/u));

export const guestSchema = z.union([
  z.object({
    t: z.literal('hello'),
    v: nat,
    name,
    sessionToken: z.optional(z.string().check(z.maxLength(128))),
    lastSeq: z.optional(nat),
    epoch: z.optional(z.string().check(z.maxLength(64))),
  }),
  z.object({ t: z.literal('action'), seq: nat, payload: actionSchema }),
  z.object({ t: z.literal('push'), seq: nat }),
  z.object({ t: z.literal('ping') }),
  z.object({ t: z.literal('log'), entries: z.array(z.string()) }),
  z.object({ t: z.literal('commitGuest'), round, hash: hex64 }),
  z.object({ t: z.literal('revealGuest'), round, secret: hex64 }),
  z.object({ t: z.literal('ready'), round }),
  z.object({ t: z.literal('bankruptcy'), choice: z.enum(['recharge', 'end']) }),
  z.object({ t: z.literal('ledgerGet'), from: nat }),
]);

export const hostSchema = z.union([
  z.object({
    t: z.literal('welcome'),
    v: nat,
    seat,
    sessionToken: z.string().check(z.maxLength(128)),
    rules: z.record(z.string(), z.unknown()),
    ledger: ledgerSummary,
    names: z.tuple([shortText, shortText]),
    epoch: z.string().check(z.maxLength(64)),
    seq: nat,
    status,
  }),
  z.object({
    t: z.literal('snapshot'),
    seq: nat,
    view: boardSchema,
    ledger: ledgerSummary,
    settlement: z.optional(settlement),
    status,
  }),
  z.object({
    t: z.literal('events'),
    from: nat,
    to: nat,
    list: z.array(event),
    view: boardSchema,
    ledger: ledgerSummary,
    settlement: z.optional(settlement),
    status,
  }),
  z.object({ t: z.literal('status'), seq: nat, status }),
  z.object({
    t: z.literal('reject'),
    seq: nat,
    reason: errorCode,
    message: z.string().check(z.maxLength(200)),
  }),
  z.object({ t: z.literal('pong') }),
  z.object({ t: z.literal('commitHost'), round, hash: hex64 }),
  z.object({ t: z.literal('revealGuestRequest'), round, guestHash: hex64 }),
  z.object({ t: z.literal('roundAborted'), round, reason: shortText }),
  z.object({
    t: z.literal('revealHost'),
    round,
    secret: hex64,
    guestSecret: hex64,
    seed: z.tuple([nat, nat, nat, nat]),
    actions: z.array(actionSchema).check(z.maxLength(400)),
    hostHash: hex64,
    guestHash: hex64,
    // 테스트용 덱 고정(deck·pickPools)은 지운다: 게스트 검증은 셔플된 덱만 인정한다.
    options: z.object({
      roundNumber: z.optional(round),
      carry: z.optional(nat),
      pushes: z.optional(nat),
      dealer: z.optional(seat),
      isNight: z.optional(z.boolean()),
    }),
    firstSeq: nat,
  }),
  z.object({
    t: z.literal('bankruptcyPrompt'),
    balances,
    round,
    seats: z.array(seat).check(z.minLength(1), z.maxLength(2)),
  }),
  z.object({
    t: z.literal('sessionEnd'),
    reason: z.enum(['bankruptcy', 'host']),
    seat: z.nullable(seat),
  }),
  z.object({
    t: z.literal('ledgerPage'),
    from: nat,
    total: nat,
    entries: z.array(ledgerEntry),
  }),
]);

/** 버전 판정용 느슨한 머리 (리뷰 L-6: 스키마가 바뀐 옛 hello도 VERSION_MISMATCH로 안내) */
export const headSchema = z.looseObject({ t: z.string(), v: z.optional(z.number()) });
