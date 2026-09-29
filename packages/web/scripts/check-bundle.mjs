// 번들 예산·외부 URL 검사 (spec NF-01·NF-03, AC-07, plan.md 1.8 "위생"). 의존성 없음.
// - NF-03: dist ≤1.5MiB. PRO_ASSET_REVIEW=1 평가 전용 빌드만 초과 허용.
// - 외부 URL(http(s)/ws(s), localhost·127.0.0.1 제외) 0건.
//   NP-RP-01: 사용자 설정 origin은 런타임 값이므로 번들 리터럴 허용 목록에 넣지 않는다.
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRO_ATTRIBUTION_URLS } from '../src/pro-assets/credits.ts';
import { ATTRIBUTION_URLS } from '../src/cards/attribution.ts';
import { FONT_ATTRIBUTION_URLS } from '../src/fonts/attribution.ts';

const LIMIT_BYTES = 1.5 * 1024 * 1024;
const review = process.env['PRO_ASSET_REVIEW'] === '1';
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.svg',
  '.json',
  '.txt',
  '.webmanifest',
  '.xml',
]);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
/**
 * 네트워크 요청이 아닌 식별자 URL. 브라우저가 가져오지 않는다.
 * - XML 네임스페이스(Svelte 런타임이 SVG·MathML 요소를 만들 때 사용)
 */
const IDENTIFIER_URLS = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/xmlns/',
]);
/**
 * 네트워크 요청이 아닌 문서 링크 접두사. 오류 메시지 문자열 안에만 나타나며 가져오지 않는다.
 * - Svelte 5 프로덕션 런타임은 오류 코드를 `https://svelte.dev/e/<code>` 문구로 던진다.
 */
const MESSAGE_LINK_PREFIXES = ['https://svelte.dev/e/'];
// 기존 LAN transport의 `ws://${host}` 템플릿이 minify되면 이 조각으로 남는다.
// 완성된 정적 origin은 아래 외부 URL 검사에서 계속 차단한다.
const DYNAMIC_URL_FRAGMENTS = new Set(['ws://$']);
/**
 * 라이선스 화면에 글자로만 보여 주는 주소 (CC BY-SA 4.0 표기 의무, spec NF-07). 링크를 걸지 않고 요청하지 않는다.
 * 정확히 같은 문자열만 허용한다(src/cards/attribution.ts).
 */
const DISPLAYED_URLS = new Set([
  ...ATTRIBUTION_URLS,
  ...FONT_ATTRIBUTION_URLS,
  ...PRO_ATTRIBUTION_URLS,
]);
const URL_PATTERN = /(?:https?|wss?):\/\/[^\s"'`<>()\\{}|^]+/g;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const allowed = new Map();

function isExternal(raw) {
  const url = raw.replace(/[.,;:]+$/, '');
  const known =
    IDENTIFIER_URLS.has(url) || DISPLAYED_URLS.has(url) || DYNAMIC_URL_FRAGMENTS.has(url)
      ? url
      : MESSAGE_LINK_PREFIXES.find((prefix) => url.startsWith(prefix));
  if (known) {
    allowed.set(known, (allowed.get(known) ?? 0) + 1);
    return false;
  }
  try {
    return !LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return true;
  }
}

let total = 0;
const sizes = [];
const external = [];
try {
  await stat(DIST);
} catch {
  console.error(`dist가 없습니다: ${DIST} (먼저 vite build)`);
  process.exit(1);
}
for await (const file of walk(DIST)) {
  const { size } = await stat(file);
  total += size;
  sizes.push([relative(DIST, file), size]);
  if (TEXT_EXTENSIONS.has(extname(file))) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(URL_PATTERN)) {
      if (isExternal(match[0])) external.push(`${relative(DIST, file)}: ${match[0]}`);
    }
  }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
sizes.sort((a, b) => b[1] - a[1]);
for (const [file, size] of sizes.slice(0, 10)) console.log(`  ${kb(size).padStart(12)}  ${file}`);
console.log(
  `dist 합계 ${kb(total)} / 예산 ${kb(LIMIT_BYTES)}${review ? ' (평가 전용: 예산 개정 승인 전)' : ''} (${sizes.length}개 파일)`,
);

let failed = false;
if (total > LIMIT_BYTES && !review) {
  console.error(`실패: 번들 예산 초과 (${kb(total)} > ${kb(LIMIT_BYTES)})`);
  failed = true;
}
if (review) console.warn('평가용 초과 허용 — 본선 적용/릴리스 승인 아님');
if (external.length > 0) {
  console.error(`실패: 외부 URL ${external.length}건 (spec NF-01)`);
  for (const line of external) console.error(`  ${line}`);
  failed = true;
} else {
  console.log('외부 URL 0건');
}
for (const [url, count] of allowed) {
  console.log(`  (허용: 요청이 아닌 식별자·오류 문구·저작자 표기 ${url} ×${count})`);
}
process.exit(failed ? 1 : 0);
