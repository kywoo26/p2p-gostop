// 앱·Docker·Tailscale을 호출하지 않는다. 임시 파일과 합성 ZIP만 사용한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectBundle, directoryFiles } from './artifact.mjs';

const source = 'f'.repeat(40);
function bundle() {
  const files = new Map([
    [
      'index.html',
      Buffer.from('<script src="./_app/main.js"></script><link href="./_app/main.css">'),
    ],
    ['_app/main.js', Buffer.from('export {};')],
    ['_app/main.css', Buffer.from('body{}')],
    ['_app/version.json', Buffer.from(JSON.stringify({ version: source.slice(0, 7) }))],
    ['cards/ATTRIBUTION.md', Buffer.from('notice')],
    ['pro/NOTICE.md', Buffer.from('notice')],
    ['oss/NOTICE.txt', Buffer.from('notice')],
  ]);
  const hash = createHash('sha256');
  for (const [name, bytes] of [...files].toSorted(([a], [b]) => a.localeCompare(b))) {
    hash.update(name);
    hash.update('\0');
    hash.update(bytes);
  }
  files.set(
    'version.json',
    Buffer.from(JSON.stringify({ wireVersion: 4, assetSetVersion: 2, hash: hash.digest('hex') })),
  );
  return files;
}
await test('missing/extra/변조/다른 source artifact는 거절한다', () => {
  const missing = bundle();
  missing.delete('_app/main.js');
  assert.throws(() => inspectBundle(missing, source), /BOOTSTRAP_MISSING/);
  const extra = bundle();
  extra.set('token.txt', Buffer.from('extra'));
  assert.throws(() => inspectBundle(extra, source), /UNSERVED_FILE/);
  const changed = bundle();
  changed.set('_app/main.css', Buffer.from('different'));
  assert.throws(() => inspectBundle(changed, source), /ARTIFACT_HASH/);
  assert.throws(() => inspectBundle(bundle(), 'e'.repeat(40)), /ARTIFACT_METADATA/);
  const metadata = bundle();
  metadata.set('skin/NOTICE.md', Buffer.from('build-only notice'));
  metadata.set('skin/manifest.json', Buffer.from('{}'));
  const before = inspectBundle(metadata, source);
  metadata.set('skin/manifest.json', Buffer.from('{"changed":true}'));
  const after = inspectBundle(metadata, source);
  assert.equal(before.hash, after.hash);
  assert.notDeepEqual(before.files, after.files);
});
await test('전체 manifest는 파일 bytes·크기·source와 초기참조를 연결한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-artifact-fixture-'));
  try {
    for (const [path, bytes] of bundle()) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), bytes);
    }
    const result = inspectBundle(await directoryFiles(root), source);
    assert.equal(result.files.length, 8);
    assert.equal(result.initial.length, 2);
    assert.equal(result.source, source);
    await writeFile(join(root, '_app/main.js'), 'changed');
    await assert.rejects(
      async () => inspectBundle(await directoryFiles(root), source),
      /ARTIFACT_HASH/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
await test('dist symlink와 비정규 입력은 거절한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-artifact-fixture-'));
  try {
    await writeFile(join(root, 'non-directory'), 'not a directory');
    await assert.rejects(directoryFiles(join(root, 'non-directory')), /DIST_PARENT/);
    await mkdir(join(root, 'dist'));
    await symlink(join(root, 'dist'), join(root, 'alias'));
    await assert.rejects(directoryFiles(join(root, 'alias')), /DIST_PARENT/);
    await symlink('/dev/null', join(root, 'dist', 'a.js'));
    await assert.rejects(directoryFiles(join(root, 'dist')), /DIST_SYMLINK/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
