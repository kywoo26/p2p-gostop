import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compactMetadata } from './compact-metadata.mjs';

test('provenance 전체 값·순서·문구·해시를 보존하고 다른 배포 파일은 바꾸지 않는다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bundle-metadata-'));
  try {
    await mkdir(join(directory, 'skin'));
    const original = await readFile(
      new URL('../public/skin/manifest.json', import.meta.url),
      'utf8',
    );
    await writeFile(join(directory, 'skin/manifest.json'), original);
    const untouched = ['skin/NOTICE.md', 'skin/card.webp', 'version.json'];
    for (const path of untouched) await writeFile(join(directory, path), 'unchanged\n');
    const saved = await compactMetadata(directory);
    const result = await readFile(join(directory, 'skin/manifest.json'), 'utf8');
    assert.deepEqual(JSON.parse(result), JSON.parse(original));
    assert.equal(saved, Buffer.byteLength(original) - Buffer.byteLength(result));
    assert.ok(saved > 0);
    assert.equal(await compactMetadata(directory), 0);
    for (const path of untouched)
      assert.equal(await readFile(join(directory, path), 'utf8'), 'unchanged\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
