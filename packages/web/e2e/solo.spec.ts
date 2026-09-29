// 혼자 연습 E2E (spec AC-04 솔로 절반, AC-06 턴 시간, MN-01 원장 제로섬, 6.2 정산·기록·설정 흐름).
// 사람 좌석은 테스트가 화면의 버튼을 눌러 둔다. 선택 정책은 시드 고정 무작위에 드문 경로 쪽으로 기울였다(M3 리뷰 I-6):
// 고는 세션에서 처음 3번까지 고른다, 총통은 계속하기, 흔들기는 거절부터 번갈아, 폭탄은 폭탄·한 장만 번갈아,
// 국진은 쌍피·열끗 번갈아, 대상·선 고르기·낼 카드는 무작위. 제시·선택 횟수는 window.__auto에 남는다.
// 턴 시간 계측(@timing)은 playwright.config.ts의 전용 프로젝트에서 다른 테스트가 끝난 뒤 브라우저별로 차례로 돈다.
import { expect, type Page, test } from '@playwright/test';
import { TIMING_FIXTURES, timingSave, type TimingFixture } from './timing-fixtures.ts';

interface AutoStats {
  seed: number;
  /** 제시된 선택 창 종류별 횟수 */
  offered: Record<string, number>;
  /** 누른 선택별 횟수 */
  taken: Record<string, number>;
  /** 마지막으로 낸 수(손패·폭탄·한 장만·폭탄패 뒤집기)가 기록될 턴 시간 순번. 손패를 다시 내면 바뀐다 */
  lastPlay: number | null;
  /** 낸 뒤 내 선택 창(대상·고/스톱·국진 등)으로 이어진 턴 시간 순번 (spec 6.4 "선택 없을 때"가 아님) */
  promptAfter: number[];
}

/** 브라우저 안에서 한 번 판단하고 누른다. 누를 것이 없으면 false(계속 기다림), 목표 판 수에 닿으면 'done' */
function autoStep(target: number): string | false {
  const w = window as unknown as { __auto?: AutoStats };
  const auto = (w.__auto ??= {
    seed: 20260928,
    offered: {},
    taken: {},
    lastPlay: null,
    promptAfter: [],
  });
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
  // 턴 시간이 기록되는 수(Game.svelte: play·bomb·flipOnly)를 누를 때 그 수가 받을 순번을 적어 둔다
  const recorded = (solo.dataset['playTimings'] ?? '').split(',').filter(Boolean).length;
  const played = (el: Element | null | undefined, name: string): string | false => {
    const result = click(el, name);
    if (result !== false) auto.lastPlay = recorded;
    return result;
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
    // 직전에 낸 수가 이미 기록됐는데 선택 창이 떴다 = 그 수는 선택 창에서 멈췄다 (폭탄 확인 창은 아직 기록 전)
    if (auto.lastPlay !== null && recorded > auto.lastPlay) {
      auto.promptAfter.push(auto.lastPlay);
      auto.lastPlay = null;
    }
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
    return name === 'bomb' || name === 'single' ? played(pick, name) : click(pick, name);
  }
  const flipOnly = board.querySelector('[data-choice="flipOnly"]');
  if (flipOnly !== null) return played(flipOnly, 'flipOnly');
  const hand = [...board.querySelectorAll('[aria-label="내 손패"] button:not([disabled])')];
  return played(hand[rand(hand.length)], 'play');
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

/**
 * CI 러너(2코어, 소프트웨어 렌더링)의 WebKit은 같은 코드에서도 로컬보다 약 20% 느리다(이슈 #20 CI 실측: p50 693, 최대 836).
 * spec 6.4의 700ms는 실기기 기준이므로 CI의 WebKit에만 이 배율을 곱한다. 로컬 도커와 Chromium은 1(그대로).
 */
const CI_WEBKIT_BUDGET_FACTOR = 1.25;

const FIXTURE_SAMPLES = 3;

async function fixedTurnMs(page: Page, fixture: TimingFixture, query: string): Promise<number> {
  // 매 표본을 같은 저장 세션에서 시작한다. 무작위 판의 다른 이벤트 경로가 섞이지 않는다.
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`./${query}#/`);
  await page.evaluate(
    (save) => localStorage.setItem('gostop.solo.v1', JSON.stringify(save)),
    timingSave(fixture),
  );
  await page.reload();
  await page.getByRole('button', { name: /이어하기/ }).click({ timeout: 10_000 });
  const solo = page.getByTestId('solo');
  await expect(solo).toHaveAttribute('data-can-act', 'true', { timeout: 10_000 });
  await expect(solo).toHaveAttribute('data-play-timings', '');
  if (query === '?speed=fast') await expect(page.locator('html')).not.toHaveAttribute('data-speed');
  else await expect(page.locator('html')).toHaveAttribute('data-speed', 'normal');
  await expect(page.locator('[aria-label="내 손패"] button')).toHaveCount(fixture.hand.length);
  // 2줄 손패의 윗줄은 아래쪽이 겹친다. 실제로 노출된 위쪽 20px을 탭한다.
  await page
    .locator(`[aria-label="내 손패"] [data-slot="${fixture.card}"]`)
    .click({ position: { x: 20, y: 20 }, timeout: 10_000 });
  if (fixture.id === 'banner') await expect(page.locator('.banner.kind-ppeok')).toBeVisible();
  await expect(solo).toHaveAttribute('data-play-timings', /^\d+$/);
  await expect(solo).toHaveAttribute('data-phase', 'playing');
  return Number(await solo.getAttribute('data-play-timings'));
}

