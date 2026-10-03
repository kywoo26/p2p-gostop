// #252 / RP-P1: 정상 모션의 상대 공개패 시작 순간. 실제 pair helper를 재사용한다.
// RP-07: 실제 공개 relay-dev와 동일 dist를 거치는 두 브라우저 통합 검증.
// 인증·만료의 서버 단위 경계는 relay-dev/test, 연결 상태 단위 경계는 test:net이 담당한다.
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Duplex } from 'node:stream';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import decision from '../src/p2p/fixtures/host-v2-push-decision.json' with { type: 'json' };

const appOrigin = `http://127.0.0.1:${process.env['PLAYWRIGHT_PORT'] ?? '4173'}`;
const release = 'v0.0.1';
const relayCli = resolve('../relay-dev/src/cli.ts');
const dist = resolve('dist');

// 공개 relay 자격·초대 fragment·Bearer 토큰은 실패 trace와 CI artifact에 남겨서는 안 된다.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

interface RelayProcess {
  child: ChildProcessWithoutNullStreams;
  port: number;
  output: string[];
}

async function startRelay(secret: string, guestOrigin: string): Promise<RelayProcess> {
  const child = spawn(process.execPath, [relayCli], {
    cwd: resolve('../..'),
    env: {
      ...process.env,
      RELAY_PUBLIC: '1',
      RELAY_CREATION_SECRET: secret,
      RELAY_ALLOWED_ORIGINS: `${appOrigin},${guestOrigin}`,
      RELAY_RELEASE: release,
      RELAY_DIST_DIR: dist,
      HOST: '127.0.0.1',
      PORT: '0',
    },
  });
  const output: string[] = [];
  try {
    const port = await new Promise<number>((done, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`relay start timeout: ${output.join('')}`)),
        15_000,
      );
      child.stdout.on('data', (chunk: Buffer) => {
        output.push(chunk.toString());
        const match = /public listening on 127\.0\.0\.1:(\d+)\/ws/.exec(output.join(''));
        if (match?.[1]) {
          clearTimeout(timer);
          done(Number(match[1]));
        }
      });
      child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`relay exited ${code}: ${output.join('')}`));
      });
    });
    return { child, port, output };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

async function stopRelay(relay: RelayProcess | undefined): Promise<void> {
  if (!relay || relay.child.exitCode !== null) return;
  const exited = new Promise<void>((done) => relay.child.once('exit', () => done()));
  relay.child.kill('SIGTERM');
  await exited;
}

