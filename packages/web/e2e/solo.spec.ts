// 혼자 연습 E2E (spec AC-04 솔로 절반, AC-06 턴 시간 계측, MN-01 원장 제로섬, 6.2 정산·기록·설정 흐름).
// 사람 좌석은 테스트가 화면의 버튼을 눌러 둔다: 프롬프트가 있으면 그 버튼, 없으면 낼 수 있는 첫 손패.
import { expect, type Page, test } from '@playwright/test';

/** 브라우저 안에서 한 번 판단하고 누른다. 누를 것이 없으면 false(계속 기다림), 목표 판 수에 닿으면 'done' */
function autoStep(target: number): string | false {
  const solo = document.querySelector<HTMLElement>('[data-testid="solo"]');
  if (solo === null) return false;
  const click = (el: Element | null, name: string): string | false => {
    if (!(el instanceof HTMLElement)) return false;
    el.click();
    return name;
  };
  const refill = document.querySelector('[data-choice="refill"]');
  if (refill !== null) return click(refill, 'refill');
  const next = document.querySelector('[data-choice="next"]');
  if (next !== null) {
    if (Number(solo.dataset['roundsPlayed']) >= target) return 'done';
    return click(next, 'next');
  }
  const board = document.querySelector('[data-testid="board"][data-awaiting="me"]');
  if (board === null) return false;
  const choices = [...board.querySelectorAll<HTMLButtonElement>('dialog [data-choice]')].filter(
    (b) => !b.disabled,
  );
  if (choices.length > 0) {
    // 판을 빨리 끝내도록 스톱, 그 밖에는 폭탄·흔들기를 골라 드문 경로도 지나가게 한다
    const prefer = ['stop', 'bomb', 'shake'];
    const pick = choices.find((b) => prefer.includes(b.dataset['choice'] ?? '')) ?? choices[0];
    return click(pick ?? null, pick?.dataset['choice'] ?? 'choice');
  }
  const flipOnly = board.querySelector('[data-choice="flipOnly"]');
  if (flipOnly !== null) return click(flipOnly, 'flipOnly');
  return click(board.querySelector('[aria-label="내 손패"] button:not([disabled])'), 'play');
}

async function playRounds(page: Page, target: number) {
  const counts = new Map<string, number>();
  for (let i = 0; i < 5000; i++) {
    const handle = await page.waitForFunction(autoStep, target, { polling: 30, timeout: 60_000 });
    const result = String(await handle.jsonValue());
    counts.set(result, (counts.get(result) ?? 0) + 1);
    if (result === 'done') return counts;
  }
  throw new Error('판이 끝나지 않습니다');
}

async function ledger(page: Page) {
  const solo = page.getByTestId('solo');
  const nums = async (name: string) =>
    ((await solo.getAttribute(name)) ?? '').split(',').filter(Boolean).map(Number);
  return {
    balances: await nums('data-balances'),
    refilled: await nums('data-refilled'),
    start: Number(await solo.getAttribute('data-start-balance')),
    rounds: Number(await solo.getAttribute('data-rounds-played')),
  };
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

async function startSolo(page: Page, query: string, difficulty: string) {
  await page.goto(`./${query}#/`);
  await page.getByRole('button', { name: '혼자 연습' }).click();
  await page.getByRole('radio', { name: new RegExp(difficulty) }).check();
  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.getByTestId('board')).toBeVisible();
}

test('혼자 연습: 쉬움 상대 20판 자동 플레이 · 원장 제로섬 · 콘솔 오류 없음 (AC-04, MN-01)', async ({
  page,
}) => {
  test.setTimeout(8 * 60_000);
  const errors = watchErrors(page);
  await startSolo(page, '?speed=instant', '쉬움');

  const counts = await playRounds(page, 20);
  const { balances, refilled, start, rounds } = await ledger(page);
  expect(rounds).toBe(20);
  // MN-01: 원장은 두 좌석 사이의 이동뿐이다 (재충전은 별도 합계)
  expect(balances.reduce((a, b) => a + b, 0)).toBe(start * 2 + refilled.reduce((a, b) => a + b, 0));
  for (const b of balances) expect(b).toBeGreaterThanOrEqual(0);

  // MN-05: 같은 원장이 저장되어 있다
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gostop.solo.v1') ?? 'null'),
  );
  expect(saved?.session?.ledger?.balances).toEqual(balances);
  expect(saved?.session?.records).toHaveLength(20);

  // 기록 화면(FR-19): 20판 목록
  await page.locator('[data-choice="end"]').click();
  await expect(page.getByRole('heading', { name: '기록' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(21);

  test.info().annotations.push({
    type: 'solo-actions',
    description: JSON.stringify(Object.fromEntries(counts)),
  });
  expect(errors).toEqual([]);
});

test('혼자 연습: 빠름 속도 한 판 · 탭→턴 종료 시간 기록 (AC-06, spec 6.4)', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const errors = watchErrors(page);
  await startSolo(page, '', '쉬움');
  await playRounds(page, 1);

  const raw = (await page.getByTestId('solo').getAttribute('data-play-timings')) ?? '';
  const timings = raw.split(',').filter(Boolean).map(Number);
  expect(timings.length).toBeGreaterThan(0);
  const sorted = [...timings].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const max = sorted.at(-1) ?? 0;
  // 턴 예산 700ms(빠름)는 지금은 기록만 한다: 도커 로컬 p50 570~635ms지만 2코어 CI 러너의 WebKit은
  // p50 660~700ms대로 흔들린다. 결과는 테스트 주석과 로그에 남긴다(docs/ui.md 3장).
  test.info().annotations.push({
    type: 'turn-ms',
    description: `n=${timings.length} p50=${p50} max=${max} all=${timings.join(',')}`,
  });
  console.log(`[AC-06] 탭→턴 종료 ms: n=${timings.length} p50=${p50} max=${max}`);
  expect(errors).toEqual([]);
});

test('정산 → 다음 판, 설정 저장, 홈 이어하기 (spec 6.2, MN-05)', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  // 설정: 점당 200이면 시작 잔액도 비례해서 바뀐다(MN-04)
  await page.goto('./?speed=instant#/settings');
  await page.getByRole('combobox').selectOption('200');
  await expect(page.getByText('300,000냥')).toBeVisible();
  await page.goto('./?speed=instant#/settings');
  await expect(page.getByRole('combobox')).toHaveValue('200');

  await startSolo(page, '?speed=instant', '보통');
  await playRounds(page, 1);
  await expect(page.getByRole('heading', { name: '정산', exact: true })).toBeVisible();
  const { start } = await ledger(page);
  expect(start).toBe(300_000);

  // 새로 열어도 홈에서 이어할 수 있다
  await page.goto('./?speed=instant#/');
  await page.getByRole('button', { name: /이어하기/ }).click();
  await expect(page.getByRole('heading', { name: '정산', exact: true })).toBeVisible();
  await page.locator('[data-choice="next"]').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-round', '2');
});
