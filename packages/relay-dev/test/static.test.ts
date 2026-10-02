import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
import { startRelay, type Relay } from '../src/index.ts';
import { StaticSite } from '../src/static.ts';
import { writeArtifact } from './artifact.ts';

const origin = 'https://relay.example.test';
const notices = {
  'cards/ATTRIBUTION.md': '# 합성 카드 출처\n',
  'pro/NOTICE.md': '# 합성 자산 출처\n',
  'oss/NOTICE.txt': '합성 배포 고지\n',
};
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

it('Kit 생성 version만 hash에 넣고 정확한 release prefix에서 JSON no-store로 제공한다', async () => {
  directory = await mkdtemp(join(tmpdir(), 'relay-kit-version-'));
  const dist = join(directory, 'dist');
  await mkdir(join(directory, 'scripts'));
  await mkdir(join(dist, '_app'), { recursive: true });
  await writeArtifact(dist, PROTOCOL_VERSION, {
    'index.html': '<html>static hash router</html>',
    'assets/app.js': 'export const app = true;',
  });
  const oldVersion = JSON.parse(await readFile(join(dist, 'version.json'), 'utf8'));
  for (const [name, body] of Object.entries(notices)) {
    await mkdir(join(dist, name.split('/')[0]!), { recursive: true });
    await writeFile(join(dist, name), body);
  }
  // 이미 배포된 manifest를 다시 쓰지 않는 한 기존 hash는 그대로 유효하다.
  expect((await StaticSite.load([{ id: 'v0.4.1', distDir: dist }])).current.hash).toBe(
    oldVersion.hash,
  );
  // 실제 producer를 격리 디렉터리에서 실행한다. 저장소 dist를 쓰거나 알고리즘을 복제하지 않는다.
  const script = join(directory, 'scripts/write-version.mjs');
  await copyFile(new URL('../../web/scripts/write-version.mjs', import.meta.url), script);
  await symlink(
    new URL('../../../node_modules/', import.meta.url),
    join(directory, 'node_modules'),
  );
  await promisify(execFile)(process.execPath, [script]);
  const noticeVersion = JSON.parse(await readFile(join(dist, 'version.json'), 'utf8'));
  expect(noticeVersion.assetSetVersion).toBe(2);
  expect(noticeVersion.hash).not.toBe(oldVersion.hash);

  const kitVersion = '{"version":"source-build-fixture"}\n';
  await writeFile(join(dist, '_app/version.json'), kitVersion);
  await writeFile(join(dist, '_app/config.json'), '{}');
  await writeFile(join(dist, '_app/version.json.map'), 'source');
  await mkdir(join(dist, 'other/_app'), { recursive: true });
  await writeFile(join(dist, 'other/_app/version.json'), kitVersion);
  await mkdir(join(dist, '.svelte-kit/output/server'), { recursive: true });
  await writeFile(join(dist, '.svelte-kit/output/server/index.js'), 'server-only');
  await promisify(execFile)(process.execPath, [script]);
  const wire = JSON.parse(await readFile(join(dist, 'version.json'), 'utf8'));
  expect(Object.keys(wire).toSorted()).toEqual(['assetSetVersion', 'hash', 'wireVersion']);
  expect(wire.wireVersion).toBe(PROTOCOL_VERSION);
  expect(wire.hash).not.toBe(noticeVersion.hash);
  const site = await StaticSite.load([{ id: 'v0.4.1', distDir: dist }]);
  expect(site.current.hash).toBe(wire.hash);
  relay = await startRelay({
    publicMode: {
      creationSecret: randomBytes(32).toString('base64url'),
      allowedOrigins: [origin],
      releases: [{ id: 'v0.4.1', distDir: dist }],
    },
  });
  const base = `http://127.0.0.1:${relay.port}`;
  const path = `${base}${site.current.path}_app/version.json`;
  const version = await fetch(path, { headers: { 'Cache-Control': 'no-cache' } });
  expect(version.status).toBe(200);
  expect(version.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(version.headers.get('cache-control')).toBe('no-store');
  expect(version.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await version.text()).toBe(kitVersion);
  const head = await fetch(path, { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(head.headers.get('content-length')).toBe(String(Buffer.byteLength(kitVersion)));
  expect(await head.text()).toBe('');
  for (const suffix of [
    'version.json',
    '_app/config.json',
    '_app/version.json.map',
    'other/_app/version.json',
    '.svelte-kit/output/server/index.js',
  ]) {
    expect((await fetch(`${base}${site.current.path}${suffix}`)).status).toBe(404);
  }
  expect((await fetch(`${base}/_app/version.json`)).status).toBe(404);
  expect((await fetch(`${base}/r/v0.4.1/wrong/_app/version.json`)).status).toBe(404);
  await writeFile(join(dist, '_app/version.json'), '{"version":"tampered"}');
  await expect(StaticSite.load([{ id: 'v0.4.1', distDir: dist }])).rejects.toThrow(
    'artifact version/hash mismatch',
  );
});

it('고지 3개만 공개하고 legacy hash 밖 no-store와 새 hash 안 immutable을 구분한다', async () => {
  directory = await mkdtemp(join(tmpdir(), 'relay-notices-'));
  const dist = join(directory, 'dist');
  await writeArtifact(dist, PROTOCOL_VERSION, { 'index.html': '<html>notices</html>' });
  const legacy = JSON.parse(await readFile(join(dist, 'version.json'), 'utf8'));
  for (const [name, body] of Object.entries(notices)) {
    await mkdir(join(dist, name.split('/')[0]!), { recursive: true });
    await writeFile(join(dist, name), body);
  }
  for (const name of [
    'notes.txt',
    'notes.md',
    'notes.json',
    'oss/NOTICE.txt.map',
    'oss/private.txt',
  ]) {
    await writeFile(join(dist, name), 'not public');
  }
  const config = [{ id: 'v0.4.1', distDir: dist }];
  const publicMode = {
    creationSecret: randomBytes(32).toString('base64url'),
    allowedOrigins: [origin],
    releases: config,
  };
  relay = await startRelay({ publicMode });
  const checkNotices = async (hash: string, cache: string) => {
    const site = await StaticSite.load(config);
    expect(site.current.hash).toBe(hash);
    const base = `http://127.0.0.1:${relay!.port}`;
    for (const [name, body] of Object.entries(notices)) {
      const path = `${base}${site.current.path}${name}`;
      const response = await fetch(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe(cache);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await response.text()).toBe(body);
      const head = await fetch(path, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.headers.get('content-length')).toBe(String(Buffer.byteLength(body)));
      expect(await head.text()).toBe('');
      expect((await fetch(`${base}/${name}`)).status).toBe(404);
    }
    for (const name of [
      'notes.txt',
      'notes.md',
      'notes.json',
      'oss/NOTICE.txt.map',
      'oss/private.txt',
      'version.json',
    ]) {
      expect((await fetch(`${base}${site.current.path}${name}`)).status).toBe(404);
    }
  };
  await checkNotices(legacy.hash, 'no-store');
  await relay.close();
  relay = undefined;

  await mkdir(join(directory, 'scripts'));
  const script = join(directory, 'scripts/write-version.mjs');
  await copyFile(new URL('../../web/scripts/write-version.mjs', import.meta.url), script);
  await symlink(
    new URL('../../../node_modules/', import.meta.url),
    join(directory, 'node_modules'),
  );
  await promisify(execFile)(process.execPath, [script]);
  const current = JSON.parse(await readFile(join(dist, 'version.json'), 'utf8'));
  expect(current.assetSetVersion).toBe(2);
  expect(current.hash).not.toBe(legacy.hash);
  relay = await startRelay({ publicMode });
  await checkNotices(current.hash, 'public, max-age=31536000, immutable');

  for (const value of [null, '2', 0, 1, 3, false, {}]) {
    await writeFile(
      join(dist, 'version.json'),
      JSON.stringify({ ...current, assetSetVersion: value }),
    );
    await expect(StaticSite.load(config)).rejects.toThrow('unsupported artifact assetSetVersion');
  }
  // 메타만 삭제하거나 legacy 메타에 2를 붙여 hash 검증을 우회할 수 없다.
  await writeFile(
    join(dist, 'version.json'),
    JSON.stringify({ wireVersion: current.wireVersion, hash: current.hash }),
  );
  await expect(StaticSite.load(config)).rejects.toThrow('artifact version/hash mismatch');
  await writeFile(join(dist, 'version.json'), JSON.stringify({ ...legacy, assetSetVersion: 2 }));
  await expect(StaticSite.load(config)).rejects.toThrow('artifact version/hash mismatch');
  await writeFile(join(dist, 'version.json'), JSON.stringify(current));
  for (const [name, body] of Object.entries(notices)) {
    await writeFile(join(dist, name), `${body}changed`);
    await expect(StaticSite.load(config)).rejects.toThrow('artifact version/hash mismatch');
    await rm(join(dist, name));
    await expect(StaticSite.load(config)).rejects.toThrow('missing public notice');
    await expect(promisify(execFile)(process.execPath, [script])).rejects.toThrow(
      'missing public notice',
    );
    await writeFile(join(dist, name), body);
  }
  expect((await StaticSite.load(config)).current.hash).toBe(current.hash);
});
