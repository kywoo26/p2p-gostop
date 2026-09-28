// 결정화(determinization, M1 리뷰 F-3, spec AI-01·AI-03): 좌석 뷰 + 숨은 정보 표본 → 뷰와 일관된 GameState.
// ISMCTS·몬테카를로 AI가 엔진 내부 상태 모양을 흉내 내지 않고 가상 상태를 만들 수 있게 하는 공식 경로다.
// 뷰에 없는 정보는 상대 손패(공개된 카드 SeatView.revealed 제외)·더미 순서·PRNG·선 고르기 후보·가려진 상대 프롬프트뿐이며,
// 모두 표본(과 rng)으로 받는다.
import { deckCardIds, getCard, type CardId, type Month } from './cards.ts';
import { createRng, shuffleWith, type Seed } from './rng.ts';
import type { FirstPickState, GameState, Pending, Seat, SeatState } from './state.ts';
import type { PlayerView } from './view.ts';

/** 보는 좌석이 모르는 정보의 한 가지 배치 */
export interface DeterminizeSample {
  /**
   * 상대 손패 중 숨은 카드: 장수는 handCount − revealed.length이고 공개된 카드(view.seats[상대].revealed)는 넣지 않는다.
   * 결정화는 공개된 카드를 손패에 자동으로 더한다. 호환: 공개된 카드를 모두 포함한 전체 손패(handCount장)도 받는다.
   * 공개된 카드가 없으면 두 형식은 같다.
   */
  readonly opponentHand: readonly CardId[];
  /** 더미, 0번이 맨 위. 장수는 view.deckCount와 같아야 한다 */
  readonly deck: readonly CardId[];
  /**
   * 뷰가 가린 상대 프롬프트의 실제 값(흔들기·차례인 좌석의 총통은 뷰에서 play로 보인다).
   * 생략하면 뷰의 pending을 그대로 쓰고, 월을 지운 상대 총통은 표본 손패의 같은 월 4장으로 월을 다시 채운다.
   */
  readonly pending?: Pending;
  /** 선 고르기 후보(선 고르기 단계에서만 쓴다). 생략하면 rng로 섞은 덱의 앞 poolSize장 */
  readonly firstPickPool?: readonly CardId[];
}

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
const ascending = (ids: readonly CardId[]): CardId[] => ids.toSorted((a, b) => a - b);

/**
 * 보는 좌석이 볼 수 없는 카드 ID(상대의 숨은 손패 ∪ 더미), 오름차순.
 * 보이는 카드 = 자기 손패 + 바닥 + 양측 획득 패 + 진행 중인 턴의 낸 패·뒤집은 패·들고 있는 보너스
 * + 상대가 규칙상 공개한 손패(SeatView.revealed: 흔들기로 보여 준 카드).
 * 그래서 장수는 상대 handCount − revealed.length + deckCount다. 선 고르기 단계(분배 전)에는 후보가 가려져 있으므로 덱 전체다.
 */
export function unseenCards(view: PlayerView): CardId[] {
  const seen = new Set<CardId>(view.seats[view.viewer].hand ?? []);
  const add = (ids: readonly CardId[]): void => {
    for (const id of ids) {
      seen.add(id);
    }
  };
  for (const group of view.floor) {
    add(group.cards);
  }
  for (const seat of view.seats) {
    add(seat.captured.gwang);
    add(seat.captured.yeol);
    add(seat.captured.tti);
    add(seat.captured.pi);
    add(seat.revealed);
  }
  const ctx = view.ctx;
  if (ctx !== null) {
    add(ctx.played === null ? [] : [ctx.played]);
    add(ctx.flipped === null ? [] : [ctx.flipped]);
    add(ctx.heldBonuses);
  }
  return deckCardIds(view.rules.bonusCards).filter((id) => !seen.has(id));
}

