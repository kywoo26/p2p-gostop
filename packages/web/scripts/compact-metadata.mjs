// NF-03·AC-07·NF-RP-06 / B207-1: 배포 metadata의 JSON 값·고지는 그대로 둔다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function compactMetadata(directory) {
  // 정적 자산 provenance만 대상이다. wire/release metadata나 이미지·글꼴은 만지지 않는다.
  const path = join(directory, 'skin/manifest.json');
  const source = await readFile(path, 'utf8');
  const compact = JSON.stringify(JSON.parse(source));
  await writeFile(path, compact);
  return Buffer.byteLength(source) - Buffer.byteLength(compact);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2] ?? fileURLToPath(new URL('../dist/', import.meta.url));
  console.log(`skin metadata 공백 제거: ${await compactMetadata(directory)} B`);
}
