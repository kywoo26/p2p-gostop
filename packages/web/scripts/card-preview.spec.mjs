// 카드 시안 미리보기 PNG (디자인 트랙 D1 1단계). 테스트가 아니라 그림 생성기다.
//   ./dev.sh npm exec -w packages/web -- node scripts/card-drafts.mjs   (SVG 먼저)
//   ./dev.sh e2e -c scripts/card-preview.config.mjs                      (PNG)
// 휴대폰에서 GitHub로 보는 용도라 폭 900 CSS px, 기기 배율 2×, 파일당 1 MB 이하로 맞춘다.
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { DRAFTS, SAMPLE_CARDS } from './card-drafts.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = resolve(WEB, '../../docs/design');
const MAX_PNG_BYTES = 1024 * 1024;

// tokens.css의 실제 카드 폭(s 획득패 / m 바닥 / l 손패)과 겹침(CapturedPile.svelte)
const SIZE = { s: 26, m: 44, l: 62 };
const PILE_SHOW = { default: 10, pi: 7 };
const PILES = [
  ['광', [0, 44], 'default'],
  ['열끗', [32, 45], 'default'],
  ['띠', [1, 33, 46], 'default'],
  ['피', [2, 34, 47, 50], 'pi'],
];
const HAND = [0, 1, 32, 45, 47, 50];
const ZOOM_PICK = [0, 1, 32, 44, 47, 50];

/** 현재 앱이 Commons 그림 위에 덧그리는 표식(Card.svelte cardMark) */
const CURRENT_MARK = {
  0: '1광',
  1: '1띠',
  2: '1피',
  32: '9열',
  33: '9띠',
  34: '9피',
  44: '12광',
  45: '12열',
  46: '12띠',
  47: '12쌍',
  50: '+3',
};

const labelOf = (id) => (id === 'back' ? '뒷면' : SAMPLE_CARDS.find((c) => c.id === id).label);
const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

async function loadSet(key) {
  const ids = [...SAMPLE_CARDS.map((c) => c.id), 'back'];
  const dir = key === 'current' ? join(WEB, 'public/cards') : join(WEB, 'cards-src/drafts', key);
  const out = {};
  for (const id of ids) out[id] = dataUri(await readFile(join(dir, `${id}.svg`), 'utf8'));
  return out;
}

function card(set, id, w, { mark = false } = {}) {
  const m =
    mark && id !== 'back'
      ? `<span class="mark" style="font-size:${Math.max(9, w * 0.19)}px">${CURRENT_MARK[id]}</span>`
      : '';
  return `<span class="card" style="width:${w}px"><img src="${set[id]}" alt="">${m}</span>`;
}

function piles(set, opts) {
  return `<div class="piles">${PILES.map(
    ([name, ids, kind]) =>
      `<div class="pile"><span class="pname">${name}<b>${ids.length}</b></span><span class="stack" style="--show:${PILE_SHOW[kind]}px">${ids
        .map((id) => card(set, id, SIZE.s, opts))
        .join('')}</span></div>`,
  ).join('')}</div>`;
}

