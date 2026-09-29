// MN-05·NF-05: #88의 필수 하위 필드 검증. 엔진 규칙 자체의 재검증/정규화는 하지 않는다.
import * as z from 'zod/mini';

export const Money = z.int().check(z.gte(0));
export const Seat = z.union([z.literal(0), z.literal(1)]);
export const Balances = z.tuple([Money, Money]);
const Cards = z.array(z.int().check(z.gte(0), z.lte(50)));
export const Captured = z.object({ gwang: Cards, yeol: Cards, tti: Cards, pi: Cards });
export const EndReason = z.enum([
  'stop',
  'autoStop',
  'threePpeok',
  'chongtong',
  'floorChongtong',
  'bothChongtong',
  'hudang',
  'exhausted',
]);
export const Payout = z.object({
  kind: z.enum(['firstPpeok', 'secondPpeok', 'thirdPpeok', 'firstTtadak']),
  to: Seat,
  from: Seat,
  points: Money,
});
const Score = z.object({
  gwang: Money,
  yeol: Money,
  godori: Money,
  tti: Money,
  hongdan: Money,
  cheongdan: Money,
  chodan: Money,
  pi: Money,
  total: Money,
  gwangCount: Money,
  yeolCount: Money,
  ttiCount: Money,
  piCount: Money,
  gukjinAsPi: z.boolean(),
});
const SeatState = z.object({
  hand: Cards,
  captured: Captured,
  goCount: Money,
  lastGoScore: Money,
  shakes: Money,
  bombs: Money,
  bombTokens: Money,
  turnsTaken: Money,
  noCaptureStreak: Money,
  ppeokTurns: z.array(Money),
  gukjinAsPi: z.boolean(),
  score: Score,
  revealed: Cards,
});
const Pending = z.nullable(
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pickFirst'), seats: z.array(Seat) }),
    z.object({
      kind: z.literal('chongtong'),
      seat: Seat,
      months: z.array(Money),
      resume: z.enum(['deal', 'turn']),
    }),
    z.object({ kind: z.literal('play'), seat: Seat }),
    z.object({ kind: z.literal('gukjin'), seat: Seat }),
    z.object({ kind: z.literal('shake'), seat: Seat, card: Money, month: Money }),
    z.object({
      kind: z.literal('target'),
      seat: Seat,
      source: z.enum(['play', 'flip']),
      card: Money,
      options: Cards,
    }),
    z.object({ kind: z.literal('goStop'), seat: Seat, score: Money }),
  ]),
);
const Context = z.nullable(
  z.object({
    seat: Seat,
    index: Money,
    lastTurn: z.boolean(),
    mode: z.enum(['card', 'bomb', 'flipOnly']),
    played: z.nullable(Money),
    playTarget: z.nullable(Money),
    flipped: z.nullable(Money),
    flipTarget: z.nullable(Money),
    playBefore: Money,
    heldBonuses: Cards,
    capturedAny: z.boolean(),
    gukjinCaptured: z.boolean(),
  }),
);
const FirstPick = z.nullable(
  z.object({
    pool: Cards,
    picks: z.tuple([z.nullable(Money), z.nullable(Money)]),
    ties: Money,
    nextPools: z.array(Cards),
    isNight: z.boolean(),
  }),
);

export const Game = z
  .object({
    phase: z.enum(['chooseFirst', 'turn', 'end']),
    // 원본을 유지해 session-schema에서 config.rules와 비교한다.
    rules: z.unknown(),
    rng: z.tuple([z.int(), z.int(), z.int(), z.int()]),
    dealer: z.nullable(Seat),
    turn: Seat,
    seats: z.tuple([SeatState, SeatState]),
    floor: z.array(
      z.object({
        month: Money,
        cards: Cards,
        kind: z.enum(['loose', 'ppeok', 'natural']),
        owner: z.nullable(Seat),
      }),
    ),
    deck: Cards,
    pending: Pending,
    ctx: Context,
    firstPick: FirstPick,
    round: z.object({ number: Money, carry: Money, pushes: Money, fixedDeck: z.nullable(Cards) }),
    instantPayouts: z.array(Payout),
    result: z.nullable(
      z.object({ reason: EndReason, winner: z.nullable(Seat), pushed: z.optional(z.boolean()) }),
    ),
    eventSeq: Money,
  })
  .check(
    z.refine(
      (game) =>
        game.phase !== 'chooseFirst' ||
        (game.firstPick !== null &&
          game.firstPick.pool.length >= 2 &&
          game.pending?.kind === 'pickFirst'),
    ),
  );

export const Action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pickFirst'), seat: Seat, index: Money }),
  z.object({ type: z.literal('chongtong'), seat: Seat, choice: z.enum(['end', 'continue']) }),
  z.object({ type: z.literal('play'), seat: Seat, card: Money }),
  z.object({ type: z.literal('chooseTarget'), seat: Seat, card: Money }),
  z.object({ type: z.literal('bomb'), seat: Seat, month: Money }),
  z.object({ type: z.literal('shake'), seat: Seat, accept: z.boolean() }),
  z.object({ type: z.literal('gukjin'), seat: Seat, asPi: z.boolean() }),
  z.object({ type: z.literal('flipOnly'), seat: Seat }),
  z.object({ type: z.literal('go'), seat: Seat }),
  z.object({ type: z.literal('stop'), seat: Seat }),
  z.object({ type: z.literal('push'), seat: Seat }),
]);
