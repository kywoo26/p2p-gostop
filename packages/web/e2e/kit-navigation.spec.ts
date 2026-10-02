// SK3 R1: 실제 Kit anchor/버튼/Android Back과 직접 legacy 진입은 별도로 검증한다.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

async function mockAndroidBack(page: Page) {
  await page.addInitScript(() => {
    const host = {
      onmessage: null as ((event: { data: string }) => void) | null,
      postMessage(data: string) {
        const request = JSON.parse(data) as { type: string; id?: string; bool?: boolean };
        const reply =
          request.type === 'getHotspot'
            ? { type: 'hotspot', id: request.id, state: 'off' }
            : { type: request.type, id: request.id };
        queueMicrotask(() => host.onmessage?.({ data: JSON.stringify(reply) }));
        if (request.type === 'gameActive')
          (window as unknown as { __gameActive: boolean }).__gameActive = request.bool === true;
      },
    };
    const target = window as unknown as { HostBridge: typeof host; __back: () => void };
    target.HostBridge = host;
    target.__back = () => host.onmessage?.({ data: JSON.stringify({ type: 'back' }) });
  });
}

async function nativeBack(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __gameActive?: boolean }).__gameActive === true,
  );
  await page.evaluate(() => (window as unknown as { __back: () => void }).__back());
}

async function startSolo(page: Page, origin?: string) {
  await page.goto(`${origin ?? '.'}/?speed=instant#/`);
  await page.getByRole('link', { name: '혼자 연습', exact: true }).click();
  await expect(page).toHaveURL(/#\/solo$/);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByTestId('solo')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '선 고르기' })).toBeVisible();
}

async function soloSave(page: Page) {
  return page.evaluate(() => localStorage.getItem('gostop.solo.v1'));
}

async function openGameSettings(page: Page) {
  await nativeBack(page);
  await page.locator('[data-menu="settings"]').click();
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '뒤로', exact: true })).toHaveAttribute(
    'href',
    /#\/game$/,
  );
}

/** 현재 빌드의 생성 node→manifest 매핑만 읽는다. route 번호·chunk 해시는 고정하지 않는다. */
async function settingsChunk() {
  const manifest = JSON.parse(
    await readFile('.svelte-kit/output/client/.vite/manifest.json', 'utf8'),
  ) as Record<string, { file: string }>;
  for (const [sourcePath, entry] of Object.entries(manifest)) {
    if (!/^\.svelte-kit\/generated\/build\/client-optimized\/nodes\/\d+\.js$/.test(sourcePath))
      continue;
    const source = await readFile(sourcePath, 'utf8');
    if (source.includes('routes/settings/+page.svelte')) return entry.file;
  }
  throw new Error('settings route chunk missing from current build');
}

