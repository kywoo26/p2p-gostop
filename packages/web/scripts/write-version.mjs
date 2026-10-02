// 릴리스 artifact 자체의 wire 버전과 정적 파일 해시를 고정한다(RP-02C).
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = new Set([
  'html',
  'js',
  'css',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'avif',
  'woff2',
  'ico',
  'wasm',
  'ogg',
  'mp3',
  'wav',
  'webm',
  'mp4',
]);
const files = [];
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith('.map')) continue;
    const name = relative(root, path).split(sep).join('/');
    const ext = entry.name.split('.').at(-1)?.toLowerCase();
    // Kit의 source build ID와 앱 wire/hash manifest는 별개다. 정확한 생성 파일만 포함한다.
    if (!types.has(ext) && name !== '_app/version.json') continue;
    files.push([name, await readFile(path)]);
  }
}
await visit(root);
if (!files.some(([name]) => name === 'index.html')) throw new Error('web dist requires index.html');
const hash = createHash('sha256');
for (const [name, body] of files.toSorted(([a], [b]) => a.localeCompare(b))) {
  hash.update(name);
  hash.update('\0');
  hash.update(body);
}
await writeFile(
  join(root, 'version.json'),
  `${JSON.stringify({ wireVersion: PROTOCOL_VERSION, hash: hash.digest('hex') })}\n`,
);
