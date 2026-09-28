// 혼자 연습 E2E (spec AC-04 솔로 절반, AC-06 턴 시간, MN-01 원장 제로섬, 6.2 정산·기록·설정 흐름).
// 사람 좌석은 테스트가 화면의 버튼을 눌러 둔다. 선택 정책은 시드 고정 무작위에 드문 경로 쪽으로 기울였다(M3 리뷰 I-6):
// 고는 세션에서 처음 3번까지 고른다, 총통은 계속하기, 흔들기는 거절부터 번갈아, 폭탄은 폭탄·한 장만 번갈아,
// 국진은 쌍피·열끗 번갈아, 대상·선 고르기·낼 카드는 무작위. 제시·선택 횟수는 window.__auto에 남는다.
import { expect, type Page, test } from '@playwright/test';

interface AutoStats {
  seed: number;
  /** 제시된 선택 창 종류별 횟수 */
  offered: Record<string, number>;
  /** 누른 선택별 횟수 */
  taken: Record<string, number>;
}

/** 브라우저 안에서 한 번 판단하고 누른다. 누를 것이 없으면 false(계속 기다림), 목표 판 수에 닿으면 'done' */
function autoStep(target: number): string | false {
  const w = window as unknown as { __auto?: AutoStats };
  const auto = (w.__auto ??= { seed: 20260928, offered: {}, taken: {} });
  const rand = (n: number) => {
    auto.seed = (Math.imul(auto.seed, 1664525) + 1013904223) >>> 0;
    return auto.seed % n;
  };
  const note = (map: Record<string, number>, key: string) => (map[key] = (map[key] ?? 0) + 1);
  const solo = document.querySelector<HTMLElement>('[data-testid="solo"]');
  if (solo === null) return false;
  const click = (el: Element | null | undefined, name: string): string | false => {
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
    const ids = choices.map((b) => b.dataset['choice'] ?? '');
    const has = (id: string) => ids.includes(id);
    let want: string;
    if (has('go') && has('stop')) {
      note(auto.offered, 'goStop');
      want = (auto.taken['go'] ?? 0) < 3 ? 'go' : 'stop';
    } else if (has('continue')) {
      note(auto.offered, 'chongtong');
      want = 'continue';
    } else if (has('noShake')) {
      want = note(auto.offered, 'shake') % 2 === 1 ? 'noShake' : 'shake';
    } else if (has('bomb')) {
      want = note(auto.offered, 'bomb') % 2 === 1 ? 'bomb' : 'single';
    } else if (has('pi') && has('yeol')) {
      want = note(auto.offered, 'gukjin') % 2 === 1 ? 'pi' : 'yeol';
    } else {
      want = ids[rand(ids.length)] ?? '';
    }
    const pick = choices.find((b) => b.dataset['choice'] === want) ?? choices[0];
    const name = pick?.dataset['choice'] ?? 'choice';
    note(auto.taken, name);
    return click(pick, name);
  }
  const flipOnly = board.querySelector('[data-choice="flipOnly"]');
  if (flipOnly !== null) return click(flipOnly, 'flipOnly');
  const hand = [...board.querySelectorAll('[aria-label="내 손패"] button:not([disabled])')];
  return click(hand[rand(hand.length)], 'play');
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

test('혼자 연습: 쉬움 상대 20판 자동 플레이 · 국진 묻기 · 원장 제로섬 · 콘솔 오류 없음 (AC-04, MN-01)', async ({
  page,
}) => {
  test.setTimeout(8 * 60_000);
  const errors = watchErrors(page);
  // 국진 '매번 묻기'(FR-15): 설정 화면 스위치가 아직 없어 저장된 설정으로 켠다
  await page.addInitScript(() =>
    localStorage.setItem('gostop.settings.v1', JSON.stringify({ gukjinAsk: true })),
  );
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

  // 선택 정책이 드문 경로를 실제로 지났다 (M3 리뷰 I-6: 고·총통 계속·흔들기 거절)
  const auto = await page.evaluate(() => (window as unknown as { __auto: AutoStats }).__auto);
  test.info().annotations.push({
    type: 'solo-actions',
    description: JSON.stringify({ ...Object.fromEntries(counts), auto }),
  });
  console.log(
    `[AC-04] 20판 선택: 제시 ${JSON.stringify(auto.offered)} 누름 ${JSON.stringify(auto.taken)}`,
  );
  expect(auto.offered['goStop'] ?? 0).toBeGreaterThan(0);
  expect(auto.taken['go'] ?? 0).toBeGreaterThanOrEqual(1);
  expect(auto.taken['continue'] ?? 0).toBe(auto.offered['chongtong'] ?? 0);
  if ((auto.offered['shake'] ?? 0) > 0)
    expect(auto.taken['noShake'] ?? 0).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('혼자 연습: 빠름 속도 · 탭→턴 종료 ≤ 700ms (AC-06, spec 6.4)', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const errors = watchErrors(page);
  await startSolo(page, '', '쉬움');
  const read = async () =>
    ((await page.getByTestId('solo').getAttribute('data-play-timings')) ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number);
  // 표본 5개 이상 (한 판에 보통 7~10번 낸다)
  let timings: number[] = [];
  for (let rounds = 1; rounds <= 3; rounds++) {
    await playRounds(page, rounds);
    timings = await read();
    if (timings.length >= 5) break;
  }
  expect(timings.length).toBeGreaterThanOrEqual(5);
  const sorted = [...timings].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const p50 = at(0.5);
  const p90 = at(0.9);
  const max = sorted.at(-1) ?? 0;
  const line = `n=${timings.length} p50=${p50} p90=${p90} max=${max} all=${sorted.join(',')}`;
  test.info().annotations.push({ type: 'turn-ms', description: line });
  console.log(`[AC-06] 탭→턴 종료 ms (${test.info().project.name}): ${line}`);
  // spec 6.4: 700ms(빠름). 최댓값은 CI 러너의 흔들림을 흡수하도록 900ms까지 허용한다(이슈 #20)
  expect(p50).toBeLessThanOrEqual(700);
  expect(max).toBeLessThanOrEqual(900);
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
