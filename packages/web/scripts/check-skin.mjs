// PA-05 / NF-03·NF-07: 빌드는 Node만 사용한다. 자산 재생성은 수동 uv 스크립트다.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function checkSkin(directory, limit = 128 * 1024) {
  const manifestData = await readFile(join(directory, 'manifest.json'));
  const entries = JSON.parse(manifestData.toString());
  assert(Array.isArray(entries) && entries.length > 0, 'Empty skin manifest');
  const names = entries.map((entry) => entry.file);
  assert.equal(new Set(names).size, names.length, 'Duplicate skin file');
  for (const entry of entries) {
    assert(
      typeof entry.file === 'string' &&
        entry.file === basename(entry.file) &&
        !['.', '..', 'manifest.json'].includes(entry.file),
      'Invalid skin file',
    );
    assert(/^[a-f0-9]{64}$/.test(entry.sha256), `Invalid SHA-256: ${entry.file}`);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `Invalid size: ${entry.file}`);
  }
  const files = await readdir(directory, { withFileTypes: true });
  assert(
    files.every((file) => file.isFile()),
    'Unexpected skin directory or symlink',
  );
  assert.deepEqual(
    files.map((file) => file.name).sort(),
    ['manifest.json', ...names].sort(),
    'Added or missing skin files',
  );
  let bytes = manifestData.length;
  for (const entry of entries) {
    const data = await readFile(join(directory, entry.file));
    assert.equal(data.length, entry.bytes, `Size mismatch: ${entry.file}`);
    assert.equal(
      createHash('sha256').update(data).digest('hex'),
      entry.sha256,
      `SHA-256 mismatch: ${entry.file}`,
    );
    bytes += data.length;
  }
  assert(bytes <= limit, `Skin allocation exceeded: ${bytes} > ${limit}`);
  return { files: files.length, bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await checkSkin(fileURLToPath(new URL('../public/skin/', import.meta.url)));
  console.log(
    `PA-05: ${result.files} committed skin files verified, ${result.bytes.toLocaleString('en-US')} bytes / 128 KiB`,
  );
}