async function tlsProxy(directory: string): Promise<{
  server: HttpsServer;
  origin: string;
  sockets: Set<Duplex>;
  target: { port: number };
  setHostUnavailable(value: boolean): void;
}> {
  const key = join(directory, 'relay.key');
  const cert = join(directory, 'relay.crt');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  const target = { port: 0 };
  const server = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) });
  const sockets = new Set<Duplex>();
  const hostSockets = new Set<Duplex>();
  let hostUnavailable = false;
  server.on('request', (request, response) => {
    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port: target.port,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      },
    );
    upstream.on('error', () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  server.on('upgrade', (request, socket, head) => {
    const host =
      new URL(request.url ?? '/', 'https://127.0.0.1').searchParams.get('role') === 'host';
    if (hostUnavailable && host) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    if (host) {
      hostSockets.add(socket);
      socket.once('close', () => hostSockets.delete(socket));
    }
    const upstream = netConnect(target.port, '127.0.0.1', () => {
      const lines = [`${request.method} ${request.url} HTTP/1.1`];
      for (let index = 0; index < request.rawHeaders.length; index += 2)
        lines.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TLS proxy port unavailable');
  return {
    server,
    origin: `https://127.0.0.1:${address.port}`,
    sockets,
    target,
    setHostUnavailable(value) {
      hostUnavailable = value;
      if (value) for (const socket of hostSockets) socket.destroy();
    },
  };
}

interface Pair {
  host: Page;
  guest: Page;
  guestContext: BrowserContext;
  origin: string;
  secret: string;
  relay: RelayProcess;
  path: string;
  setHostUnavailable(value: boolean): void;
  stop(): Promise<void>;
  restart(): Promise<void>;
  coldHost(): Promise<void>;
}

async function pair(browser: Browser, guestBrowser = browser): Promise<Pair> {
  const directory = await mkdtemp(join(tmpdir(), 'rp07-e2e-'));
  const proxy = await tlsProxy(directory);
  const secret = randomBytes(32).toString('base64url');
  let relay: RelayProcess | undefined;
  const contexts: BrowserContext[] = [];
  try {
    relay = await startRelay(secret, proxy.origin);
    proxy.target.port = relay.port;
    const hostContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'no-preference',
    });
    const guestContext = await guestBrowser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'no-preference',
    });
    contexts.push(hostContext, guestContext);
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const root = await guest.request.get(`${proxy.origin}/`, { maxRedirects: 0 });
    expect(root.status()).toBe(302);
    const path = new URL(root.headers()['location'] ?? '', proxy.origin).pathname;
    expect(path).toMatch(/^\/r\/v0\.0\.1\/[0-9a-f]{64}\/$/);
    const session: Pair = {
      host,
      guest,
      guestContext,
      origin: proxy.origin,
      secret,
      relay,
      path,
      setHostUnavailable: proxy.setHostUnavailable,
      async coldHost() {
        // 실제 UI로 저장한 설정만 이어받는다. 방 생성 전이므로 권위/세션 복원 fixture가 아니다.
        const old = session.host.context();
        const fresh = await browser.newContext({
          ignoreHTTPSErrors: true,
          storageState: await old.storageState(),
        });
        contexts.push(fresh);
        session.host = await fresh.newPage();
        await old.close();
      },
      async stop() {
        for (const context of contexts) await context.close();
        for (const socket of proxy.sockets) socket.destroy();
        await new Promise<void>((done) => proxy.server.close(() => done()));
        await stopRelay(relay);
        await rm(directory, { recursive: true, force: true });
      },
      async restart() {
        await stopRelay(relay);
        relay = await startRelay(secret, proxy.origin);
        proxy.target.port = relay.port;
        session.relay = relay;
      },
    };
    return session;
  } catch (error) {
    for (const context of contexts) await context.close();
    for (const socket of proxy.sockets) socket.destroy();
    await new Promise<void>((done) => proxy.server.close(() => done()));
    await stopRelay(relay);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function openHost(
  run: Pair,
  coldSettings = false,
): Promise<{ invite: string; code: string }> {
  await run.host.goto(`${appOrigin}/?speed=normal#/`);
  await run.host.getByRole('link', { name: '친구와 원격 대전' }).click();
  await run.host.getByRole('button', { name: '원격 연결', exact: true }).click();
  await run.host.getByRole('textbox', { name: '중계 URL' }).fill(run.origin);
  await run.host.getByLabel('생성 자격').fill(run.secret);
  await run.host.getByRole('button', { name: '원격 설정 저장' }).click();
  await run.host.getByRole('link', { name: '뒤로' }).click();
  // 이전 문서의 preload/module cache에 의존하지 않는 고장 주입. 방 생성 전 새 context다.
  if (coldSettings) {
    await expect(run.host).toHaveURL(/#\/$/);
    await run.coldHost();
    await run.host.goto(`${appOrigin}/?speed=normal#/`);
  }
  await run.host.getByRole('link', { name: '친구와 원격 대전' }).click();
  await expect(run.host.getByText('중계 응답 정상')).not.toBeVisible();
  await run.host.getByRole('button', { name: '연결 확인' }).click();
  await expect(run.host.getByText(/중계 응답 정상/)).toBeVisible();
  await run.host.getByRole('button', { name: '방 만들기' }).click();
  const invite = await run.host.getByRole('textbox', { name: '초대 링크' }).inputValue();
  expect(new URL(invite).origin).toBe(run.origin);
  expect(new URL(invite).pathname).toBe(run.path);
  expect(new URL(invite).search).toBe('');
  const code = await run.host.getByTestId('remote-code').innerText();
  return { invite, code };
}

async function joinLink(page: Page, invite: string, name = '게스트'): Promise<void> {
  const url = new URL(invite);
  url.searchParams.set('speed', 'normal');
  if (page.url().startsWith(url.origin)) await page.goto('about:blank');
  await page.goto(url.href);
  await expect(page).toHaveURL(/#\/join$/);
  await expect(page.getByRole('heading', { name: '초대로 참여' })).toBeVisible();
  await page.getByRole('textbox', { name: '이름' }).fill(name);
  await page.getByRole('button', { name: '참여하기' }).click();
}

// 로비 승인/hello 뒤 딱 한 번의 commit-reveal 입력만 고정한다. token/epoch/nonce는 먼저 생성된다.
async function armRoundSeed(page: Page, hex: string): Promise<void> {
  await page.evaluate((seed) => {
    const original = crypto.getRandomValues;
    const w = window as Window & {
      __rpSeedStatus?: { armed: number; consumed: number; restored: boolean };
      __rpSeedIdentity?: () => boolean;
      __rpRestoreSeed?: () => void;
    };
    if (w.__rpSeedStatus) throw new Error('round seed already armed');
    const status = { armed: 1, consumed: 0, restored: false };
    w.__rpSeedStatus = status;
    w.__rpSeedIdentity = () => crypto.getRandomValues === original;
    const restore = () => {
      crypto.getRandomValues = original;
      status.restored = crypto.getRandomValues === original;
    };
    w.__rpRestoreSeed = restore;
    crypto.getRandomValues = <T extends Parameters<Crypto['getRandomValues']>[0]>(array: T): T => {
      try {
        if (array instanceof Uint8Array && array.byteLength === 32) {
          array.set(seed.match(/../g)!.map((byte) => parseInt(byte, 16)));
          status.consumed += 1;
          restore();
          return array;
        }
        original.call(crypto, array);
        return array;
      } catch (error) {
        restore();
        throw error;
      }
    };
  }, hex);
}

async function seedStatus(page: Page) {
  return page.evaluate(() => {
    const w = window as Window & {
      __rpSeedStatus?: { armed: number; consumed: number; restored: boolean };
      __rpSeedIdentity?: () => boolean;
    };
    return { ...w.__rpSeedStatus, identity: w.__rpSeedIdentity?.() ?? false };
  });
}

// target 도달 여부와 관계없이 own context를 닫기 전에 원 함수 reference로 돌려놓는다.
async function restoreRoundSeed(page: Page) {
  return page.evaluate(() => {
    const w = window as Window & {
      __rpRestoreSeed?: () => void;
      __rpSeedStatus?: { armed: number; consumed: number; restored: boolean };
      __rpSeedIdentity?: () => boolean;
    };
    w.__rpRestoreSeed?.();
    return { ...w.__rpSeedStatus, identity: w.__rpSeedIdentity?.() ?? null };
  });
}

type PublicRoots = { match: HTMLElement; board: HTMLElement; floor: HTMLElement };
type ProbeWindow = Window & {
  __rpRoots?: PublicRoots;
  __rpObserving?: boolean;
  __rpFrames?: number;
  __rpEnded?: boolean;
  __rpWireDropped?: number;
  __rpWire?: {
    at: number;
    direction: string;
    type: string;
    from?: number | undefined;
    to?: number | undefined;
    seq?: number | undefined;
    round?: number | undefined;
    eventTypes?: string[] | undefined;
  }[];
};

const PREFIX_AFTER = [0, 3, 9, 15, 21, 27, 28, 33] as const;
const PREFIX_NEXT_INPUT = [1, 0, 1, 0, 1, 0, 0, 1] as const;
// card12 추가 light1의 양 viewer 공개 floor. 원 fixture의 다음 card10 결과를 사용하지 않는다.
const TARGET_BEFORE_FLOOR = [7, 15, 18, 20, 44, 45];
const TARGET_FINAL_FLOOR = [7, 18, 20, 27, 44, 45];

async function installPublicWireObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as ProbeWindow;
    w.__rpWire = [];
    w.__rpWireDropped = 0;
    const record = (raw: unknown, direction: string) => {
      if (!w.__rpObserving || typeof raw !== 'string') return;
      try {
        const message = JSON.parse(raw) as {
          t?: string;
          from?: number;
          to?: number;
          seq?: number;
          view?: { round?: number };
          list?: { type: string }[];
        };
        if (!message.t || !['action', 'events', 'snapshot', 'reject'].includes(message.t)) return;
        if (w.__rpWire!.length >= 64) {
          w.__rpWireDropped! += 1;
          return;
        }
        w.__rpWire!.push({
          at: performance.now(),
          direction,
          type: message.t,
          from: message.from,
          to: message.to,
          seq: message.seq,
          round: message.view?.round,
          eventTypes: message.list?.map((event) => event.type),
        });
      } catch {
        /* 공개 JSON이 아닌 raw frame은 저장하지 않는다. */
      }
    };
    const Native = window.WebSocket;
    const send = Native.prototype.send;
    Native.prototype.send = function (data) {
      record(data, 'send');
      return send.call(this, data);
    };
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener('message', (event) => record(event.data, 'receive'));
      }
    };
  });
}

