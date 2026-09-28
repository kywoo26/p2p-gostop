// 직접 그린 1단계 클래식 화투 샘플만 최적화한다. 런타임 카드 자산은 건드리지 않는다.
// ./dev.sh npm exec -w packages/web -- node scripts/build-classic.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';
import svgoConfig from '../svgo.config.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(web, 'cards-src/classic');
const output = join(source, 'optimized');
const cards = ['0', '1', '2', '8', '28', '29', '32', '43', '44', '47', '50', 'back'];

await mkdir(output, { recursive: true });
for (const card of cards) {
  const name = `${card}.svg`;
  const raw = await readFile(join(source, name), 'utf8');
  if (
    !raw.includes('viewBox="0 0 100 160"') ||
    /<(?:text|filter|linearGradient|radialGradient)\b/.test(raw)
  ) {
    throw new Error(`${name}: 원본 형식 규칙 위반`);
  }
  const result = optimize(raw, { ...svgoConfig, path: join(source, name) }).data;
  const bytes = Buffer.byteLength(result);
  if (bytes > 8 * 1024) throw new Error(`${name}: ${bytes} B, 8 KB 초과`);
  await writeFile(join(output, name), result);
  console.log(`${name}: ${bytes} B`);
}
