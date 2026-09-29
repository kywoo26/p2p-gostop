// 게임판 속성 테스트 (Vitest 브라우저 모드, M3 리뷰 S-2·I-6(b)): 화면에 그려진 숫자(획득패 칸 숫자·장수,
// 족보 진행도, 점수, 뻑·폭탄 횟수, 국진 "쌍피" 표지)가 무작위 판의 액션마다 엔진 ScoreBreakdown과 같다.
// 국진 자동(S5 기본)과 묻기 모드를 모두 돈다.
import { PRESETS, scoreCaptured } from '@p2p-gostop/engine';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Board from './Board.svelte';
import { boardProps, playRandom, VIEWER } from './random-play.test-helper.ts';

beforeEach(() => {
  document.documentElement.dataset['speed'] = 'instant';
});

afterEach(() => {
  delete document.documentElement.dataset['speed'];
});

function pileOf(container: Element, label: string, key: string) {
  const el = container.querySelector<HTMLElement>(`[aria-label="${label}"] [data-pile="${key}"]`);
  if (el === null) throw new Error(`${label} ${key} 칸 없음`);
  return { value: Number(el.dataset['value']), cards: Number(el.dataset['cards']), el };
}

function chip(container: Element, label: string, stat: string): string {
  return (
    container.querySelector(`[aria-label="${label}"] [data-stat="${stat}"]`)?.textContent ?? ''
  ).trim();
}

describe('화면 숫자 = 엔진 ScoreBreakdown (DOM)', () => {
  test.each([
    ['auto', 41],
    ['auto', 42],
    ['ask', 43],
    ['ask', 44],
  ] as const)('국진 %s 시드 %i: 6판 동안 액션마다', async (gukjin, seed) => {
    const rules = { ...PRESETS.standard, gukjin };
    let screen: Awaited<ReturnType<typeof render>> | null = null;
    let checked = 0;
    let asPiSeen = 0;
    for (const session of playRandom(seed, rules, 6)) {
      if (session.phase !== 'playing') continue;
      const { view } = boardProps(session.game, session.ledger.balances);
      if (screen === null) screen = await render(Board, { view });
      else await screen.rerender({ view });
      const game = session.game;
      for (const seat of [0, 1] as const) {
        const engine = game.seats[seat];
        const expected =
          game.ctx === null
            ? engine.score
            : scoreCaptured(engine.captured, engine.score.gukjinAsPi);
        const mine = seat === VIEWER;
        const pileLabel = mine ? '내 획득패' : '상대 획득패';
        const chipLabel = mine ? '내 족보 진행도' : '상대 족보 진행도';
        const where = `판 ${session.roundNumber} 좌석 ${seat} (${game.pending?.kind ?? '-'})`;
        const pi = pileOf(screen.container, pileLabel, 'pi');
        expect(pileOf(screen.container, pileLabel, 'gwang').value, where).toBe(expected.gwangCount);
        expect(pileOf(screen.container, pileLabel, 'yeol').value, where).toBe(expected.yeolCount);
        expect(pileOf(screen.container, pileLabel, 'tti').value, where).toBe(expected.ttiCount);
        expect(pi.value, where).toBe(expected.piCount);
        expect(pi.cards, where).toBe(engine.captured.pi.length + (expected.gukjinAsPi ? 1 : 0));
        expect(chip(screen.container, chipLabel, 'pi'), where).toBe(`피 ${expected.piCount}/10`);
        expect(chip(screen.container, chipLabel, 'gwang'), where).toBe(
          `광 ${expected.gwangCount}/3`,
        );
        expect(chip(screen.container, chipLabel, 'ppeok'), where).toBe(
          `뻑 ${engine.ppeokTurns.length}`,
        );
        expect(chip(screen.container, chipLabel, 'bomb'), where).toBe(`폭탄 ${engine.bombs}`);
        const score = screen.container.querySelector(
          `[data-testid="${mine ? 'my-score' : 'opponent-score'}"]`,
        );
        expect(score?.textContent, where).toBe(String(engine.score.total));
        // 국진을 쌍피로 세면 피 칸 제목에 "국진 쌍피" 표지가 있다
        const gukjinInPi = pi.el.querySelector('.pile-badge');
        expect(gukjinInPi !== null, where).toBe(expected.gukjinAsPi);
        if (expected.gukjinAsPi) asPiSeen += 1;
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
    // 국진을 쌍피로 세는 화면이 실제로 나와야 검사가 의미 있다 (시드 고정)
    expect(asPiSeen).toBeGreaterThan(0);
  });
});