async function capturePublicRoots(page: Page) {
  await expect(page.getByTestId('match')).toBeVisible();
  await page.evaluate(() => {
    const w = window as ProbeWindow;
    const match = document.querySelector<HTMLElement>('[data-testid="match"]');
    const board = document.querySelector<HTMLElement>('[data-testid="board"]');
    const floor = document.querySelector<HTMLElement>('[data-floor-snapshot-seq]');
    if (
      !match ||
      !board ||
      !floor ||
      !match.contains(board) ||
      !board.contains(floor) ||
      !match.isConnected ||
      !board.isConnected ||
      !floor.isConnected
    )
      throw new Error('production roots missing/disconnected');
    if (w.__rpRoots) throw new Error('production roots already captured');
    w.__rpRoots = { match, board, floor };
  });
}

async function publicState(page: Page) {
  return page.evaluate(() => {
    const roots = (window as ProbeWindow).__rpRoots;
    if (!roots) return { valid: false };
    const { match, board, floor } = roots;
    const valid =
      match.isConnected &&
      board.isConnected &&
      floor.isConnected &&
      document.querySelector('[data-testid="match"]') === match &&
      document.querySelector('[data-testid="board"]') === board &&
      document.querySelector('[data-floor-snapshot-seq]') === floor &&
      match.contains(board) &&
      board.contains(floor);
    return {
      valid,
      authoritySeq: match.dataset['seq'],
      displaySeq: floor.dataset['floorSnapshotSeq'],
      authorityRound: match.dataset['round'],
      displayRound: floor.dataset['floorRound'],
      canAct: match.dataset['canAct'],
      inputLocked: board.dataset['busy'],
      ghostCount: board.querySelectorAll('[data-motion-card-id]').length,
      activeAnimations: board
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running' || animation.pending).length,
      floorIds: [...floor.querySelectorAll<HTMLElement>('[data-card-id]')]
        .map((el) => Number(el.dataset['cardId']))
        .sort((a, b) => a - b),
    };
  });
}

