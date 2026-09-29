// NF-01/07·VD-04: 새 UI 문구가 subset 밖으로 빠지거나 산출물이 바뀌면 빌드를 막는다.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../../../', import.meta.url);
const text = async (path) => readFile(new URL(path, root), 'utf8');
const corpus = await text('docs/design/fonts/app-corpus.txt');
const metrics = JSON.parse(await text('docs/design/fonts/app-metrics.json'));
const font = await readFile(new URL('packages/web/src/styles/fonts/GostopSans.woff2', root));
const license = await readFile(new URL('packages/web/src/styles/fonts/GostopSans-OFL.txt', root));
const css = await text('packages/web/src/styles/fonts/GostopSans.css');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const cssCodes = new Set(
  [...css.matchAll(/U\+([0-9A-F]+)/gi)].map((m) => Number.parseInt(m[1], 16)),
);
const required = new Set();
async function scan(dir) {
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (
      /\.(?:svelte|ts)$/.test(path) &&
      !path.includes('.test.') &&
      entry.name !== 'test-setup.ts'
    )
      for (const c of (await text(path)).match(/[가-힣ㄱ-ㅣ]/g) ?? []) required.add(c);
  }
}
await scan('packages/web/src');
for (const c of (await text('packages/engine/src/reduce.ts')).match(/[가-힣ㄱ-ㅣ]/g) ?? [])
  required.add(c);
for (const c of Array.from({ length: 95 }, (_, n) => String.fromCharCode(32 + n)).join('') +
  '×→←↗·…—냥뻑쪽따닥')
  required.add(c);
const missing = [...required].filter((c) => !corpus.includes(c) || !cssCodes.has(c.codePointAt(0)));
if (missing.length)
  throw new Error(`폰트 코퍼스/CSS 누락: ${missing.join('')}. build_app_font.py 재실행 필요`);
if (
  font.length > 160 * 1024 ||
  font.length !== metrics.subsetBytes ||
  hash(font) !== metrics.subsetSha256 ||
  hash(corpus.endsWith('\n') ? corpus.slice(0, -1) : corpus) !== metrics.corpusSha256
)
  throw new Error('폰트 160KiB/바이트/SHA-256 gate 실패');
if (
  hash(license) !== metrics.licenseSha256 ||
  !metrics.tnum ||
  new Set(metrics.tabularDigitWidths).size !== 1
)
  throw new Error('OFL/tnum 고지·숫자 gate 실패');
if (/https?:/.test(css) || !css.includes('font-display:'))
  throw new Error('로컬 @font-face 계약 실패');
console.log(
  `폰트 ${(font.length / 1024).toFixed(1)}KiB / 160KiB, UI 문자 ${required.size}개 누락0, OFL/tnum/hash 통과`,
);
