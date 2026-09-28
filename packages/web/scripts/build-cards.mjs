// 카드 SVG 파이프라인 (plan.md 1.6, spec 6.6). 의존성: svgo(4.1.0)뿐.
//
//   node scripts/build-cards.mjs [--fetch] [--raw <디렉터리>]
//
// 1. src/cards/map.json의 Commons 파일(0~47번)을 --raw 디렉터리(기본 .cache/hwatu)에서 읽는다.
//    --fetch를 주면 없는 파일을 Wikimedia Commons에서 받아 온다(한 번만 필요. 앱 코드는 네트워크를 쓰지 않는다).
//    모든 원본은 map.json의 SHA-1과 대조한다(Commons 파일이 새 판으로 바뀌어도 조용히 섞이지 않게).
// 2. cards-src/의 자체 제작 원본(48~50번, 뒷면)을 읽는다.
// 3. svgo.config.mjs로 최적화해 public/cards/<id>.svg, public/cards/back.svg로 쓴다.
// 4. src/cards/attribution.ts를 바탕으로 public/cards/ATTRIBUTION.md와 LICENSE를 만든다.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { optimize } from 'svgo';
import svgoConfig from '../svgo.config.mjs';
import {
  CARD_ART_AUTHORS,
  CARD_ART_CHANGES,
  CARD_ART_CREDIT,
  CARD_ART_LICENSE,
  CARD_ART_SOURCE,
  CODE_LICENSE,
  ORIGINAL_ART_LICENSE,
} from '../src/cards/attribution.ts';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(WEB, 'public/cards');
const ORIGINALS = join(WEB, 'cards-src');
const USER_AGENT = 'p2p-gostop-card-fetch/1.0 (one-time asset download; svgo pipeline)';

const { values: args } = parseArgs({
  options: {
    fetch: { type: 'boolean', default: false },
    raw: { type: 'string', default: join(WEB, '.cache/hwatu') },
  },
});

const map = JSON.parse(await readFile(join(WEB, 'src/cards/map.json'), 'utf8'));
const sha1 = (text) => createHash('sha1').update(text).digest('hex');
const commonsPage = (file) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}`;
const commonsDownload = (file) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replaceAll(' ', '_'))}`;

async function readCommons(card) {
  const path = join(args.raw, card.file);
  if (!existsSync(path)) {
    if (!args.fetch) throw new Error(`원본 없음: ${path} (--fetch로 받아 오기)`);
    const res = await fetch(commonsDownload(card.file), { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`${card.file}: HTTP ${res.status}`);
    await mkdir(args.raw, { recursive: true });
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
  }
  const raw = await readFile(path);
  if (sha1(raw) !== card.sha1) {
    throw new Error(`${card.file}: SHA-1 불일치 (기대 ${card.sha1}, 실제 ${sha1(raw)})`);
  }
  return raw.toString('utf8');
}

function svgoOptimize(svg, path) {
  return optimize(svg, { ...svgoConfig, path }).data;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const rows = [];
let commonsBytes = 0;
let originalBytes = 0;
for (const card of map.cards) {
  const source =
    card.source === 'commons'
      ? await readCommons(card)
      : await readFile(join(ORIGINALS, card.file), 'utf8');
  const data = svgoOptimize(source, card.file);
  const bytes = Buffer.byteLength(data);
  await writeFile(join(OUT, `${card.id}.svg`), data);
  if (card.source === 'commons') commonsBytes += bytes;
  else originalBytes += bytes;
  rows.push({ card, bytes, sourceBytes: Buffer.byteLength(source) });
}
const back = svgoOptimize(await readFile(join(ORIGINALS, map.back.file), 'utf8'), map.back.file);
await writeFile(join(OUT, 'back.svg'), back);
originalBytes += Buffer.byteLength(back);

const monthLabel = (card) => (card.month === null ? '보너스' : `${card.month}월`);
const kindLabel = { gwang: '광', yeol: '열끗', tti: '띠', pi: '피', bonus: '보너스' };
const describe = (card) =>
  `${monthLabel(card)} ${kindLabel[card.kind]}${card.kind === 'pi' && card.piValue === 2 ? '(쌍피)' : ''}${card.kind === 'bonus' ? ` ${card.piValue}피` : ''}`;

const attribution = `# 카드 그림 저작자 표시 (Attribution)

이 파일은 \`scripts/build-cards.mjs\`가 \`src/cards/attribution.ts\`와 \`src/cards/map.json\`으로 만든다. 직접 고치지 않는다.

## 0~47번: Wikimedia Commons "SVG Hwatu" — ${CARD_ART_LICENSE.name}

${CARD_ART_CREDIT}

- 저작자:
${CARD_ART_AUTHORS.map((a) => `  - ${a.name} — ${a.role}`).join('\n')}
- 원본 모음: [${CARD_ART_SOURCE.name}](${CARD_ART_SOURCE.url})
- 라이선스: [${CARD_ART_LICENSE.title}](${CARD_ART_LICENSE.url})
- 변경 사항: ${CARD_ART_CHANGES}

| ID | 카드 | 파일 | 원본 (Commons 파일 페이지) | 원본 SHA-1 |
|---:|---|---|---|---|
${rows
  .filter((r) => r.card.source === 'commons')
  .map(
    ({ card }) =>
      `| ${card.id} | ${describe(card)} | ${card.id}.svg | [${card.file}](${commonsPage(card.file)}) | \`${card.sha1}\` |`,
  )
  .join('\n')}

