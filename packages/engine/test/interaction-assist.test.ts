// C01·C02·C05 수용 기준: 규칙 근거는 rules-commercial.md §12 R1/R7/B1~4/S1~5/E1/E6/E9~11/G1~2.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  PRESETS,
  cardId,
  determinize,
  equivalentTargets,
  guaranteedCaptures,
  legalActions,
  matchPreview,
  playerView,
  reduce,
  settle,
  uniqueLegalAction,
  unseenCards,
  type Action,
  type CardId,
  type GameState,
  type PlayerView,
} from '../src/index.ts';
import { createScenario, type ScenarioSetup } from '../src/testing.ts';

const c = cardId;

function applied(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(result.message);
  return result.state;
}

function targetState(source: 'play' | 'flip', floor: readonly CardId[]): GameState {
  const state = createScenario({
    hands: [[c(source === 'play' ? '8광' : '5열')], [c('10열')]],
    floor,
    deck: [c('8고'), c('10청')],
  });
  return applied(state, { type: 'play', seat: 0, card: c(source === 'play' ? '8광' : '5열') });
}

function captureView(
  hand: readonly CardId[],
  floor: readonly CardId[],
  captured: readonly [readonly CardId[], readonly CardId[]] = [[], []],
  extra: Partial<ScenarioSetup> = {},
): PlayerView {
  return playerView(
    createScenario({
      hands: [hand, [c('10열')]],
      floor,
      captured,
      ...extra,
    }),
    extra.turn ?? 0,
  );
}

function assessment(view: PlayerView, card: CardId) {
  const found = guaranteedCaptures(view).find((item) => item.card === card);
  if (found === undefined) throw new Error(`판정 누락: ${card}`);
  return found;
}

describe('equivalentTargets · C01/Q01 · #107', () => {
  it.each(['play', 'flip'] as const)(
    '%s 대상: 같은 월 일반피 두 장은 최소 ID로 대표한다',
    (source) => {
      const state = targetState(source, [c('8피b'), c('8피a')]);
      const pending = state.pending;
      if (pending?.kind !== 'target') throw new Error('대상 선택 대기 아님');
      expect(equivalentTargets(state, pending)).toEqual({
        equivalent: true,
        representative: c('8피a'),
      });
      expect(equivalentTargets(playerView(state, 0), pending)).toEqual({
        equivalent: true,
        representative: c('8피a'),
      });
      expect(equivalentTargets(playerView(state, 1), pending)).toEqual({
        equivalent: true,
        representative: c('8피a'),
      });
    },
  );

  it('다른 종류·피 가치·특수 족보 역할은 자동 선택하지 않는다', () => {
    const cases = [
      { hand: c('11광'), floor: [c('11피a'), c('11쌍피')] },
      { hand: c('9피a'), floor: [c('9국진'), c('9청')] },
      { hand: c('8피a'), floor: [c('8광'), c('8고')] },
      { hand: c('1피a'), floor: [c('1광'), c('1홍')] },
    ];
    for (const { hand, floor } of cases) {
      const state = applied(createScenario({ hands: [[hand], [c('10열')]], floor }), {
        type: 'play',
        seat: 0,
        card: hand,
      });
      if (state.pending?.kind !== 'target') throw new Error('대상 선택 대기 아님');
      expect(equivalentTargets(state, state.pending)).toEqual({
        equivalent: false,
        representative: null,
      });
    }
  });

  it('오래된 pending, 중복 후보와 다른 종류의 pending은 자동 선택하지 않는다', () => {
    const state = targetState('play', [c('8피a'), c('8피b')]);
    if (state.pending?.kind !== 'target') throw new Error('대상 선택 대기 아님');
    expect(
      equivalentTargets(state, { ...state.pending, options: [c('8피a'), c('8피a')] }).equivalent,
    ).toBe(false);
    expect(equivalentTargets(state, { ...state.pending, source: 'flip' }).equivalent).toBe(false);
    expect(equivalentTargets(state, { kind: 'play', seat: 0 }).equivalent).toBe(false);
  });

  it('속성: 동등한 두 대상은 선택 순서·좌석과 무관하게 같은 정산을 만든다', () => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...months),
        fc.boolean(),
        fc.constantFrom(0, 1),
        (month, reverse, seat) => {
          const cards = CARDS.filter((card) => card.month === month);
          const pair = cards.filter((card) => card.kind === 'pi' && card.piValue === 1);
          const played = cards.find((card) => card.kind !== 'pi');
          if (pair.length !== 2 || played === undefined) throw new Error('카탈로그 일반피 쌍 없음');
          const floor = pair.map((card) => card.id);
          const state = applied(
            createScenario({
              hands: seat === 0 ? [[played.id], [c('12열')]] : [[c('12열')], [played.id]],
              floor: reverse ? floor.toReversed() : floor,
              deck: [c('12비광')],
              turn: seat,
            }),
            { type: 'play', seat, card: played.id },
          );
          if (state.pending?.kind !== 'target') throw new Error('대상 선택 대기 아님');
          expect(equivalentTargets(state, state.pending)).toEqual({
            equivalent: true,
            representative: Math.min(...floor),
          });
          const settled = floor.map((card) => {
            const chosen = applied(state, { type: 'chooseTarget', seat, card });
            return settle({
              ...chosen,
              phase: 'end',
              pending: null,
              result: { reason: 'stop', winner: seat },
            });
          });
          expect(settled[0]).toEqual(settled[1]);
        },
      ),
    );
  });
});

