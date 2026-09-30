// #206 / FR-40·FR-23·NF-08: 실제 이어하기 화면, 합성 저장본만 사용한다.
import { expect, test } from '@playwright/test';
import { TIMING_FIXTURES, timingSave } from './timing-fixtures.ts';

for (const [difficulty, label] of [
  ['easy', '쉬움'],
  ['normal', '보통'],
  ['commercial', '상용급'],
] as const) {
  test(`${label} 이름/난이도 분리 · 좁은 화면/reduced @layout`, async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const original = timingSave(TIMING_FIXTURES.find((f) => f.id === 'match-capture')!);
    const name = `컴퓨터 · ${label}`;
    const save = {
      ...original,
      difficulty,
      session: { ...original.session, config: { ...original.session.config, names: ['나', name] } },
    };
    await page.goto('./?speed=instant#/');
    await page.evaluate(
      (value) => localStorage.setItem('gostop.solo.v1', JSON.stringify(value)),
      save,
    );
    await page.reload();
    await page.getByRole('button', { name: /이어하기/ }).click();
    await expect(page.getByTestId('solo')).toHaveAttribute('data-can-act', 'true');
    await expect(page.locator('.table-heading strong')).toHaveText('컴퓨터');
    await expect(page.locator('.opponent-hud .name')).toHaveText('컴퓨터');
    await expect(page.locator('.opponent-hud .seat-bar')).toHaveAttribute(
      'aria-label',
      `상대 ${name} 점수판`,
    );
    const menu = page.getByTestId('game-menu');
    const size = await menu.boundingBox();
    expect(size!.width).toBeGreaterThanOrEqual(48);
    expect(size!.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    await expect(page).toHaveScreenshot(`labels-${difficulty}-after.png`);
    // 기존 결합 문구의 합성 비교: 동일 DOM/fixture에서 화면 이름만 기존 값으로 복원한다.
    // 원본 코드 실행 캡처나 사용자 인지 측정으로 주장하지 않는다.
    await page.locator('.table-heading strong').evaluate((el, value) => {
      el.textContent = value;
    }, name);
    await page.locator('.opponent-hud .name').evaluate((el, value) => {
      el.textContent = value;
    }, name);
    await page.screenshot({ path: info.outputPath(`labels-${difficulty}-before-synthetic.png`) });
    await expect(page).toHaveScreenshot(`labels-${difficulty}-before-synthetic.png`);
    await page.locator('.table-heading strong').evaluate((el) => {
      el.textContent = '컴퓨터';
    });
    await page.locator('.opponent-hud .name').evaluate((el) => {
      el.textContent = '컴퓨터';
    });
    await menu.click();
    await page.getByRole('button', { name: '판 정보 · 족보 진행' }).click();
    const dialog = page.getByRole('dialog', { name: '판 정보', exact: true });
    await expect(dialog).toContainText(`컴퓨터 난이도: ${label}`);
    await expect(dialog).toContainText(`상대: ${name}`);
    await expect(page).toHaveScreenshot(`labels-${difficulty}-info.png`);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gostop.solo.v1')!));
    expect(stored.difficulty).toBe(difficulty);
    expect(stored.session.config.names).toEqual(['나', name]);
    expect(stored.session.actions).toEqual(save.session.actions);
  });
}