## 48~50번과 back.svg: 자체 제작 — ${ORIGINAL_ART_LICENSE.name}

${ORIGINAL_ART_LICENSE.scope} [${ORIGINAL_ART_LICENSE.title}](${ORIGINAL_ART_LICENSE.url})로 공개한다. 사람이 읽는 원본은 저장소의 \`packages/web/cards-src/\`에 있다.

| ID | 카드 | 파일 | 원본 |
|---:|---|---|---|
${rows
  .filter((r) => r.card.source === 'original')
  .map(({ card }) => `| ${card.id} | ${describe(card)} | ${card.id}.svg | cards-src/${card.file} |`)
  .join('\n')}
| — | 카드 뒷면 | back.svg | cards-src/${map.back.file} |

## 코드

${CODE_LICENSE.scope} 카드 그림의 동일조건(ShareAlike)은 그림과 그 변경본에만 적용된다.
`;
await writeFile(join(OUT, 'ATTRIBUTION.md'), attribution);

const license = `이 디렉터리의 카드 그림 라이선스 (p2p-gostop)

0.svg ~ 47.svg
  ${CARD_ART_CREDIT}
  ${CARD_ART_LICENSE.name} — ${CARD_ART_LICENSE.title}
  ${CARD_ART_LICENSE.url}
  저작자·원본 파일·변경 사항: ATTRIBUTION.md

48.svg, 49.svg, 50.svg, back.svg
  ${ORIGINAL_ART_LICENSE.scope}
  ${ORIGINAL_ART_LICENSE.name} — ${ORIGINAL_ART_LICENSE.title}
  ${ORIGINAL_ART_LICENSE.url}
  법이 허용하는 범위에서 저작권과 저작인접권을 모두 포기하고 퍼블릭 도메인에 헌정한다.
  To the extent possible under law, the p2p-gostop contributors have waived all copyright
  and related or neighboring rights to these four files.
`;
await writeFile(join(OUT, 'LICENSE'), license);

const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
for (const { card, bytes, sourceBytes } of rows) {
  console.log(
    `${String(card.id).padStart(3)}  ${kib(sourceBytes).padStart(10)} → ${kib(bytes).padStart(9)}  ${card.file}`,
  );
}
console.log(`Commons 48장: ${kib(commonsBytes)} (${commonsBytes} B)`);
console.log(`자체 제작 4장(보너스 3 + 뒷면): ${kib(originalBytes)} (${originalBytes} B)`);
console.log(
  `카드 SVG 합계: ${kib(commonsBytes + originalBytes)} (${commonsBytes + originalBytes} B)`,
);
