// B207-2 승인 대상 Draft: 실제 CLI의 경계와 전체 파일/외부 요청 guard를 검사한다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const LIMIT = 2_097_152;
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'bundle-gate-'));
  for (const path of [
    'scripts/check-bundle.mjs',
    'src/pro-assets/credits.ts',
    'src/cards/attribution.ts',
    'src/fonts/attribution.ts',
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(new URL(`../${path}`, import.meta.url), join(root, path));
  }
  await mkdir(join(root, 'dist/oss'), { recursive: true });
  return root;
}
function run(root) {
  return spawnSync(process.execPath, [join(root, 'scripts/check-bundle.mjs')], {
    env: { ...process.env, PRO_ASSET_REVIEW: '0' },
    encoding: 'utf8',
  });
}
for (const [size, status] of [
  [LIMIT - 1, 0],
  [LIMIT, 0],
  [LIMIT + 1, 1],
]) {
  test(`전체 raw ${size} B: exit ${status}`, async () => {
    const root = await fixture();
    try {
      await writeFile(join(root, 'dist/asset.bin'), Buffer.alloc(size));
      assert.equal(run(root).status, status);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
test('metadata/고지/숨김/지연 chunk/바이너리도 전체 raw에 포함하고 외부 URL은 계속 거절한다', async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, 'dist/main.bin'), Buffer.alloc(LIMIT - 5));
    for (const path of ['meta.json', 'oss/NOTICE.txt', '.hidden', 'lazy.js', 'image.bin'])
      await writeFile(join(root, 'dist', path), ' ');
    assert.equal(run(root).status, 0);
    await writeFile(join(root, 'dist/image.bin'), '  ');
    assert.equal(run(root).status, 1);
    await writeFile(join(root, 'dist/main.bin'), '');
    await writeFile(join(root, 'dist/lazy.js'), 'fetch("https://external.invalid/asset")');
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /외부 URL 1건/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