/** 실제 HTTP 고장 fixture. no-store 503과 잘못된 200 모듈을 구분한다. */
async function faultSite(kind: 'unavailable' | 'syntax') {
  const chunk = await settingsChunk();
  const root = resolve('dist');
  let damaged = true;
  const deliveries: boolean[] = [];
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.ogg': 'audio/ogg',
    '.avif': 'image/avif',
  };
  const server = createServer((request, response) => {
    void (async () => {
      const name =
        new URL(request.url ?? '/', 'http://localhost').pathname.slice(1) || 'index.html';
      const file = resolve(root, name);
      const type = types[extname(name)];
      if (!file.startsWith(root + sep) || name.includes('%') || !type) {
        response.writeHead(404).end();
        return;
      }
      if (name === chunk) {
        deliveries.push(damaged);
        if (damaged) {
          response
            .writeHead(kind === 'syntax' ? 200 : 503, {
              'content-type': type,
              'cache-control': 'no-store',
            })
            .end(kind === 'syntax' ? 'export const broken = ;' : '');
          return;
        }
      }
      try {
        response
          .writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
          .end(await readFile(file));
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fault server port unavailable');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    deliveries,
    restore() {
      damaged = false;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

async function afterChunk(page: Page) {
  // 응답 body가 끝난 뒤 모듈 commit/다음 프레임까지 진행시킨다. 고정 sleep은 사용하지 않는다.
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}

test('SK3: 실제 anchor, shallow 분류, reload, browser Back/Forward 복귀 상태 @layout', async ({
  page,
}) => {
  await page.goto('./#/');
  const link = page.getByRole('link', { name: '설정', exact: true });
  await expect(link).toHaveAttribute('data-sveltekit-preload-code', 'tap');
  await link.click();
  const play = page.getByRole('button', { name: '규칙·금액', exact: true });
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(play).toBeFocused();
  await expect(page.getByRole('link', { name: '뒤로', exact: true })).toHaveAttribute(
    'href',
    /#\/$/,
  );
  await expect(page.locator('.navigation-status')).toHaveCount(0);
  await page.reload();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '뒤로', exact: true }).click();
  await expect(page.getByRole('heading', { name: '맞고 P2P', exact: true })).toBeVisible();
  await page.goBack();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(page.getByRole('heading', { name: '맞고 P2P', exact: true })).toBeVisible();
});

test('SK3: native Back 설정 왕복은 세션·worker·결정 프롬프트를 유지한다 @layout', async ({
  page,
}) => {
  await mockAndroidBack(page);
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const target = window as unknown as { __workers: number };
    target.__workers = 0;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        target.__workers += 1;
      }
    };
  });
  await startSolo(page);
  const before = await soloSave(page);
  expect(before).not.toBeNull();
  const workers = await page.evaluate(() => (window as unknown as { __workers: number }).__workers);
  expect(workers).toBe(1);
  await openGameSettings(page);
  await page.getByRole('button', { name: '원격 연결', exact: true }).click();
  await nativeBack(page);
  await expect(page.getByTestId('solo')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '선 고르기' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '메뉴', exact: true })).not.toBeVisible();
  expect(await soloSave(page)).toBe(before);
  expect(await page.evaluate(() => (window as unknown as { __workers: number }).__workers)).toBe(
    workers,
  );
});

test('SK3: 게임에서 연 설정 reload 뒤 분류와 게임 복귀를 복원한다 @layout', async ({ page }) => {
  await mockAndroidBack(page);
  await startSolo(page);
  const before = await soloSave(page);
  expect(before).not.toBeNull();
  await openGameSettings(page);
  const play = page.getByRole('button', { name: '규칙·금액', exact: true });
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: '뒤로', exact: true })).toHaveAttribute(
    'href',
    /#\/game$/,
  );
  await page.getByRole('link', { name: '뒤로', exact: true }).click();
  await expect(page.getByTestId('solo')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '선 고르기' })).toBeVisible();
  expect(await soloSave(page)).toBe(before);
});