describe('uniqueLegalAction · C02 · #108', () => {
  it('유일한 play와 폭탄패 뒤 flipOnly는 반환한다', () => {
    const play = [{ type: 'play', seat: 0, card: c('5열') }] as const;
    const flip = [{ type: 'flipOnly', seat: 1 }] as const;
    expect(uniqueLegalAction(play)).toEqual(play[0]);
    expect(uniqueLegalAction(flip)).toEqual(flip[0]);
    expect(uniqueLegalAction([])).toBeNull();
  });

  it('손패1+flipOnly와 play+bomb는 실제 합법 수가 복수다', () => {
    const token = createScenario({
      hands: [[c('5열')], [c('10열')]],
      floor: [c('8광')],
      seats: [{ bombTokens: 1 }, {}],
    });
    expect(legalActions(token, 0).map((item) => item.type)).toEqual(['play', 'flipOnly']);
    expect(uniqueLegalAction(legalActions(token, 0))).toBeNull();
    const bomb = createScenario({
      hands: [[c('5열'), c('5초'), c('5피a')], [c('10열')]],
      floor: [c('5피b')],
    });
    expect(legalActions(bomb, 0).some((item) => item.type === 'bomb')).toBe(true);
    expect(uniqueLegalAction(legalActions(bomb, 0))).toBeNull();
  });

  it('단독 push와 모든 결정 프롬프트는 자동 반환하지 않는다', () => {
    const nonPlay: Action[] = [
      { type: 'push', seat: 0 },
      { type: 'go', seat: 0 },
      { type: 'stop', seat: 0 },
      { type: 'shake', seat: 0, accept: false },
      { type: 'gukjin', seat: 0, asPi: true },
      { type: 'chongtong', seat: 0, choice: 'continue' },
      { type: 'pickFirst', seat: 0, index: 0 },
      { type: 'chooseTarget', seat: 0, card: c('8피a') },
      { type: 'bomb', seat: 0, month: 5 },
    ];
    for (const action of nonPlay) expect(uniqueLegalAction([action])).toBeNull();
  });

  it('속성: 전체 목록이 정확히 하나의 play/flipOnly일 때만 그 수를 반환한다', () => {
    const choices: Action[] = [
      { type: 'play', seat: 0, card: c('5열') },
      { type: 'flipOnly', seat: 0 },
      { type: 'bomb', seat: 0, month: 5 },
      { type: 'push', seat: 0 },
    ];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...choices), { maxLength: 5 }), (legal) => {
        const expected =
          legal.length === 1 && ['play', 'flipOnly'].includes(legal[0]?.type ?? '')
            ? legal[0]
            : null;
        expect(uniqueLegalAction(legal)).toEqual(expected);
      }),
    );
  });
});

