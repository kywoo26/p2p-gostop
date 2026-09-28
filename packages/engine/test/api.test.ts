// 엔진 공개 API 계약: 거부 사유, 순수성, 뷰 은닉, 리플레이, 헬퍼 오류 처리.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  PRESETS,
  applySettlement,
  cardId,
  cardName,
  CARD_NAMES,
  collectCards,
  createLedger,
  createScenario,
  legalActions,
  newRound,
  playerView,
  reduce,
  redactEvent,
  replay,
  sameAction,
  settle,
  type Action,
  type EngineEvent,
  type GameState,
} from '../src/index.ts';

const c = cardId;

function scenario(): GameState {
  return createScenario({
    hands: [
      [c('5열'), c('12열')],
      [c('10청'), c('10피a')],
    ],
    floor: [c('5초'), c('5피a'), c('8광')],
    deck: [c('11피a'), c('9피a')],
    seats: [{ turnsTaken: 3 }, {}],
  });
}

function mustReduce(
  state: GameState,
  action: Action,
): { state: GameState; events: readonly EngineEvent[] } {
  const result = reduce(state, action);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

describe('reduce 거부 (spec 4.3: 프롬프트 응답 전 다른 액션 거부)', () => {
  it('차례가 아닌 좌석은 notYourTurn', () => {
    const result = reduce(scenario(), { type: 'play', seat: 1, card: c('10청') });
    expect(result).toMatchObject({ ok: false, reason: 'notYourTurn' });
  });

  it('손패에 없는 카드는 illegalAction', () => {
    const result = reduce(scenario(), { type: 'play', seat: 0, card: c('10청') });
    expect(result).toMatchObject({ ok: false, reason: 'illegalAction' });
  });

  it('대상 선택 대기 중 다른 액션은 illegalAction', () => {
    const { state } = mustReduce(scenario(), { type: 'play', seat: 0, card: c('5열') });
    expect(state.pending?.kind).toBe('target');
    expect(reduce(state, { type: 'play', seat: 0, card: c('12열') })).toMatchObject({
      ok: false,
      reason: 'illegalAction',
    });
    expect(reduce(state, { type: 'chooseTarget', seat: 0, card: c('8광') })).toMatchObject({
      ok: false,
      reason: 'illegalAction',
    });
  });

  it('끝난 판은 roundOver', () => {
    const { state } = newRound(PRESETS.standard, 1, {
      dealer: 0,
      // 양측 총통: 선 1월 4장, 후 6월 4장 → 나가리로 즉시 종료
      deck: (
        '1광 1홍 1피a 1피b 2고 2홍 3광 3홍 4고 4초 ' +
        '6열 6청 6피a 6피b 7열 7초 8광 8고 9국진 9청 ' +
        '2피a 3피a 4피a 5열 5초 7피a 11광 12비광'
      )
        .split(' ')
        .map(c),
    });
    expect(state.phase).toBe('end');
    expect(legalActions(state, 0)).toEqual([]);
    expect(reduce(state, { type: 'stop', seat: 0 })).toMatchObject({
      ok: false,
      reason: 'roundOver',
    });
  });

  it('입력 상태를 바꾸지 않는다(순수 함수)', () => {
    const state = scenario();
    const before = JSON.stringify(state);
    mustReduce(state, { type: 'play', seat: 0, card: c('12열') });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('sameAction은 필드 순서와 무관하고 종류·좌석·값을 모두 비교한다', () => {
    const all: Action[] = [
      { type: 'pickFirst', seat: 0, index: 1 },
      { type: 'chongtong', seat: 0, choice: 'end' },
      { type: 'play', seat: 0, card: 1 },
      { type: 'bomb', seat: 0, month: 5 },
      { type: 'flipOnly', seat: 0 },
      { type: 'shake', seat: 0, accept: true },
      { type: 'chooseTarget', seat: 0, card: 2 },
      { type: 'gukjin', seat: 0, asPi: true },
      { type: 'go', seat: 0 },
      { type: 'stop', seat: 0 },
    ];
    for (const [i, a] of all.entries()) {
      for (const [j, b] of all.entries()) {
        expect(sameAction(a, b)).toBe(i === j);
      }
      expect(sameAction(a, { ...a, seat: 1 })).toBe(false);
    }
    expect(sameAction({ seat: 0, card: 1, type: 'play' }, { type: 'play', seat: 0, card: 1 })).toBe(
      true,
    );
  });
});

describe('playerView (spec 4.5: 상대 손패·더미 순서 은닉)', () => {
  it('상대 손패 ID와 더미를 가리고 장수만 남긴다', () => {
    const state = scenario();
    const view = playerView(state, 0);
    expect(view.seats[0].hand).toEqual(state.seats[0].hand);
    expect(view.seats[1].hand).toBeNull();
    expect(view.seats[1].handCount).toBe(2);
    expect(view.deckCount).toBe(state.deck.length);
    expect(JSON.stringify(view)).not.toContain('"deck"');
    expect(JSON.stringify(view)).not.toContain('"rng"');
    expect(view.legal).toEqual(legalActions(state, 0));
    expect(playerView(state, 1).legal).toEqual([]);
  });

  it('선 고르기 후보 카드는 누구에게도 보이지 않는다', () => {
    const { state } = newRound(DEFAULT_RULES, 3);
    const view = playerView(state, 0);
    expect(view.firstPick).toEqual({ poolSize: 8, picks: [null, null], ties: 0 });
    expect(view.legal).toHaveLength(8);
  });

  it('보너스 보충으로 손패에 들어온 카드는 상대에게 가린다', () => {
    const drawn: EngineEvent = { type: 'CardDrawn', seq: 3, seat: 0, cards: [c('8피a')] };
    expect(redactEvent(drawn, 1).cards).toEqual([]);
    expect(redactEvent(drawn, 0)).toBe(drawn);
    const played: EngineEvent = { type: 'CardPlayed', seq: 4, seat: 0, cards: [1], bonus: false };
    expect(redactEvent(played, 1)).toBe(played);
  });

  it('계속하기를 고른 총통의 월은 상대에게 가린다(끝내기는 공개)', () => {
    const base = { seq: 1, seat: 0 as const, cards: [0, 1, 2, 3], months: [1 as const] };
    const continued: EngineEvent = { ...base, type: 'Chongtong', choice: 'continue' };
    const ended: EngineEvent = { ...base, type: 'Chongtong', choice: 'end' };
    expect(redactEvent(continued, 1)).toMatchObject({ cards: [], months: [] });
    expect(redactEvent(ended, 1)).toBe(ended);
    const { state } = newRound(PRESETS.standard, 1, {
      dealer: 0,
      deck: (
        '1광 1홍 1피a 1피b 2고 2홍 3광 3홍 4고 4초 ' +
        '6열 6청 7열 7초 8광 8고 9국진 9청 10열 10청 ' +
        '2피a 3피a 4피a 5열 6피a 7피a 11광 12비광'
      )
        .split(' ')
        .map(c),
    });
    expect(playerView(state, 0).pending).toMatchObject({ kind: 'chongtong', months: [1] });
    expect(playerView(state, 1).pending).toMatchObject({ kind: 'chongtong', months: [] });
  });
});

describe('replay (결정론)', () => {
  it('같은 시드·액션이면 같은 이벤트', () => {
    const rules = PRESETS.standard;
    const first = newRound(rules, 42, { dealer: 0 });
    const legal = legalActions(first.state, 0);
    const actions = legal.slice(0, 1);
    const a = replay(rules, 42, actions, { dealer: 0 });
    const b = replay(rules, 42, actions, { dealer: 0 });
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    expect(a.events.map((e) => e.seq)).toEqual(a.events.map((_, i) => i));
  });

  it('거부되는 액션이 있으면 위치와 사유를 알려준다', () => {
    const result = replay(PRESETS.standard, 42, [{ type: 'go', seat: 0 }], { dealer: 0 });
    expect(result).toMatchObject({ ok: false, index: 0, reason: 'illegalAction' });
  });
});

describe('헬퍼', () => {
  it('카드 이름은 51개이고 ID와 왕복한다', () => {
    expect(CARD_NAMES).toHaveLength(51);
    CARD_NAMES.forEach((name, id) => {
      expect(cardId(name)).toBe(id);
      expect(cardName(id)).toBe(name);
    });
    expect(cardId(7)).toBe(7);
    expect(() => cardId('13광')).toThrow(RangeError);
    expect(() => cardName(51)).toThrow(RangeError);
  });

  it('시나리오는 카드 중복과 덱 밖 카드를 거부한다', () => {
    expect(() => createScenario({ hands: [[1], [1]] })).toThrow(RangeError);
    expect(() =>
      createScenario({ rules: { ...DEFAULT_RULES, bonusCards: 2 }, hands: [[c('B2b')], []] }),
    ).toThrow(RangeError);
    const partial = createScenario({ hands: [[1], [2]], fillDeck: false });
    expect(partial.deck).toEqual([]);
  });

  it('대상 선택 대기 중에도 카드 51장이 보존된다(낸 카드는 진행 중 상태에 있다)', () => {
    const { state } = mustReduce(scenario(), { type: 'play', seat: 0, card: c('5열') });
    expect(collectCards(state).toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 51 }, (_, i) => i),
    );
  });

  it('끝나지 않은 판은 정산할 수 없다', () => {
    expect(() => settle(scenario())).toThrow(RangeError);
  });

  it('나가리 정산은 원장을 바꾸지 않는다', () => {
    const ledger = createLedger(100, 1000);
    const state = scenario();
    const nagari = settle({
      ...state,
      phase: 'end',
      result: { reason: 'exhausted', winner: null },
    });
    expect(applySettlement(ledger, nagari, DEFAULT_RULES)).toBe(ledger);
  });
});