async function fixedTimingTable(
  page: Page,
  speed: 'fast' | 'normal',
  factor: number,
): Promise<number[]> {
  const all: number[] = [];
  for (const fixture of TIMING_FIXTURES) {
    const samples: number[] = [];
    for (let i = 0; i < FIXTURE_SAMPLES; i++) {
      // 앞선 턴의 AI 작업·저장 쓰기가 다음 fixture를 덮지 않게 표본마다 탭을 닫는다.
      const samplePage = await page.context().newPage();
      const errors = watchErrors(samplePage);
      try {
        samples.push(
          await test.step(`${fixture.label} seed=1 card=${fixture.card} ${fixture.events.join('→')} #${i + 1}`, () =>
            fixedTurnMs(samplePage, fixture, speed === 'fast' ? '?speed=fast' : '')),
        );
        expect(errors).toEqual([]);
      } finally {
        await samplePage.close();
      }
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[1] ?? 0;
    const [minimum, maximum] = fixture[speed];
    const detail = `${fixture.id} seed=1 card=${fixture.card} events=${fixture.events.join('→')} ${speed} samples=${sorted.join(',')} p50=${p50} range=${minimum}~${maximum * factor}`;
    console.log(`[UX-15·AC-06] ${test.info().project.name} ${detail}`);
    test.info().annotations.push({ type: 'fixed-turn-ms', description: detail });
    expect(p50, detail).toBeGreaterThanOrEqual(minimum);
    expect(p50, detail).toBeLessThanOrEqual(maximum * factor);
    all.push(...samples);
  }
  return all;
}

test.describe('턴 시간 계측 (@timing)', () => {
  // 전용 프로젝트(timing-*)에서 다른 테스트가 모두 끝난 뒤 혼자 돈다(playwright.config.ts). 파일 안에서도 직렬로.
  test.describe.configure({ mode: 'serial' });

  test(
    '혼자 연습: 고정 3경로 빠름 · 탭→턴 종료 p50 ≤ 700ms (AC-06, spec 6.4)',
    { tag: '@timing' },
    async ({ page, browserName }) => {
      test.setTimeout(4 * 60_000);
      const factor = process.env['CI'] && browserName === 'webkit' ? CI_WEBKIT_BUDGET_FACTOR : 1;
      const sorted = (await fixedTimingTable(page, 'fast', factor)).sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const secondMax = sorted.at(-2) ?? 0;
      const max = sorted.at(-1) ?? 0;
      const line = `고정 3경로×${FIXTURE_SAMPLES} n=${sorted.length} p50=${p50} 두번째최대=${secondMax} max=${max} all=${sorted.join(',')} | 예산 배율 ${factor}`;
      test.info().annotations.push({ type: 'turn-ms', description: line });
      console.log(`[AC-06] 탭→턴 종료 ms (${test.info().project.name}): ${line}`);
      // spec 6.4: 700ms(빠름). 꼬리는 스케줄링 이상치 하나를 흡수하도록 두 번째로 큰 값을 900ms로 본다(이슈 #20)
      expect(p50).toBeLessThanOrEqual(700 * factor);
      expect(secondMax).toBeLessThanOrEqual(900 * factor);
    },
  );

  test(
    '혼자 연습: 고정 3경로 보통 · 대표 매칭+획득 p50 1.4~2.4초 (UX-15, AC-06)',
    { tag: '@timing' },
    async ({ page }) => {
      test.setTimeout(5 * 60_000);
      const all = await fixedTimingTable(page, 'normal', 1);
      console.log(`[UX-15] 보통 탭→턴 종료 ms (${test.info().project.name}): ${all.join(',')}`);
    },
  );
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