/** 손패에서 같은 월 4장인 월 (deal.ts 총통 판정과 같은 순서: 손패에 처음 나온 순) */
function fourOfAKindMonths(hand: readonly CardId[]): Month[] {
  const counts = new Map<Month, number>();
  for (const id of hand) {
    const month = getCard(id).month;
    if (month !== null) {
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
  }
  return [...counts].filter(([, n]) => n === 4).map(([month]) => month);
}

function sameIds(a: readonly CardId[], b: readonly CardId[]): boolean {
  const x = ascending(a);
  const y = ascending(b);
  return x.length === y.length && x.every((id, i) => id === y[i]);
}

/** 표본을 검사하고 상대 전체 손패(공개된 카드 + 숨은 카드)를 돌려준다. 뷰와 모순되면 RangeError. */
function opponentHandOf(view: PlayerView, sample: DeterminizeSample): CardId[] {
  const opp = view.seats[other(view.viewer)];
  const revealed = opp.revealed;
  const given = sample.opponentHand;
  const full = given.length === opp.handCount;
  if (
    (!full && given.length !== opp.handCount - revealed.length) ||
    sample.deck.length !== view.deckCount
  ) {
    throw new RangeError(
      `결정화 표본 장수 불일치: 상대 손패 ${given.length}/${opp.handCount}(공개 ${revealed.length}), 더미 ${sample.deck.length}/${view.deckCount}`,
    );
  }
  if (full && !revealed.every((id) => given.includes(id))) {
    throw new RangeError('결정화 표본의 전체 손패에 상대가 공개한 카드(revealed)가 빠져 있습니다');
  }
  const hand = full ? [...given] : [...revealed, ...given];
  // 선 고르기 단계는 아직 분배 전이라 손패·더미가 비어 있다(장수 검사로 충분).
  if (
    view.phase !== 'chooseFirst' &&
    !sameIds([...hand, ...sample.deck], [...unseenCards(view), ...revealed])
  ) {
    throw new RangeError('결정화 표본이 보이지 않는 카드 집합(unseenCards)과 다릅니다');
  }
  return hand;
}

function resolvePending(
  view: PlayerView,
  sample: DeterminizeSample,
  opponentHand: readonly CardId[],
): Pending | null {
  const shown = view.pending;
  const opponent = other(view.viewer);
  if (sample.pending !== undefined) {
    const valid =
      shown !== null &&
      shown.kind !== 'pickFirst' &&
      sample.pending.kind !== 'pickFirst' &&
      shown.seat === opponent &&
      sample.pending.seat === opponent;
    if (!valid) {
      throw new RangeError('결정화 표본의 pending은 뷰가 가린 상대 프롬프트에만 줄 수 있습니다');
    }
    return sample.pending;
  }
  if (shown?.kind === 'chongtong' && shown.seat === opponent && shown.months.length === 0) {
    const months = fourOfAKindMonths(opponentHand);
    if (months.length === 0) {
      throw new RangeError(
        '상대 총통 프롬프트와 일관되려면 표본 손패에 같은 월 4장이 있어야 합니다',
      );
    }
    return { ...shown, months };
  }
  return shown;
}

function seatState(view: PlayerView, seat: Seat, hand: readonly CardId[]): SeatState {
  const s = view.seats[seat];
  return {
    hand: [...hand],
    captured: s.captured,
    goCount: s.goCount,
    lastGoScore: s.lastGoScore,
    shakes: s.shakes,
    bombs: s.bombs,
    bombTokens: s.bombTokens,
    ppeokTurns: s.ppeokTurns,
    turnsTaken: s.turnsTaken,
    noCaptureStreak: s.noCaptureStreak,
    gukjinAsPi: s.gukjinAsPi,
    score: s.score,
    revealed: s.revealed,
  };
}

/**
 * 뷰와 일관된 전체 GameState를 만든다. 공개 정보(바닥·획득 패·카운터·진행 중인 턴·프롬프트·즉시 정산·이벤트 순번·
 * 결과)는 뷰에서, 숨은 정보(상대 손패·더미 순서·가려진 상대 프롬프트·선 고르기 후보)는 표본에서, PRNG는 rng에서 온다.
 * 실제 상태의 숨은 정보를 그대로 넣으면 원래 상태와 같다(테스트용 고정 덱 round.fixedDeck·firstPick.nextPools는
 * 재현하지 않는다: 각각 null·[]). 표본이 뷰와 모순되면 RangeError.
 *
 * rng: 결정화한 상태의 PRNG 시드(또는 RngState 그대로). 판 도중에는 쓰이지 않고, 선 고르기·재분배에서만 쓰인다.
 */
export function determinize(view: PlayerView, sample: DeterminizeSample, rng: Seed = 0): GameState {
  const opponentHand = opponentHandOf(view, sample);
  const me = view.viewer;
  const myHand = view.seats[me].hand ?? [];
  const seats: [SeatState, SeatState] =
    me === 0
      ? [seatState(view, 0, myHand), seatState(view, 1, opponentHand)]
      : [seatState(view, 0, opponentHand), seatState(view, 1, myHand)];
  let rngState = createRng(rng);
  let firstPick: FirstPickState | null = null;
  const fp = view.firstPick;
  if (fp !== null) {
    let pool = sample.firstPickPool;
    if (pool === undefined) {
      const shuffled = shuffleWith(rngState, deckCardIds(view.rules.bonusCards));
      pool = shuffled.items.slice(0, fp.poolSize);
      rngState = shuffled.rng;
    }
    if (pool.length !== fp.poolSize) {
      throw new RangeError(`선 고르기 후보 장수 불일치: ${pool.length}/${fp.poolSize}`);
    }
    firstPick = {
      pool: [...pool],
      picks: fp.picks,
      ties: fp.ties,
      nextPools: [],
      isNight: fp.isNight,
    };
  }
  return {
    phase: view.phase,
    rules: view.rules,
    rng: rngState,
    dealer: view.dealer,
    turn: view.turn,
    seats,
    floor: view.floor,
    deck: [...sample.deck],
    pending: resolvePending(view, sample, opponentHand),
    ctx: view.ctx,
    firstPick,
    round: {
      number: view.round.number,
      carry: view.round.carry,
      pushes: view.round.pushes,
      fixedDeck: null,
    },
    instantPayouts: view.instantPayouts,
    result: view.result,
    eventSeq: view.eventSeq,
  };
}
