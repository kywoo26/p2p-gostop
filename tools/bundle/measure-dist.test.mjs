// B207-1: 전체 배포 회계는 metadata·숨김 파일도 세며 경로 밖 symlink는 거절한다.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const tool = fileURLToPath(new URL('./measure-dist.mjs', import.meta.url));
await test('raw 파일을 한 번씩 세고 metadata를 이미지 카테고리에 중복하지 않는다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'raw-manifest-'));
  try {
    await mkdir(join(root, 'skin'));
    await writeFile(join(root, 'skin/card.webp'), Buffer.from([0, 1, 2]));
    await writeFile(join(root, 'skin/manifest.json'), '{}');
    await writeFile(join(root, '.metadata'), '한국');
    const result = JSON.parse(execFileSync(process.execPath, [tool, root], { encoding: 'utf8' }));
    assert.equal(result.bytes, 11);
    assert.deepEqual(result.categories, {
      metadata: { files: 2, bytes: 8 },
      skin: { files: 1, bytes: 3 },
    });
    assert.equal(result.files.length, 3);
    assert.ok(
      result.files.every(
        (file) => !file.path.startsWith('/') && /^[a-f0-9]{64}$/.test(file.sha256),
      ),
    );
    await symlink(join(root, '.metadata'), join(root, 'alias'));
    assert.throws(() => execFileSync(process.execPath, [tool, root], { stdio: 'pipe' }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