test('SK3: 직접 legacy entry는 UI 복귀·세션을 만들지 않는다 @layout', async ({ page }) => {
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '뒤로', exact: true })).toHaveAttribute(
    'href',
    /#\/$/,
  );
  await expect(page.getByRole('button', { name: '표시·조작', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('./#/game');
  await expect(page.getByText('진행 중인 게임이 없습니다.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('solo')).toHaveCount(0);
  expect(await soloSave(page)).toBeNull();
});

for (const action of ['back', 'end'] as const) {
  test(`SK3: 대기 중 settings chunk 뒤 ${action}은 지연된 화면 commit을 막는다 @layout`, async ({
    page,
  }) => {
    await mockAndroidBack(page);
    await startSolo(page);
    const before = await soloSave(page);
    expect(before).not.toBeNull();
    const chunk = await settingsChunk();
    let release = () => {};
    const held = new Promise<void>((done) => (release = done));
    let requested = () => {};
    const arrived = new Promise<void>((done) => (requested = done));
    await page.route(`**/${chunk}`, async (route) => {
      requested();
      await held;
      await route.continue();
    });
    try {
      await nativeBack(page);
      await page.locator('[data-menu="settings"]').click();
      await arrived;
      await expect(page.locator('.navigation-status')).toBeVisible();
      await nativeBack(page);
      await expect(page.getByRole('dialog', { name: '메뉴', exact: true })).toBeVisible();
      if (action === 'end') {
        await page
          .getByRole('dialog', { name: '메뉴', exact: true })
          .locator('[data-menu="end"]')
          .click();
        await page
          .getByRole('dialog', { name: '메뉴', exact: true })
          .locator('[data-menu="end"]')
          .click();
      }
      const response = page.waitForResponse((value) =>
        new URL(value.url()).pathname.endsWith(chunk),
      );
      release();
      expect(await (await response).finished()).toBeNull();
      await afterChunk(page);
      await expect(page).toHaveURL(/#\/game$/);
      await expect(page.getByRole('heading', { name: '설정', exact: true })).toHaveCount(0);
      await expect(page.locator('.navigation-status')).toHaveCount(0);
      if (action === 'back') {
        expect(await soloSave(page)).toBe(before);
        await expect(page.getByRole('dialog', { name: '메뉴', exact: true })).toBeVisible();
      } else {
        const ended = JSON.parse((await soloSave(page)) ?? 'null') as {
          session: { phase: string };
        };
        expect(ended.session.phase).toBe('ended');
      }
    } finally {
      release();
    }
  });
}

test('SK3: 503 수동 reload의 Chromium 복구·WebKit 실패와 저장 게임 복귀 @layout', async ({
  page,
  browserName,
}) => {
  const site = await faultSite('unavailable');
  try {
    await mockAndroidBack(page);
    await startSolo(page, site.origin);
    const before = await soloSave(page);
    expect(before).not.toBeNull();
    await nativeBack(page);
    await page.locator('[data-menu="settings"]').click();
    await expect(
      page.getByRole('heading', { name: '화면을 열지 못했습니다', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '게임으로 돌아가기', exact: true }),
    ).toHaveAttribute('href', /#\/game$/);
    expect(await soloSave(page)).toBe(before);
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.getByRole('button', { name: '새로고침', exact: true })).toBeVisible();
    expect(await soloSave(page)).toBe(before);
    site.restore();
    await page.getByRole('button', { name: '새로고침', exact: true }).click();
    if (browserName === 'webkit') {
      // pinned WebKit의 원 실패를 보존한다. 새로고침 성공으로 판정하지 않는다.
      await expect(
        page.getByRole('heading', { name: '화면을 열지 못했습니다', exact: true }),
      ).toBeVisible();
      expect(site.deliveries).toEqual([true]);
      await page.getByRole('link', { name: '게임으로 돌아가기', exact: true }).click();
    } else {
      await expect.poll(() => site.deliveries).toEqual([true, false]);
      await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: '뒤로', exact: true })).toHaveAttribute(
        'href',
        /#\/game$/,
      );
      await page.getByRole('link', { name: '뒤로', exact: true }).click();
    }
    await expect(page.getByTestId('solo')).toBeVisible();
    expect(await soloSave(page)).toBe(before);
  } finally {
    await site.close();
  }
});

test('SK3 recovery: 종료된 솔로는 복귀 대상으로 고르지 않는다 @layout', async ({ page }) => {
  const site = await faultSite('unavailable');
  try {
    await startSolo(page, site.origin);
    await page.getByTestId('game-menu').click();
    const menu = page.getByRole('dialog', { name: '메뉴', exact: true });
    await menu.locator('[data-menu="end"]').click();
    await menu.locator('[data-menu="end"]').click();
    await expect(page.getByTestId('session-ended')).toBeVisible();
    expect(JSON.parse((await soloSave(page))!).session.phase).toBe('ended');
    await page.getByRole('button', { name: '기록 보기', exact: true }).click();
    await page.getByRole('link', { name: '뒤로', exact: true }).click();
    await page.getByRole('link', { name: '설정', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '화면을 열지 못했습니다', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '게임으로 돌아가기', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: '홈으로', exact: true }).click();
    await expect(page.getByRole('heading', { name: '맞고 P2P', exact: true })).toBeVisible();
    await expect(page.getByTestId('solo')).toHaveCount(0);
  } finally {
    await site.close();
  }
});

for (const failure of ['syntax', 'unavailable'] as const) {
  test(`SK3: ${failure === 'syntax' ? 'malformed 200' : 'HTTP 503'}은 같은 문서에서 오류 재시도 후 같은 게임으로 안전 복귀한다 @layout`, async ({
    page,
  }) => {
    const site = await faultSite(failure);
    try {
      await mockAndroidBack(page);
      await page.addInitScript(() => {
        const OriginalWorker = window.Worker;
        const target = window as unknown as { __errorWorkers: Worker[] };
        target.__errorWorkers = [];
        window.Worker = class extends OriginalWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options);
            target.__errorWorkers.push(this);
          }
        };
      });
      await startSolo(page, site.origin);
      const before = await soloSave(page);
      expect(before).not.toBeNull();
      await page.evaluate(() => {
        (window as unknown as { __errorDocument: object }).__errorDocument = {};
      });
      await nativeBack(page);
      await page.locator('[data-menu="settings"]').click();
      await expect(
        page.getByRole('heading', { name: '화면을 열지 못했습니다', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: '다시 시도', exact: true }).click();
      await expect(page.getByRole('button', { name: '새로고침', exact: true })).toBeVisible();
      await page.getByRole('link', { name: '게임으로 돌아가기', exact: true }).click();
      await expect(page.getByTestId('solo')).toBeVisible();
      await expect(page.getByRole('dialog', { name: '선 고르기' })).toBeVisible();
      expect(await soloSave(page)).toBe(before);
      expect(
        await page.evaluate(
          () => (window as unknown as { __errorWorkers: Worker[] }).__errorWorkers.length,
        ),
      ).toBe(1);
      expect(
        await page.evaluate(() =>
          Boolean((window as unknown as { __errorDocument?: object }).__errorDocument),
        ),
      ).toBe(true);
      await expect(
        page.getByRole('heading', { name: '화면을 열지 못했습니다', exact: true }),
      ).toHaveCount(0);
      await page.getByRole('dialog', { name: '선 고르기' }).getByRole('button').first().click();
      await expect.poll(() => soloSave(page)).not.toBe(before);
    } finally {
      await site.close();
    }
  });
}

