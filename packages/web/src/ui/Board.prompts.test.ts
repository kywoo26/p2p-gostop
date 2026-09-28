// 막힘 방지 속성 테스트 (Vitest 브라우저 모드, M3 리뷰 I-6(a), spec FR-13~16): 사람 좌석에 입력이 필요한
// 모든 pending 종류(선 고르기·총통·내기·흔들기·대상·국진·고/스톱)에서 게임판이 활성 조작 요소를 그리고,
// 그 요소들을 누르면 나오는 액션이 정확히 엔진 legalActions 전부다(빠진 것도, 규칙 밖의 것도 없다).
import {
  deckCardIds,
  legalActions,
  newRound,
  PRESETS,
  sameAction,
  type Action,
  type GameState,
  type PendingKind,
  type RuleOptions,
} from '@p2p-gostop/engine';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { actingSeats } from '../game/session.ts';
import Board from './Board.svelte';
import { boardProps, playRandom, VIEWER } from './random-play.test-helper.ts';

beforeEach(() => {
  // 선택 창의 등장·퇴장 전이를 0ms로 (E2E 즉시 모드와 같다)
  document.documentElement.dataset['speed'] = 'instant';
});

afterEach(() => {
  delete document.documentElement.dataset['speed'];
});

interface Case {
  readonly name: string;
  readonly game: GameState;
}

/** pending 종류·합법 수 종류 조합마다 몇 개씩 모은다 */
function collectCases(): Case[] {
  const cases: Case[] = [];
  const seen = new Map<string, number>();
  const sources: readonly [number, RuleOptions][] = [
    [51, PRESETS.standard],
    [52, { ...PRESETS.arcade, gukjin: 'ask', twoCardBomb: 'double' }],
    [53, { ...PRESETS.standard, gukjin: 'ask' }],
  ];
  for (const [seed, rules] of sources) {
    for (const session of playRandom(seed, rules, 25)) {
      const game = session.game;
      if (session.phase !== 'playing' || !actingSeats(game).includes(VIEWER)) continue;
      const types = [...new Set(legalActions(game, VIEWER).map((a) => a.type))].toSorted();
      const key = `${game.pending?.kind}:${types.join(',')}`;
      const n = seen.get(key) ?? 0;
      if (n >= 3) continue;
      seen.set(key, n + 1);
      cases.push({ name: key, game });
    }
  }
  // 총통(분배 직후, 같은 월 4장)은 무작위 판에서 드물다: 선 손패에만 1월 4장이 오도록 덱을 고정한다
  const rules = PRESETS.standard;
  const dealerHand = [0, 1, 2, 3, 4, 8, 12, 16, 20, 24];
  const rest = deckCardIds(rules.bonusCards).filter((id) => !dealerHand.includes(id));
  const { state } = newRound(rules, 1, { dealer: VIEWER, deck: [...dealerHand, ...rest] });
  expect(state.pending?.kind).toBe('chongtong');
  cases.push({ name: 'chongtong:deal', game: state });
  return cases;
}

const CONTROLS = 'button[data-slot]:not([disabled]), [data-choice]:not([disabled])';

async function actionsFrom(game: GameState): Promise<{ actions: Action[]; controls: number }> {
  const { view, extras } = boardProps(game);
  const actions: Action[] = [];
  const onaction = (action: Action) => actions.push(action);
  const fresh = async () => render(Board, { view, extras, onaction });
  let screen = await fresh();
  const count = screen.container.querySelectorAll(CONTROLS).length;
  await screen.unmount();
  for (let k = 0; k < count; k++) {
    screen = await fresh();
    const before = new Set(screen.container.querySelectorAll(CONTROLS));
    const control = screen.container.querySelectorAll<HTMLElement>(CONTROLS)[k];
    const produced = actions.length;
    control?.click();
    flushSync();
    if (actions.length === produced) {
      // 확인 창을 거치는 조작(폭탄 월 카드 → 폭탄/한 장만/취소): 새로 뜬 선택지를 하나씩 누른다
      const follow = [
        ...screen.container.querySelectorAll<HTMLElement>('[data-choice]:not([disabled])'),
      ].filter((el) => !before.has(el));
      await screen.unmount();
      for (let j = 0; j < follow.length; j++) {
        screen = await fresh();
        screen.container.querySelectorAll<HTMLElement>(CONTROLS)[k]?.click();
        flushSync();
        const choices = [
          ...screen.container.querySelectorAll<HTMLElement>('[data-choice]:not([disabled])'),
        ].filter((el) => el.closest('dialog') !== null);
        choices.find((el) => el.dataset['choice'] === follow[j]?.dataset['choice'])?.click();
        flushSync();
        await screen.unmount();
      }
      continue;
    }
    await screen.unmount();
  }
  return { actions, controls: count };
}

describe('막힘 방지: 활성 조작 요소 = legalActions (M3 리뷰 I-6)', () => {
  test('pending 종류마다 게임판 버튼으로 모든 합법 수를 낼 수 있고 그 밖의 수는 없다', async () => {
    const cases = collectCases();
    const kinds = new Set<PendingKind>();
    const types = new Set<Action['type']>();
    for (const { name, game } of cases) {
      const legal = legalActions(game, VIEWER);
      const { actions, controls } = await actionsFrom(game);
      expect(controls, name).toBeGreaterThan(0);
      for (const action of actions) {
        expect(
          legal.some((a) => sameAction(a, action)),
          `${name}: 규칙 밖 ${JSON.stringify(action)}`,
        ).toBe(true);
      }
      for (const action of legal) {
        expect(
          actions.some((a) => sameAction(a, action)),
          `${name}: 버튼 없음 ${JSON.stringify(action)}`,
        ).toBe(true);
        types.add(action.type);
      }
      if (game.pending !== null) kinds.add(game.pending.kind);
    }
    expect([...kinds].toSorted()).toEqual(
      ['chongtong', 'goStop', 'gukjin', 'pickFirst', 'play', 'shake', 'target'].toSorted(),
    );
    expect([...types].toSorted()).toEqual(
      [
        'bomb',
        'chongtong',
        'chooseTarget',
        'flipOnly',
        'go',
        'gukjin',
        'pickFirst',
        'play',
        'shake',
        'stop',
      ].toSorted(),
    );
  });
});
