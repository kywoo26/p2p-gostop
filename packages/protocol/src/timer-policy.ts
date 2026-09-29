// FR-53: 입력 좌석의 공개 뷰만으로 초과 행동을 고른다. 엔진의 합법 수가 최종 권위다.
import type { Action } from '@p2p-gostop/engine';
import type { TimeoutResult } from './messages.ts';
import type { BoardView } from './view-types.ts';
import { sha256, toHex, utf8 } from './crypto.ts';

export function timeoutAction(view: BoardView): Action | null {
  const pending = view.pending;
  if (view.phase !== 'turn' || pending === null) return null;
  const legal = view.legal.filter((action) => action.seat === pending.seat);
  switch (pending.kind) {
    case 'play': {
      const plays = legal.filter(
        (action): action is Extract<Action, { type: 'play' }> => action.type === 'play',
      );
      return (
        plays.reduce<Extract<Action, { type: 'play' }> | null>(
          (best, action) => (best === null || action.card < best.card ? action : best),
          null,
        ) ??
        legal.find((action) => action.type === 'flipOnly') ??
        null
      );
    }
    case 'target': {
      const targets = legal.filter(
        (action): action is Extract<Action, { type: 'chooseTarget' }> =>
          action.type === 'chooseTarget',
      );
      return targets.reduce<Extract<Action, { type: 'chooseTarget' }> | null>(
        (best, action) => (best === null || action.card < best.card ? action : best),
        null,
      );
    }
    case 'goStop':
      return legal.find((action) => action.type === 'stop') ?? null;
    case 'shake':
      return legal.find((action) => action.type === 'shake' && !action.accept) ?? null;
    case 'chongtong':
      return legal.find((action) => action.type === 'chongtong' && action.choice === 'end') ?? null;
    case 'gukjin': {
      const asPi = view.seats[pending.seat].gukjinAsPi;
      return typeof asPi === 'boolean'
        ? (legal.find((action) => action.type === 'gukjin' && action.asPi === asPi) ?? null)
        : null;
    }
  }
  return null;
}

/** #123 §11.4의 정규 배열을 순수 JS SHA-256으로 요약한다. */
export function timeoutDigest(entries: readonly TimeoutResult[]): string {
  const rows = entries.map((entry) => [
    entry.key.epoch,
    entry.key.round,
    entry.key.decisionId,
    entry.key.baseSeq,
    entry.actionIndex,
    entry.seat,
    entry.toSeq,
    entry.deadlineMs,
    entry.confirmedAtMs,
    entry.policy,
    entry.action,
  ]);
  return toHex(sha256(utf8(JSON.stringify(rows))));
}

export function sameDecision(
  a: {
    readonly epoch: string;
    readonly round: number;
    readonly decisionId: number;
    readonly baseSeq: number;
  },
  b: {
    readonly epoch: string;
    readonly round: number;
    readonly decisionId: number;
    readonly baseSeq: number;
  },
): boolean {
  return (
    a.epoch === b.epoch &&
    a.round === b.round &&
    a.decisionId === b.decisionId &&
    a.baseSeq === b.baseSeq
  );
}