test('SK3: viewTransition snapshot 실패는 이동을 막지 않고 게임판 전환은 제외한다 @layout', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const target = window as unknown as { __transitions: number };
    target.__transitions = 0;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: () => {
        target.__transitions += 1;
        return {
          ready: Promise.reject(new Error('synthetic snapshot failure')),
          finished: Promise.reject(new Error('synthetic snapshot failure')),
          updateCallbackDone: Promise.resolve(),
          skipTransition() {},
        };
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/');
  await page.getByRole('link', { name: '설정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __transitions: number }).__transitions),
  ).toBe(1);
  await page.getByRole('link', { name: '뒤로', exact: true }).click();
  await expect(page.getByRole('heading', { name: '맞고 P2P', exact: true })).toBeVisible();
  const before = await page.evaluate(
    () => (window as unknown as { __transitions: number }).__transitions,
  );
  await page.getByRole('link', { name: '혼자 연습', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByTestId('solo')).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __transitions: number }).__transitions),
  ).toBe(before);
  expect(errors).toEqual([]);
});

test('SK3: 알 수 없는 정적 prefix의 실제 anchor/Back은 origin과 prefix를 유지한다 @layout', async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error('preview baseURL required');
  const prefix = '/synthetic-release/prefix/';
  const origin = new URL(baseURL).origin;
  const external: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) external.push('external request');
  });
  await page.route(`**${prefix}**`, async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(prefix, '/');
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  await page.goto(`${origin}${prefix}#/`);
  await page.getByRole('link', { name: '기록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '기록', exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(prefix);
  await page.goBack();
  await expect(page.getByRole('heading', { name: '맞고 P2P', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '설정', exact: true }).click();
  await page.getByRole('link', { name: '뒤로', exact: true }).click();
  await expect(page.getByRole('heading', { name: '맞고 P2P', exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(prefix);
  expect(external).toEqual([]);
});
