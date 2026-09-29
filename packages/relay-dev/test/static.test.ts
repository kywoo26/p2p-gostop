import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import { startRelay, type Relay } from '../src/index.ts';
import { StaticSite } from '../src/static.ts';
import { writeArtifact } from './artifact.ts';

const origin = 'https://relay.example.test';
let directory: string | undefined;
let relay: Relay | undefined;
afterEach(async () => {
  await relay?.close();
  relay = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

it('dist만 release/hash 경로로 제공하고 traversal·설정·sourcemap을 차단한다', async () => {
  directory = await mkdtemp(join(tmpdir(), 'relay-static-'));
  const dist = join(directory, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeArtifact(dist, PROTOCOL_VERSION, {
    'index.html': '<html>release</html>',
    'assets/app.js': 'console.log("local")',
  });
  await writeFile(join(dist, '.env'), 'secret');
  await writeFile(join(dist, 'config.json'), '{"secret":"hidden"}');
  await writeFile(join(dist, 'assets', 'app.js.map'), 'source');
  await writeFile(join(directory, 'outside.js'), 'outside');
  await symlink(join(directory, 'outside.js'), join(dist, 'assets', 'link.js'));
  const site = await StaticSite.load([{ id: 'v0.2.2', distDir: dist }]);
  const path = site.current.path;
  expect(path).toMatch(/^\/r\/v0\.2\.2\/[0-9a-f]{64}\/$/);
  relay = await startRelay({
    publicMode: {
      creationSecret: randomBytes(32).toString('base64url'),
      allowedOrigins: [origin],
      releases: [{ id: 'v0.2.2', distDir: dist }],
    },
  });
  const base = `http://127.0.0.1:${relay.port}`;
  expect(await fetch(`${base}/health`).then((r) => r.json())).toEqual({
    relay: 'p2p-gostop',
    ready: true,
    controlVersion: 1,
    wireVersion: PROTOCOL_VERSION,
  });
  const version = await fetch(`${base}/version`);
  expect(version.status).toBe(200);
  expect(await version.json()).toMatchObject({
    current: { release: 'v0.2.2', path },
    releases: [{ compatible: true }],
  });
  const index = await fetch(`${base}${path}`);
  expect(index.status).toBe(200);
  expect(await index.text()).toContain('release');
  expect((await fetch(`${base}${path}assets/app.js`)).status).toBe(200);
  for (const suffix of [
    '.env',
    'config.json',
    'version.json',
    'assets/app.js.map',
    'assets/link.js',
    'assets/../outside.js',
    'assets/%2e%2e/outside.js',
    'assets/%252e%252e/outside.js',
    'assets/%5coutside.js',
  ]) {
    expect((await fetch(`${base}${path}${suffix}`)).status).toBe(404);
  }
  expect((await fetch(`${base}/api/rooms`)).status).toBe(404);
});

it('중복 release 및 소스맵만 있는 artifact를 거부한다', async () => {
  directory = await mkdtemp(join(tmpdir(), 'relay-static-'));
  await writeArtifact(directory, PROTOCOL_VERSION, { 'index.html': 'ok' });
  await expect(StaticSite.load([{ id: '../bad', distDir: directory }])).rejects.toThrow(
    'invalid release metadata',
  );
  await expect(
    StaticSite.load([
      { id: 'v1.0.0', distDir: directory },
      { id: 'v1.0.0', distDir: directory },
    ]),
  ).rejects.toThrow('invalid release metadata');
  await rm(join(directory, 'version.json'));
  await expect(StaticSite.load([{ id: 'v1.0.0', distDir: directory }])).rejects.toThrow(
    'missing or invalid artifact version.json',
  );
  await symlink(join(directory, 'index.html'), join(directory, 'version.json'));
  await expect(StaticSite.load([{ id: 'v1.0.0', distDir: directory }])).rejects.toThrow(
    'missing or invalid artifact version.json',
  );
  await rm(join(directory, 'version.json'));
  await writeArtifact(directory, PROTOCOL_VERSION, { 'index.html': 'ok' });
  await writeFile(join(directory, 'index.html'), 'tampered');
  await expect(StaticSite.load([{ id: 'v1.0.0', distDir: directory }])).rejects.toThrow(
    'artifact version/hash mismatch',
  );
});
