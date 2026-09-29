import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkSkin } from './check-skin.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'skin-gate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const data = Buffer.from('skin');
  await writeFile(join(directory, 'card.webp'), data);
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify([
      {
        file: 'card.webp',
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      },
    ]),
  );
  return directory;
}

test('committed files and manifest both count toward the budget', async (t) => {
  const directory = await fixture(t);
  const expected = (await readFile(join(directory, 'manifest.json'))).length + 4;
  assert.deepEqual(await checkSkin(directory, expected), { files: 2, bytes: expected });
  await assert.rejects(checkSkin(directory, expected - 1), /allocation exceeded/);
});
for (const change of ['added', 'missing', 'same-size-change']) {
  test(`reject ${change} without a matching manifest`, async (t) => {
    const directory = await fixture(t);
    if (change === 'added') await writeFile(join(directory, 'extra.webp'), 'extra');
    if (change === 'missing') await unlink(join(directory, 'card.webp'));
    if (change === 'same-size-change') await writeFile(join(directory, 'card.webp'), 'edit');
    await assert.rejects(checkSkin(directory), /Added or missing|SHA-256 mismatch/);
  });
}