describe('guaranteedCaptures · C05/CF01~16 · #109', () => {
  it('CF01: 손1/바닥1/획득2는 어느 좌석의 획득패든 확정이다', () => {
    for (const captured of [
      [[c('5초'), c('5피a')], []],
      [[], [c('5초'), c('5피a')]],
      [[c('5초')], [c('5피a')]],
    ] as const) {
      expect(assessment(captureView([c('5열')], [c('5피b')], captured), c('5열'))).toMatchObject({
        certainty: 'guaranteed',
        reason: 'noOpponentMonth',
      });
    }
  });

  it('CF02·05·06: 손2/바닥2의 양쪽 손패는 확정이며 폭탄 토글과 대상 가치에 독립이다', () => {
    for (const twoCardBomb of ['off', 'double'] as const) {
      const rules = { ...PRESETS.standard, twoCardBomb };
      const view = captureView([c('5열'), c('5초')], [c('5피a'), c('5피b')], [[], []], { rules });
      expect(assessment(view, c('5열')).certainty).toBe('guaranteed');
      expect(assessment(view, c('5초')).certainty).toBe('guaranteed');
    }
    const mixed = captureView([c('8피a'), c('8피b')], [c('8광'), c('8고')]);
    expect(assessment(mixed, c('8피a')).certainty).toBe('guaranteed');
    const target = applied(
      createScenario({ hands: [[c('8피a')], [c('10열')]], floor: [c('8광'), c('8고')] }),
      { type: 'play', seat: 0, card: c('8피a') },
    );
    const pending = target.pending;
    if (pending?.kind !== 'target') throw new Error('대상 선택 대기 아님');
    expect(equivalentTargets(target, pending).equivalent).toBe(false);
  });

  it('CF03·04: bomb 가능 손3/바닥1과 자연뻑 손1/바닥3도 확정이다', () => {
    const bomb = captureView([c('5열'), c('5초'), c('5피a')], [c('5피b')]);
    expect(bomb.legal.some((action) => action.type === 'bomb')).toBe(true);
    expect(assessment(bomb, c('5열')).certainty).toBe('guaranteed');
    const pile = captureView([c('5열')], [c('5초'), c('5피a'), c('5피b')]);
    expect(assessment(pile, c('5열')).certainty).toBe('guaranteed');
  });

  it('CF07·08·10: unseen에 같은 월이 남으면 마지막 턴이어도 match다', () => {
    expect(assessment(captureView([c('5열')], [c('5초')]), c('5열'))).toMatchObject({
      certainty: 'match',
      reason: 'unseenMonth',
    });
    expect(assessment(captureView([c('5열')], [c('5초'), c('5피a')]), c('5열')).certainty).toBe(
      'match',
    );
    const last = captureView([c('5열')], [c('5초')], [[], []], { seats: [{ turnsTaken: 9 }, {}] });
    expect(assessment(last, c('5열')).certainty).toBe('match');
  });

  it('CF09: unseen에 같은 월이 없어도 상대 공개 손패에 있으면 먹을 수 있음이다', () => {
    const view = captureView([c('5열')], [c('5초')], [[], []], {
      hands: [[c('5열')], [c('5피a'), c('5피b')]],
      seats: [{}, { revealed: [c('5피a'), c('5피b')] }],
    });
    expect(unseenCards(view).some((id) => CARDS[id]?.month === 5)).toBe(false);
    expect(assessment(view, c('5열'))).toMatchObject({
      certainty: 'match',
      reason: 'opponentRevealedMonth',
    });
  });

  it('CF11·12·13: 바닥 짝 없음, 보너스, 상대 차례에서는 none이다', () => {
    const noFloor = captureView([c('5열'), c('5초'), c('5피a')], [c('8광')]);
    expect(assessment(noFloor, c('5열'))).toMatchObject({
      certainty: 'none',
      reason: 'noFloorMatch',
    });
    const bonus = captureView([c('B2a')], [c('5열')]);
    expect(assessment(bonus, c('B2a'))).toMatchObject({ certainty: 'none', reason: 'bonus' });
    const flipOnly = playerView(
      createScenario({
        hands: [[], [c('10열')]],
        floor: [c('5열')],
        seats: [{ bombTokens: 1 }, {}],
      }),
      0,
    );
    expect(flipOnly.legal).toEqual([{ type: 'flipOnly', seat: 0 }]);
    expect(guaranteedCaptures(flipOnly)).toEqual([]);
    const notTurn = playerView(
      createScenario({ hands: [[c('5열')], [c('10열')]], floor: [c('5초')] }),
      1,
    );
    expect(assessment(notTurn, c('10열'))).toMatchObject({
      certainty: 'none',
      reason: 'notPlayable',
    });
    const state = createScenario({ hands: [[c('5열')], [c('10열')]], floor: [c('5초')] });
    const inactive = playerView({ ...state, pending: { kind: 'goStop', seat: 0, score: 7 } }, 0);
    expect(assessment(inactive, c('5열'))).toMatchObject({
      certainty: 'none',
      reason: 'notPlayable',
    });
  });

  it('CF14·15: 서로 다른 월은 독립이며 미래 소유·사건 이름을 반환하지 않는다', () => {
    const view = captureView(
      [c('5열'), c('6열')],
      [c('5초'), c('6청')],
      [
        [c('5피a'), c('6피a')],
        [c('5피b'), c('6피b')],
      ],
    );
    expect(assessment(view, c('5열')).certainty).toBe('guaranteed');
    expect(assessment(view, c('6열')).certainty).toBe('guaranteed');
    expect(guaranteedCaptures(view).every((item) => 'certainty' in item && 'reason' in item)).toBe(
      true,
    );
  });

  it('CF16: 국진 위치와 보너스 피 가치는 unseen 월 판정에 영향이 없다', () => {
    const setup = {
      hands: [[c('9피a')], [c('10열')]],
      floor: [c('9피b')],
      captured: [
        [c('9국진'), c('B2a')],
        [c('9청'), c('B3')],
      ],
    } as const;
    for (const asPi of [false, true]) {
      const state = createScenario({ ...setup, seats: [{ gukjinAsPi: asPi }, {}] });
      expect(assessment(playerView(state, 0), c('9피a')).certainty).toBe('guaranteed');
    }
  });

  it('속성: guaranteed는 항상 matchable의 부분집합이며 공개/숨은 배치 치환에 불변이다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 3 }),
        fc.boolean(),
        (month, split, withFloor) => {
          const ids = CARDS.filter((card) => card.month === month).map((card) => card.id);
          const [played, ...rest] = ids;
          if (played === undefined || rest[0] === undefined) throw new Error('월 카드 누락');
          const publicRest = rest.slice(1, split + 1);
          const opponent = month === 10 ? c('11광') : c('10열');
          const view = captureView([played], withFloor ? [rest[0]] : [], [publicRest, []], {
            hands: [[played], [opponent]],
          });
          const result = assessment(view, played);
          const matchable = result.certainty === 'match' || result.certainty === 'guaranteed';
          expect(matchable).toBe(matchPreview(view, view.viewer, played).floor.length > 0);
          expect(result.certainty).toBe(withFloor ? (split >= 2 ? 'guaranteed' : 'match') : 'none');
          const unseen = unseenCards(view);
          const first = determinize(view, { opponentHand: [unseen[0]!], deck: unseen.slice(1) });
          const swapped = determinize(view, {
            opponentHand: [unseen[1]!],
            deck: [unseen[0]!, ...unseen.slice(2)],
          });
          expect(guaranteedCaptures(playerView(first, 0))).toEqual(
            guaranteedCaptures(playerView(swapped, 0)),
          );
        },
      ),
    );
  });

  it('속성: 같은 월 두 장을 획득패에서 상대 공개 손패로 옮기면 확정이 match가 된다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.constantFrom(0, 1),
        fc.boolean(),
        (month, viewer, reverse) => {
          const ids = CARDS.filter((card) => card.month === month).map((card) => card.id);
          const [played, floor, ...pair] = ids;
          if (played === undefined || floor === undefined || pair.length !== 2) {
            throw new Error('월 카드 누락');
          }
          const other = CARDS.find((card) => card.month !== null && card.month !== month);
          if (other === undefined) throw new Error('다른 월 카드 누락');
          const orderedPair = reverse ? pair.toReversed() : pair;
          const publicCaptured = playerView(
            createScenario({
              hands: viewer === 0 ? [[played], [other.id]] : [[other.id], [played]],
              floor: [floor],
              captured: [orderedPair, []],
              turn: viewer,
            }),
            viewer,
          );
          const opponentRevealed = playerView(
            createScenario({
              hands: viewer === 0 ? [[played], orderedPair] : [orderedPair, [played]],
              floor: [floor],
              seats:
                viewer === 0 ? [{}, { revealed: orderedPair }] : [{ revealed: orderedPair }, {}],
              turn: viewer,
            }),
            viewer,
          );
          for (const view of [publicCaptured, opponentRevealed]) {
            expect(unseenCards(view).some((id) => CARDS[id]?.month === month)).toBe(false);
            expect(matchPreview(view, viewer, played).floor).toEqual([floor]);
          }
          expect(assessment(publicCaptured, played)).toMatchObject({
            certainty: 'guaranteed',
            reason: 'noOpponentMonth',
          });
          expect(assessment(opponentRevealed, played)).toMatchObject({
            certainty: 'match',
            reason: 'opponentRevealedMonth',
          });
        },
      ),
    );
  });
});