// 다음 입력권 seat의 canAct=true는 해당 controller의 pb.idle guard를 포함한다.
// 다른 seat의 pb.busy/queue는 이 DOM 조합으로 측정하지 않는다. ghost/WAAPI0는 별도 조건이다.
async function waitPairTransition(
  run: Pair,
  seq: number,
  inputSeat: 0 | 1,
  expectedFloor?: readonly number[],
) {
  const actor = inputSeat === 0 ? run.host : run.guest;
  await expect(actor.getByTestId('match')).toHaveAttribute('data-can-act', 'true');
  for (const page of [run.host, run.guest]) {
    await expect
      .poll(() => publicState(page))
      .toMatchObject({
        valid: true,
        authoritySeq: String(seq),
        displaySeq: String(seq),
        authorityRound: '1',
        displayRound: '1',
        ghostCount: 0,
        activeAnimations: 0,
      });
    if (expectedFloor !== undefined)
      await expect.poll(async () => (await publicState(page)).floorIds).toEqual([...expectedFloor]);
  }
  await expect(actor.getByTestId('match')).toHaveAttribute('data-can-act', 'true');
}

async function observeTurn(page: Page, role: 'actor' | 'observer') {
  return page.evaluate(async (observedRole) => {
    const w = window as ProbeWindow;
    const roots = w.__rpRoots;
    if (!roots) throw new Error('production roots not captured');
    const { match, board, floor } = roots;
    const validRoots = () =>
      match.isConnected &&
      board.isConnected &&
      floor.isConnected &&
      document.querySelector('[data-testid="match"]') === match &&
      document.querySelector('[data-testid="board"]') === board &&
      document.querySelector('[data-floor-snapshot-seq]') === floor &&
      match.contains(board) &&
      board.contains(floor);
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const publicFloorIds = [...floor.querySelectorAll<HTMLElement>('[data-card-id]')].map((el) =>
      Number(el.dataset['cardId']),
    );
    const floorIds = () =>
      [...floor.querySelectorAll<HTMLElement>('[data-card-id]')]
        .map((el) => Number(el.dataset['cardId']))
        .sort((a, b) => a - b);
    const pose = (el: HTMLElement) => {
      const style = getComputedStyle(el);
      return {
        role: el.closest('[aria-label="내 손패"]')
          ? 'ownHand'
          : floor.contains(el)
            ? 'floor'
            : el.closest('[aria-label*="획득패"]')
              ? 'captured'
              : 'otherPublic',
        rect: rect(el),
        visibility: style.visibility,
        opacity: style.opacity,
        transform: style.transform,
        animations: el.getAnimations({ subtree: true }).map((animation) => {
          const effect = animation.effect;
          return {
            state: animation.playState,
            pending: animation.pending,
            time: animation.currentTime,
            target: effect instanceof KeyframeEffect && effect.target === el ? 'outer' : 'inner',
            keyframes:
              effect instanceof KeyframeEffect
                ? effect
                    .getKeyframes()
                    .map((k) => ({ transform: k.transform, opacity: k.opacity, offset: k.offset }))
                : [],
          };
        }),
      };
    };
    const native = () =>
      [...board.querySelectorAll<HTMLElement>('[data-card-id="12"]')]
        .filter((el) => !el.closest('dialog'))
        .map(pose);
    const ghosts = () =>
      [...board.querySelectorAll<HTMLElement>('[data-motion-card-id="12"]')].map(pose);
    const frames: {
      at: number;
      inputLocked: string | undefined;
      canAct: string | undefined;
      authoritySeq: string | undefined;
      displaySeq: string | undefined;
      authorityRound: string | undefined;
      displayRound: string | undefined;
      floorIds: number[];
      ghostCount: number;
      activeAnimations: number;
      native: ReturnType<typeof pose>[];
      ghosts: ReturnType<typeof pose>[];
      floor: ReturnType<typeof rect>;
      unaffected: { id: number; rect: ReturnType<typeof rect> }[];
    }[] = [];
    const mutations: {
      at: number;
      native: ReturnType<typeof pose>[];
      ghosts: ReturnType<typeof pose>[];
    }[] = [];
    const actorInput: { at: number; type: string }[] = [];
    const input = (event: Event) => {
      const el = event.target;
      if (
        observedRole === 'actor' &&
        el instanceof Element &&
        el.closest('[data-slot="12"]') &&
        actorInput.length < 4
      )
        actorInput.push({ at: performance.now(), type: event.type });
    };
    for (const type of ['pointerdown', 'pointerup', 'click'])
      board.addEventListener(type, input, true);
    let mutationDropped = 0;
    const observer = new MutationObserver(() => {
      if (mutations.length < 128)
        mutations.push({ at: performance.now(), native: native(), ghosts: ghosts() });
      else mutationDropped += 1;
    });
    const started = performance.now();
    const source =
      observedRole === 'actor'
        ? rect(board.querySelector('[aria-label="내 손패"] [data-card-id="12"]'))
        : rect(board.querySelector('[data-anchor="opp-hand"]'));
    const sourceRole =
      observedRole === 'actor'
        ? 'own-hand public card12'
        : 'opponent captured-zone animation anchor (opp-hand)';
    const target = rect(floor.querySelector('[data-card-id="15"]'));
    w.__rpObserving = true;
    w.__rpFrames = 0;
    w.__rpEnded = false;
    observer.observe(board, { childList: true, subtree: true });
    return await new Promise<{
      role: typeof observedRole;
      frames: typeof frames;
      mutations: typeof mutations;
      actorInput: typeof actorInput;
      source: typeof source;
      sourceRole: typeof sourceRole;
      target: typeof target;
      wire: unknown[];
      wireDropped: number;
      mutationDropped: number;
      rootInvalid: boolean;
      capped: boolean;
      elapsed: number;
      pbBusy: 'unknown';
      clock: 'context-local performance.now/RAF';
    }>((resolve) => {
      const tick = (at: number) => {
        const rootInvalid = !validRoots();
        const ghostCount = board.querySelectorAll('[data-motion-card-id]').length;
        const activeAnimations = board
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running' || animation.pending).length;
        const ids = floorIds();
        frames.push({
          at,
          inputLocked: board.dataset['busy'],
          canAct: match.dataset['canAct'],
          authoritySeq: match.dataset['seq'],
          displaySeq: floor.dataset['floorSnapshotSeq'],
          authorityRound: match.dataset['round'],
          displayRound: floor.dataset['floorRound'],
          floorIds: ids,
          ghostCount,
          activeAnimations,
          native: native(),
          ghosts: ghosts(),
          floor: rect(floor),
          unaffected: publicFloorIds
            .filter((id) => id !== 12 && id !== 15)
            .map((id) => ({ id, rect: rect(floor.querySelector(`[data-card-id="${id}"]`)) })),
        });
        w.__rpFrames = frames.length;
        const elapsed = performance.now() - started;
        // authority/display/DOM 완료이며 순수 pb.idle나 실제 paint 완료의 관측이 아니다.
        const complete =
          !rootInvalid &&
          match.dataset['seq'] === '39' &&
          floor.dataset['floorSnapshotSeq'] === '39' &&
          match.dataset['round'] === '1' &&
          floor.dataset['floorRound'] === '1' &&
          JSON.stringify(ids) === JSON.stringify([7, 18, 20, 27, 44, 45]) &&
          ghostCount === 0 &&
          activeAnimations === 0;
        const capped = frames.length >= 240 || elapsed >= 8000;
        if (complete || capped || rootInvalid) {
          observer.disconnect();
          for (const type of ['pointerdown', 'pointerup', 'click'])
            board.removeEventListener(type, input, true);
          w.__rpObserving = false;
          w.__rpEnded = true;
          resolve({
            role: observedRole,
            frames,
            mutations,
            actorInput,
            source,
            sourceRole,
            target,
            wire: w.__rpWire ?? [],
            wireDropped: w.__rpWireDropped ?? 0,
            mutationDropped,
            rootInvalid,
            capped: !complete && capped,
            elapsed,
            pbBusy: 'unknown',
            clock: 'context-local performance.now/RAF',
          });
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, role);
}

test('RP-P1 #252 상대 CardPlayed: stable round1 card12→15 단일 매칭·획득 양좌석 관측', async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000); // 기존 production remote pair의 준비 예산. 관측은 별도 240 frames/8s 상한.
  const run = await pair(browser);
  const preparation: {
    index: number;
    type: string;
    seat: number;
    elapsed: number;
    beforeSeq: number;
    afterSeq: number;
    nextInputSeat: number;
  }[] = [];
  let targetStarted = false;
  try {
    await Promise.all([installPublicWireObserver(run.host), installPublicWireObserver(run.guest)]);
    const { invite } = await openHost(run);
    await run.host.getByRole('combobox', { name: '규칙', exact: true }).selectOption('arcade');
    await run.host.getByRole('combobox', { name: '생각 시간', exact: true }).selectOption('off');
    await joinLink(run.guest, invite);
    await expect(run.host.getByRole('button', { name: '시작', exact: true })).toBeEnabled();
    const round = decision.state.round;
    if (!round?.guestSecret) throw new Error('synthetic seed fixture missing');
    await Promise.all([
      armRoundSeed(run.host, round.hostSecret),
      armRoundSeed(run.guest, round.guestSecret),
    ]);
    await run.host.getByRole('button', { name: '시작', exact: true }).click();
    await Promise.all([capturePublicRoots(run.host), capturePublicRoots(run.guest)]);
    for (const [index, action] of round.actions.slice(0, 8).entries()) {
      const page = action.seat === 0 ? run.host : run.guest;
      const expectedBefore = index === 0 ? 0 : PREFIX_AFTER[index - 1];
      const nextInput = PREFIX_NEXT_INPUT[index];
      const expectedAfter = PREFIX_AFTER[index];
      if (expectedBefore === undefined || expectedAfter === undefined || nextInput === undefined)
        throw new Error('fixed prefix table missing');
      await waitPairTransition(run, expectedBefore, action.seat === 0 ? 0 : 1);
      await expect(page.getByTestId('match')).toHaveAttribute('data-can-act', 'true');
      const started = Date.now();
      const beforeSeq = await page.getByTestId('match').getAttribute('data-seq');
      if (beforeSeq === null) throw new Error('preparation authority seq missing');
      let control;
      if (action.type === 'pickFirst' && 'index' in action)
        control = page.locator(`[data-choice="pick-${action.index}"]`);
      else if (action.type === 'play' && 'card' in action)
        control = page.locator(
          `[aria-label="내 손패"] button:has([data-card-id="${action.card}"])`,
        );
      else if (action.type === 'chooseTarget' && 'card' in action)
        control = page.locator(`[data-choice="target-${action.card}"]`);
      else throw new Error('unsupported fixed preparation action');
      await expect(control).toBeEnabled();
      await control.click();
      // 첫 선 선택은 이벤트 없는 snapshot이다. 둘째 선택부터는 기존 seq 증가 계약이다.
      if (index === 0 && action.type === 'pickFirst') {
        expect(beforeSeq).toBe('0');
        await expect(run.host.getByTestId('match')).toHaveAttribute('data-can-act', 'false');
        await expect(run.guest.getByTestId('match')).toHaveAttribute('data-can-act', 'true');
        await expect(run.guest.locator('[data-choice="pick-0"]')).toBeDisabled();
        await expect(run.guest.locator('[data-choice="pick-1"]')).toBeEnabled();
        await waitPairTransition(run, 0, 1);
      } else {
        await expect(page.getByTestId('match')).not.toHaveAttribute('data-seq', beforeSeq);
        await waitPairTransition(run, expectedAfter, nextInput);
      }
      preparation.push({
        index,
        type: action.type,
        seat: action.seat,
        elapsed: Date.now() - started,
        beforeSeq: expectedBefore,
        afterSeq: expectedAfter,
        nextInputSeat: nextInput,
      });
    }
    await waitPairTransition(run, 33, 1, TARGET_BEFORE_FLOOR);
    for (const page of [run.host, run.guest]) {
      await expect(page.getByTestId('match')).toHaveAttribute('data-round', '1');
      await expect(page.locator('[data-floor-snapshot-seq] [data-card-id="15"]')).toHaveCount(1);
      expect(await seedStatus(page)).toEqual({
        armed: 1,
        consumed: 1,
        restored: true,
        identity: true,
      });
    }
    const play = run.guest.locator('[aria-label="내 손패"] button:has([data-card-id="12"])');
    await expect(play).toBeEnabled();
    const hostObservation = observeTurn(run.host, 'observer'),
      guestObservation = observeTurn(run.guest, 'actor');
    await Promise.all(
      [run.host, run.guest].map((page) =>
        page.waitForFunction(() => {
          const w = window as ProbeWindow;
          return (w.__rpFrames ?? 0) >= 2 || w.__rpEnded === true;
        }),
      ),
    );
    for (const page of [run.host, run.guest]) {
      expect(
        await page.evaluate(() => {
          const w = window as ProbeWindow;
          return (w.__rpFrames ?? 0) >= 2 && w.__rpEnded === false;
        }),
      ).toBe(true);
    }
    targetStarted = true;
    await play.click();
    const [observer, actor] = await Promise.all([hostObservation, guestObservation]);
    await testInfo.attach('public-turn-observation', {
      body: JSON.stringify({
        issue: 252,
        preparation,
        target: {
          seat: 1,
          card: 12,
          target: 15,
          beforeSeq: 33,
          eventsFrom: 34,
          to: 39,
          round: 1,
          nextInputSeat: 0,
        },
        clockLimit: 'actor/observer local clocks; no cross-context latency or paint inference',
        observer,
        actor,
      }),
      contentType: 'application/json',
    });
    expect(observer.capped).toBe(false);
    expect(actor.capped).toBe(false);
    expect(observer.rootInvalid).toBe(false);
    expect(actor.rootInvalid).toBe(false);
    for (const observation of [observer, actor]) {
      expect(observation.frames.length).toBeGreaterThanOrEqual(2);
      expect(
        observation.frames
          .slice(0, 2)
          .every(
            (frame) =>
              frame.authoritySeq === '33' &&
              frame.displaySeq === '33' &&
              frame.authorityRound === '1' &&
              frame.displayRound === '1' &&
              frame.ghostCount === 0 &&
              frame.activeAnimations === 0 &&
              JSON.stringify(frame.floorIds) === JSON.stringify(TARGET_BEFORE_FLOOR),
          ),
      ).toBe(true);
    }
    expect(actor.frames.slice(0, 2).every((frame) => frame.canAct === 'true')).toBe(true);
    await waitPairTransition(run, 39, 0, TARGET_FINAL_FLOOR);
    await expect(run.host.getByTestId('match')).toHaveAttribute('data-round', '1');
    await expect(run.guest.getByTestId('match')).toHaveAttribute('data-round', '1');
  } finally {
    const seedCleanup = await Promise.allSettled([
      restoreRoundSeed(run.host),
      restoreRoundSeed(run.guest),
    ]);
    try {
      await testInfo.attach('bounded-stage', {
        body: JSON.stringify({ issue: 252, preparation, targetStarted }),
        contentType: 'application/json',
      });
      await testInfo.attach('seed-cleanup', {
        body: JSON.stringify(seedCleanup),
        contentType: 'application/json',
      });
      for (const result of seedCleanup) {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled' && result.value.armed !== undefined) {
          expect(result.value.restored).toBe(true);
          expect(result.value.identity).toBe(true);
        }
      }
    } finally {
      await run.stop();
    }
  }
});
