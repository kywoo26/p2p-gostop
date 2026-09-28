// 클래식 리마스터의 현재 카드 대비 이미지. Docker Playwright에서만 실행한다.
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(web, '../../docs/design/preview-classic.png');
const ids = [0, 1, 2, 8, 28, 29, 32, 43, 44, 47, 50, 'back'];
const labels = [
  '1광',
  '1홍단',
  '1피',
  '3광',
  '8광',
  '8기러기',
  '9국진',
  '11쌍피',
  '12비광',
  '12쌍피',
  '3피 뺏기',
  '뒷면',
];
const marks = {
  0: '1광',
  1: '1띠',
  2: '1피',
  8: '3광',
  28: '8광',
  29: '8열',
  32: '9열',
  43: '11쌍',
  44: '12광',
  47: '12쌍',
  50: '+3',
};
const url = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

async function set(kind) {
  const dir =
    kind === 'current' ? join(web, 'public/cards') : join(web, 'cards-src/classic/optimized');
  return Object.fromEntries(
    await Promise.all(
      ids.map(async (id) => [id, url(await readFile(join(dir, `${id}.svg`), 'utf8'))]),
    ),
  );
}

function card(src, id, width, current = false) {
  const mark =
    current && id !== 'back' && width !== 26 ? `<span class="mark">${marks[id]}</span>` : '';
  return `<span class="card" style="width:${width}px"><img src="${src[id]}" alt="">${mark}</span>`;
}

function row(src, width, current = false) {
  return `<div class="cards">${ids.map((id, i) => `<div class="item">${card(src, id, width, current)}<small>${labels[i]}</small></div>`).join('')}</div>`;
}

function piles(src) {
  const groups = [
    ['광', [0, 8, 28, 44], 10],
    ['열끗', [29, 32], 10],
    ['띠', [1], 10],
    ['피', [2, 43, 47, 50], 7],
  ];
  return `<div class="piles">${groups.map(([label, cards, show]) => `<div class="pile"><small>${label}</small><span class="stack" style="--show:${show}px">${cards.map((id) => card(src, id, 26)).join('')}</span></div>`).join('')}</div>`;
}

test('preview-classic', async ({ page }) => {
  const current = await set('current');
  const classic = await set('classic');
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:20px 22px 28px;width:900px;background:#0e1118;color:#f4f5f4;font-family:'WenQuanYi Zen Hei',sans-serif}
    h1{font-size:26px;margin:0 0 3px}p{font-size:14px;color:#bfc5cb;margin:0 0 12px}h2{font-size:17px;color:#f5c941;margin:17px 0 8px}
    .panel{border-radius:12px;padding:13px;background:#123d2c}.panel.dark{background:#1b212b}.comparison{display:grid;grid-template-columns:118px 1fr;gap:11px;align-items:start;margin-bottom:14px}
    .label{font-size:14px;line-height:1.3;padding-top:7px}.cards{display:flex;flex-wrap:wrap;gap:7px 8px}.item{width:44px;display:grid;justify-items:center;gap:2px}
    .card{display:inline-block;position:relative;flex:none;line-height:0}.card img{width:100%;height:auto;display:block}.mark{position:absolute;left:6%;bottom:5%;font-size:9px;line-height:1.35;background:#1e2025dd;padding:0 2px;border-radius:2px;color:white}
    small{font-size:10px;color:#d0d7d5;white-space:nowrap}.piles{display:flex;gap:20px}.pile{display:grid;gap:4px}.stack{display:flex}.stack .card+.card{margin-left:calc(var(--show) - 26px)}
    .zoom .item{width:88px}.zoom .cards{gap:9px 10px}.zoom small{font-size:11px}.zoom .mark{font-size:16px}
  </style><h1>화투 클래식 리마스터 · 1단계</h1><p>같은 카드 10장 + 뺏기 3피 + 뒷면. 현재 Commons는 앱의 월·종류 표식을 함께 표시. Docker Chromium 2×.</p>
  <h2>바닥 44 px</h2><div class="panel"><div class="comparison"><div class="label">현재 Commons</div>${row(current, 44, true)}</div><div class="comparison"><div class="label">클래식 리마스터</div>${row(classic, 44)}</div></div>
  <h2>획득패 더미 26 px · 왼쪽 7–10 px만 보임</h2><div class="panel"><div class="comparison"><div class="label">현재 Commons</div>${piles(current)}</div><div class="comparison"><div class="label">클래식 리마스터</div>${piles(classic)}</div></div>
  <h2>확대 88 px</h2><div class="panel dark zoom"><div class="comparison"><div class="label">현재 Commons</div>${row(current, 88, true)}</div><div class="comparison"><div class="label">클래식 리마스터</div>${row(classic, 88)}</div></div></html>`;
  await page.setViewportSize({ width: 900, height: 800 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate('document.fonts.ready');
  await page.screenshot({ path: out, fullPage: true });
  const { size } = await stat(out);
  console.log(`preview-classic.png: ${(size / 1024).toFixed(0)} KiB`);
  expect(size).toBeLessThanOrEqual(1024 * 1024);
});