function row(set, ids, w, opts = {}) {
  return `<div class="row">${ids
    .map(
      (id) =>
        `<figure>${card(set, id, w, opts)}${opts.caption ? `<figcaption>${labelOf(id)}</figcaption>` : ''}</figure>`,
    )
    .join('')}</div>`;
}

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 22px 26px; width: 900px; background: oklch(17% 0.015 260);
    color: oklch(95% 0.01 260); font-family: 'WenQuanYi Zen Hei', sans-serif; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 18px 0 8px; color: oklch(84% 0.15 88); }
  p.lead { margin: 0 0 6px; font-size: 15px; color: oklch(75% 0.02 260); line-height: 1.45; }
  .felt { background: oklch(33% 0.06 160); border-radius: 12px; padding: 12px 14px; }
  .sub { font-size: 13px; color: oklch(85% 0.03 160); margin: 8px 0 4px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
  figure { margin: 0; display: grid; justify-items: center; gap: 4px; }
  figcaption { font-size: 13px; color: oklch(85% 0.02 260); }
  .card { position: relative; display: inline-block; flex: none; line-height: 0; }
  .card img { width: 100%; height: auto; display: block; }
  .mark { position: absolute; left: 6%; bottom: 5%; padding: 0 0.3em; border-radius: 0.3em;
    background: oklch(18% 0.01 260 / 0.88); color: #fff; font-weight: 700; line-height: 1.35; }
  .piles { display: flex; gap: 14px; align-items: flex-end; }
  .pile { display: grid; gap: 2px; }
  .pname { font-size: 12px; color: oklch(80% 0.02 260); }
  .pname b { margin-left: 3px; color: #fff; }
  .stack { display: flex; }
  .stack .card + .card { margin-left: calc(var(--show) - ${SIZE.s}px); }
  table { border-collapse: separate; border-spacing: 0 10px; }
  th { text-align: left; font-size: 14px; font-weight: 600; padding-right: 12px; width: 118px;
    vertical-align: middle; color: oklch(90% 0.02 260); }
  .zoom { background: oklch(23% 0.02 260); border-radius: 12px; padding: 12px 10px; }
  .zoom .row { gap: 8px 6px; }
`;

function page(title, body) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body><h1>${title}</h1>${body}</body></html>`;
}

const CONCEPT = {
  A: '평면 색면 + 균일한 먹선 + 원·호·다각형. 8색. 광은 금색 안쪽 테두리, 12월 쌍피는 빨간 바탕. 모서리에 월 숫자와 종류 표식(● 광, ◐ 비광, ◆ 열끗, 띠 조각, ▮ 피 칩 개수).',
  B: '한지색 바탕 + 붓 획(채운 다각형, filter 없음) + 한 장에 강조색 하나. 모서리는 빨간 도장 칸의 흰 숫자, 아래에 같은 종류 표식 체계. 여백을 넓게 남긴다.',
};

async function shoot(browserPage, html, file) {
  await browserPage.setViewportSize({ width: 900, height: 800 });
  await browserPage.setContent(html, { waitUntil: 'load' });
  await browserPage.evaluate('document.fonts.ready'); // 브라우저에서 평가하는 식(Node 린트 범위 밖)
  const out = join(DOCS, file);
  await browserPage.screenshot({ path: out, fullPage: true });
  const { size } = await stat(out);
  console.log(`${file}: ${(size / 1024).toFixed(0)} KiB`);
  expect(size).toBeLessThanOrEqual(MAX_PNG_BYTES);
}

for (const key of Object.keys(DRAFTS)) {
  test(`preview-${key}`, async ({ page: p }) => {
    const set = await loadSet(key);
    const faces = SAMPLE_CARDS.map((c) => c.id);
    const body =
      `<p class="lead">${CONCEPT[key]}</p>` +
      `<h2>앱 실제 크기 (tokens.css: 획득패 ${SIZE.s}px · 바닥 ${SIZE.m}px · 손패 ${SIZE.l}px, 기기 배율 2×)</h2>` +
      `<div class="felt"><div class="sub">획득패 더미 (${SIZE.s}px, 광·열끗·띠는 ${PILE_SHOW.default}px, 피는 ${PILE_SHOW.pi}px씩 보임)</div>${piles(set)}` +
      `<div class="sub">바닥 (${SIZE.m}px)</div>${row(set, [...faces, 'back'], SIZE.m)}` +
      `<div class="sub">손패 (${SIZE.l}px)</div>${row(set, HAND, SIZE.l)}</div>` +
      `<h2>3배 확대 (${SIZE.m * 3}px)</h2><div class="zoom">${row(set, [...faces, 'back'], SIZE.m * 3, { caption: true })}</div>`;
    await shoot(p, page(DRAFTS[key].name, body), `preview-${key}.png`);
  });
}

test('preview-compare', async ({ page: p }) => {
  const sets = [
    ['현재 (Commons,<br>앱 표식 포함)', await loadSet('current'), { mark: true }],
    ['시안 A', await loadSet('A'), {}],
    ['시안 B', await loadSet('B'), {}],
  ];
  const faces = SAMPLE_CARDS.map((c) => c.id);
  const table = (fn) =>
    `<table>${sets.map(([name, set, opts]) => `<tr><th>${name}</th><td>${fn(set, opts)}</td></tr>`).join('')}</table>`;
  const body =
    `<p class="lead">같은 카드 11장 + 뒷면. 현재 세트는 앱이 그 위에 덧그리는 월·종류 표식(Card.svelte)까지 재현했다. 기기 배율 2×.</p>` +
    `<h2>바닥 크기 ${SIZE.m}px</h2><div class="felt">${table((set, opts) => row(set, [...faces, 'back'], SIZE.m, opts))}</div>` +
    `<h2>획득패 더미 ${SIZE.s}px</h2><div class="felt">${table((set) => piles(set))}</div>` +
    `<h2>2배 확대 ${SIZE.m * 2}px</h2><div class="zoom">${table((set, opts) => row(set, ZOOM_PICK, SIZE.m * 2, opts))}</div>`;
  await shoot(p, page('현재 카드 vs 시안 A·B', body), 'preview-compare.png');
});
