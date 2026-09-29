// MN-05: 저장 v1의 구조와 필드 간 정합성. 게임 규칙의 의미적 재검증은 하지 않는다.
import { PRESETS, type PresetId } from '@p2p-gostop/engine';
import * as z from 'zod/mini';
import {
  Action,
  Balances,
  Captured,
  EndReason,
  Game,
  Money,
  Payout,
  Seat,
} from './session-game-schema.ts';

const Settlement = z.object({
  reason: EndReason,
  winner: z.nullable(Seat),
  loser: z.nullable(Seat),
  steps: z.array(
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
      value: Money,
      total: Money,
      origin: z.optional(z.literal('push')),
    }),
  ),
  basePoints: Money,
  multiplier: Money,
  finalPoints: Money,
  nextCarry: Money,
  nextDealer: Seat,
  instantPayouts: z.array(Payout),
  gukjinAsPi: z.tuple([z.boolean(), z.boolean()]),
  pushed: z.optional(z.boolean()),
  forfeitedPoints: z.optional(Money),
  nextPushes: z.optional(Money),
});
const Record = z.object({
  round: Money,
  winner: z.nullable(Seat),
  reason: EndReason,
  points: Money,
  before: Balances,
  after: Balances,
  amount: Money,
  settlement: Settlement,
  captured: z.tuple([Captured, Captured]),
});
const Entry = z.object({
  kind: z.enum(['round', 'instant']),
  label: z.string(),
  from: Seat,
  to: Seat,
  points: Money,
  requested: Money,
  amount: Money,
  capped: z.boolean(),
});

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const Jackpot = z.nullable(z.object({ every: Money, multiplier: Money }));
const Config = z
  .object({
    preset: z.custom<PresetId>((value) => typeof value === 'string' && value in PRESETS),
    // 규칙은 속성 순서/추가 필드까지 보존한다. #88과 같은 프리셋별 typeof 검증만 수행한다.
    rules: z.custom<Record<string, unknown>>(isObject),
    seed: Money.check(z.lte(0xffffffff)),
    perPoint: Money,
    startBalance: Money,
    names: z.tuple([z.string(), z.string()]),
  })
  .check(
    z.refine(({ preset, rules }) =>
      Object.entries(PRESETS[preset]).every(([key, example]) =>
        key === 'jackpotRound'
          ? Jackpot.safeParse(rules[key]).success
          : key in rules && typeof rules[key] === typeof example,
      ),
    ),
  );

export const SessionV1 = z
  .object({
    version: z.literal(1),
    roundNumber: Money.check(z.gte(1)),
    phase: z.enum(['playing', 'pushDecision', 'roundOver', 'bankrupt', 'ended']),
    config: Config,
    ledger: z.object({
      balances: Balances,
      perPoint: Money,
      startBalance: Money,
      entries: z.array(Entry),
    }),
    refilled: Balances,
    roundStart: Balances,
    game: Game,
    records: z.array(Record),
    actions: z.array(Action),
  })
  .check(
    z.refine(
      ({ config, ledger, refilled, game, roundNumber }) =>
        ledger.perPoint === config.perPoint &&
        ledger.startBalance === config.startBalance &&
        ledger.balances[0] + ledger.balances[1] ===
          config.startBalance * 2 + refilled[0] + refilled[1] &&
        game.round.number === roundNumber &&
        JSON.stringify(game.rules) === JSON.stringify(config.rules),
    ),
  );
