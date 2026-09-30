// NF-03·AC-06·NP-03: 실제 망/중계 없이 고정 턴의 main-thread 정지와 화면 이탈을 검사한다.
import { expect, test } from '@playwright/test';
import { TIMING_FIXTURES, timingSave } from './timing-fixtures.ts';

test('합성 main-thread 100ms 정지 뒤 카드·점수·입력 잠금이 수렴한다 @guest', async ({
  page,
}, testInfo) => {
  const fixture = TIMING_FIXTURES.find((f) => f.id === 'match-capture')!;
  const save = timingSave(fixture);
  await page.goto('./?speed=fast#/');
  await page.evaluate(
    (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
    save,
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
  // MutationObserver는 이 시험에서만 사용. 제품에는 프레임/DOM 관찰기를 추가하지 않는다.
  await page.evaluate((card) => {
    const slots = () =>
      Object.fromEntries(
        [...document.querySelectorAll<HTMLElement>('[data-floor-slot]')].flatMap((li) =>
          [...li.querySelectorAll<HTMLElement>('[data-card-id]')].map((el) => [
            el.dataset['cardId'],
            li.dataset['floorSlot'],
          ]),
        ),
      );
    const observation = { before: slots(), changes: [] as Record<string, string>[] };
    (window as unknown as { __floor: typeof observation }).__floor = observation;
    const observer = new MutationObserver(() =>
      observation.changes.push(slots() as Record<string, string>),
    );
    observer.observe(document.querySelector('[data-testid="board"]')!, {
      subtree: true,
      attributes: true,
      childList: true,
    });
    document.querySelector<HTMLElement>(`[aria-label="내 손패"] [data-slot="${card}"]`)!.click();
    document.querySelector<HTMLElement>('[data-testid="game-menu"]')!.click();
    setTimeout(() => {
      const end = performance.now() + 100;
      while (performance.now() < end) {
        /* 합성 긴 작업: 네트워크 지연과 별개 */
      }
    }, 50);
    setTimeout(() => observer.disconnect(), 1500);
  }, fixture.card);
  await expect(page.getByTestId('board')).toHaveAttribute('data-busy', 'false');
  await expect(page.getByTestId('solo')).toHaveAttribute('data-play-timings', /^\d+$/);
  const observed = await page.evaluate(() => {
    const ids = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="board"] [data-card-id]'),
    ].map((el) => Number(el.dataset['cardId']));
    const saved = JSON.parse(localStorage.getItem('gostop.solo.v1')!);
    return {
      ids,
      actions: saved.session.actions,
      floorIds: [...document.querySelectorAll<HTMLElement>('[aria-label="바닥"] [data-card-id]')]
        .map((el) => Number(el.dataset['cardId']))
        .sort((a, b) => a - b),
      expectedFloor: saved.session.game.floor
        .flatMap((group: { cards: number[] }) => group.cards)
        .sort((a: number, b: number) => a - b),
      score: saved.session.game.seats[0].score.total,
      floor: (window as unknown as { __floor: unknown }).__floor,
    };
  });
  expect(new Set(observed.ids).size).toBe(observed.ids.length);
  expect(
    observed.actions
      .slice(save.session.actions.length)
      .filter(
        (a: { type: string; seat: number; card?: number }) =>
          a.type === 'play' && a.seat === 0 && a.card === fixture.card,
      ),
  ).toHaveLength(1);
  expect(observed.floorIds).toEqual(observed.expectedFloor);
  await expect(page.getByTestId('my-score')).toHaveText(String(observed.score));
  // 슬롯 변경은 레이아웃 소유자에게 넘기는 재현 자료이며, 안정 슬롯 구현 완료로 판정하지 않는다.
  await testInfo.attach('synthetic-floor-slots', {
    body: JSON.stringify(observed.floor),
    contentType: 'application/json',
  });
  await page.locator('[data-menu="home"]').click();
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-busy', 'false');
});
