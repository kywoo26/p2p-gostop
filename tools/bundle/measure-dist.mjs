// NF-03·AC-07·NF-RP-06 / B207-1: 중복 없는 전체 raw 배포 manifest. 전송 실측과 별도다.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const [directory, output] = process.argv.slice(2);
if (!directory) throw new Error('Usage: node tools/bundle/measure-dist.mjs <dist> [output.json]');
const root = resolve(directory);
const files = [];
function category(path) {
  if (path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.woff2')) return 'fonts';
  if (path.startsWith('cards/') && path.endsWith('.svg')) return 'cards';
  if (path.startsWith('skin/') && path.endsWith('.webp')) return 'skin';
  return 'metadata';
}
async function visit(currentDirectory) {
  for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symbolic link is not a deployable file');
    const path = join(currentDirectory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile()) {
      const data = await readFile(path);
      const name = relative(root, path).split(sep).join('/');
      files.push({
        path: name,
        category: category(name),
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      });
    }
  }
}
await visit(root);
files.sort((a, b) => a.path.localeCompare(b.path));
const categories = {};
for (const file of files) {
  const item = (categories[file.category] ??= { files: 0, bytes: 0 });
  item.files++;
  item.bytes += file.bytes;
}
const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
const result = {
  schema: 1,
  node: process.version,
  accounting: 'all-dist-files-raw-bytes',
  limitBytes: 1572864,
  bytes,
  spareBytes: 1572864 - bytes,
  categories,
  manifestSha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
  files,
};
const json = `${JSON.stringify(result, null, 2)}\n`;
if (output) await writeFile(output, json);
else process.stdout.write(json);
