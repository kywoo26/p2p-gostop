// 자체 제작 카드 시안 생성기 (디자인 트랙 D1 1단계, docs/design/cards-style.md).
//
//   node scripts/card-drafts.mjs          → cards-src/drafts/{A,B}/<id>.svg, back.svg
//
// - 입력은 이 파일의 팔레트 토큰(OKLCH)과 도형 함수뿐이다. 외부 그림·글꼴을 쓰지 않는다(전부 CC0 자체 제작).
// - 결정적이다: 같은 코드 → 같은 바이트. 붓 떨림(시안 B)도 고정 시드 PRNG로 만든다.
// - 출력은 svgo.config.mjs로 최적화한 뒤 쓴다(런타임 파이프라인과 같은 설정). 카드당 8 KB 예산을 검사한다.
// - 1단계는 표본 11장(1월 광·띠·피, 9월 국진·띠·피, 12월 비광·열끗·띠·쌍피, 보너스 3피)과 뒷면만 그린다.
//   나머지 월은 A_ART·B_ART에 카드 ID 키로 같은 방식으로 추가하면 된다(2단계).
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';
import svgoConfig from '../svgo.config.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(WEB, 'cards-src/drafts');

/** 카드 좌표계 (cards-style.md 2장) */
export const CARD = { w: 100, h: 160, r: 7 };
const BUDGET_BYTES = 8 * 1024;

// ─── 색: OKLCH 토큰 → sRGB hex (생성 시점에 변환해 SVG에는 짧은 hex만 남긴다) ───

export function oklchToHex([l, c, hDeg]) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return (
    '#' +
    lin
      .map((v) => {
        const x = Math.min(1, Math.max(0, v));
        const g = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
        return Math.round(g * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

/** 팔레트 토큰 (L 0~1, C, h°). 시안마다 8색 이하 (cards-style.md 4장) */
export const PALETTES = {
  A: {
    paper: [0.965, 0.012, 85],
    ink: [0.25, 0.03, 265],
    red: [0.6, 0.2, 29],
    gold: [0.84, 0.15, 84],
    green: [0.58, 0.13, 150],
    blue: [0.53, 0.15, 256],
    pink: [0.82, 0.08, 5],
    violet: [0.47, 0.16, 300],
  },
  B: {
    paper: [0.945, 0.022, 82],
    ink: [0.21, 0.012, 60],
    red: [0.6, 0.19, 35],
    gold: [0.79, 0.14, 80],
    green: [0.52, 0.09, 145],
    blue: [0.5, 0.13, 250],
    wash: [0.83, 0.018, 80],
    plum: [0.62, 0.14, 350],
  },
};

/** 뒷면 전용 1색 (앞면 팔레트 밖. cards-style.md 4장) */
export const BACK_TONES = {
  A: [0.5, 0.18, 28], // 청해파 무늬 선(바탕 빨강보다 어두운 빨강)
  B: [0.42, 0.13, 30], // 뒷면 바탕(검붉은 주칠)
};

const hexPalette = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, oklchToHex(v)]));

// ─── SVG 조각 도우미 ───

const f = (n) => String(Math.round(n * 10) / 10);
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? f(v) : v}"`)
    .join('');
const el = (name, a, children = '') =>
  children ? `<${name}${attrs(a)}>${children}</${name}>` : `<${name}${attrs(a)}/>`;
const g = (a, ...children) => el('g', a, children.join(''));
const path = (d, a = {}) => el('path', { d, ...a });
const circle = (cx, cy, r, a = {}) => el('circle', { cx, cy, r, ...a });
const ellipse = (cx, cy, rx, ry, a = {}) => el('ellipse', { cx, cy, rx, ry, ...a });
const rect = (x, y, width, height, a = {}) => el('rect', { x, y, width, height, ...a });
const line = (pts, a = {}) => path(`M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`, a);
const poly = (pts, a = {}) => path(`M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`, a);
const rot = (deg, cx, cy) => `rotate(${f(deg)} ${f(cx)} ${f(cy)})`;
const stroke = (color, width, extra = {}) => ({
  fill: 'none',
  stroke: color,
  'stroke-width': width,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  ...extra,
});

/** 절대 좌표 명령(M L H V C Q Z)만 쓰는 경로를 확대·이동한다 */
function transformPath(d, s, tx, ty) {
  return d.replace(/([MLHVCQZ])([^MLHVCQZ]*)/g, (_, cmd, args) => {
    const nums = args.trim()
      ? args
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];
    const out = nums.map((n, i) => {
      if (cmd === 'H') return f(n * s + tx);
      if (cmd === 'V') return f(n * s + ty);
      return f(i % 2 === 0 ? n * s + tx : n * s + ty);
    });
    return cmd + out.join(' ');
  });
}

// ─── 모서리 숫자: 선 글자(10×16 격자, 둥근 끝). <text>는 기기 글꼴에 따라 달라지므로 쓰지 않는다 ───

const DIGITS = {
  0: { w: 10, d: 'M5 0C2 0 0.6 3.2 0.6 8C0.6 12.8 2 16 5 16C8 16 9.4 12.8 9.4 8C9.4 3.2 8 0 5 0Z' },
  1: { w: 5, d: 'M0.4 3.6L4.4 0V16' },
  2: {
    w: 10,
    d: 'M0.9 4.2C0.9 1.7 2.7 0 5 0C7.4 0 9.1 1.7 9.1 4.1C9.1 6.6 7.6 8.1 5.6 10.1L0.8 15.6H9.4',
  },
  3: {
    w: 10,
    d: 'M1 1.3C2 0.5 3.4 0 5 0C7.4 0 9 1.6 9 3.8C9 6.2 7.2 7.6 4.4 7.6C7.6 7.6 9.4 9.4 9.4 11.8C9.4 14.4 7.4 16 4.8 16C3 16 1.6 15.4 0.6 14.4',
  },
  4: { w: 10, d: 'M7.4 16V0L0.6 11H9.6' },
  5: {
    w: 10,
    d: 'M8.8 0H1.8L1.1 7.1C2.2 6.4 3.5 6 5 6C7.6 6 9.4 7.9 9.4 10.8C9.4 14 7.4 16 4.8 16C3 16 1.6 15.4 0.6 14.4',
  },
  6: {
    w: 10,
    d: 'M8.6 1.2C7.6 0.4 6.4 0 5.2 0C2.4 0 0.6 3 0.6 8.6C0.6 13.4 2.4 16 5 16C7.6 16 9.4 14 9.4 11.2C9.4 8.4 7.6 6.6 5.1 6.6C3 6.6 1.4 7.8 0.7 9.8',
  },
  7: { w: 10, d: 'M0.6 0H9.4L3.6 16' },
  8: {
    w: 10,
    d: 'M5 7.4C2.7 7.4 1.2 6 1.2 3.7C1.2 1.5 2.8 0 5 0C7.2 0 8.8 1.5 8.8 3.7C8.8 6 7.3 7.4 5 7.4C2.4 7.4 0.6 9 0.6 11.6C0.6 14.3 2.5 16 5 16C7.5 16 9.4 14.3 9.4 11.6C9.4 9 7.6 7.4 5 7.4Z',
  },
  9: {
    w: 10,
    d: 'M9.4 6C9.4 8.6 7.6 10.2 5 10.2C2.4 10.2 0.6 8.4 0.6 5.1C0.6 2.1 2.5 0 5 0C7.8 0 9.4 2.2 9.4 6V8C9.4 13 7.4 16 4.6 16C3.2 16 2 15.5 1.2 14.8',
  },
  '+': { w: 8, d: 'M0.4 8H7.6M4 4.4V11.6' },
};
const DIGIT_GAP = 2.2;

/** 숫자열을 그린다(x0는 가운데 또는 왼쪽 기준). h는 글자 높이(카드 단위), sw는 획 굵기(카드 단위) */
function numeral(text, x0, top, h, color, sw, align = 'center', maxWidth = Infinity) {
  const chars = [...text].map((c) => DIGITS[c]);
  const width = chars.reduce((sum, c) => sum + c.w, 0) + DIGIT_GAP * (chars.length - 1);
  const s = Math.min(h / 16, maxWidth / width);
  if (s < h / 16) top += (h - 16 * s) / 2;
  let x = align === 'left' ? x0 : x0 - (width * s) / 2;
  const d = chars
    .map((c) => {
      const out = transformPath(c.d, s, x, top);
      x += (c.w + DIGIT_GAP) * s;
      return out;
    })
    .join('');
  return path(d, stroke(color, sw));
}

// ─── 종류 표식 (색이 아니라 모양으로 구분, NF-08). 두 시안이 같은 체계를 쓴다 ───
//   광 ● 원(금색 + 테두리) / 비광 ◐ 반원 / 열끗 ◆ 마름모 / 띠 ▬ 띠 조각(띠 색)
//   피 ▮ 칩 1개 / 쌍피 ▮▮ 2개 / 보너스 3피 ▮▮▮ 3개 / 국진 ◆ + 작은 ▮▮

function chips(n, cx, cy, fill, edge, scale = 1) {
  const w = 4.6 * scale;
  const h = 9 * scale;
  const gap = 2 * scale;
  const total = n * w + (n - 1) * gap;
  let out = '';
  for (let i = 0; i < n; i++) {
    out += rect(cx - total / 2 + i * (w + gap), cy - h / 2, w, h, {
      rx: 1.3 * scale,
      fill,
      stroke: edge,
      'stroke-width': edge ? 1.4 * scale : undefined,
    });
  }
  return out;
}

function kindGlyph(card, cx, cy, c, onDark = false) {
  const ink = onDark ? c.paper : c.ink;
  switch (card.glyph) {
    case 'gwang':
      return circle(cx, cy, 7.6, { fill: c.gold, stroke: c.ink, 'stroke-width': 2.2 });
    case 'bigwang':
      return (
        path(`M${f(cx)} ${f(cy - 7.6)}A7.6 7.6 0 0 0 ${f(cx)} ${f(cy + 7.6)}Z`, { fill: c.gold }) +
        circle(cx, cy, 7.6, { fill: 'none', stroke: c.ink, 'stroke-width': 2.2 })
      );
    case 'yeol':
      return poly(
        [
          [cx, cy - 9],
          [cx + 7.8, cy],
          [cx, cy + 9],
          [cx - 7.8, cy],
        ],
        { fill: ink },
      );
    case 'gukjin':
      return (
        poly(
          [
            [cx - 6, cy - 9],
            [cx + 1.6, cy],
            [cx - 6, cy + 9],
            [cx - 13.6, cy],
          ],
          { fill: ink },
        ) + chips(2, cx + 9, cy, ink, null, 0.95)
      );
    case 'tti':
      return poly(
        [
          [cx - 11, cy - 2],
          [cx + 8.5, cy - 7],
          [cx + 11, cy + 2],
          [cx - 8.5, cy + 7],
        ],
        { fill: card.ribbon === 'cheong' ? c.blue : c.red, stroke: c.ink, 'stroke-width': 2 },
      );
    case 'pi':
      return chips(1, cx, cy, ink, null, 1.25);
    case 'ssangpi':
      return chips(2, cx, cy, ink, null, 1.25);
    case 'bonus3':
      return chips(3, cx, cy, ink, null, 1.2);
    default:
      return '';
  }
}

/**
 * 모서리 색인: 숫자(또는 +3) + 종류 표식. 표식 영역(INDEX_ZONE)에는 모티프를 두지 않는다.
 * 획득패 더미는 카드 왼쪽 7~10px만 보인다(CapturedPile.svelte, s 크기 26px → 27~38 단위).
 * 그래서 색인은 왼쪽 정렬이고 종류 표식은 x 30 안에 들어간다.
 */
export const INDEX_ZONE = { x: 0, y: 0, w: 38, h: 58 };
const INDEX_LEFT = 6;
const GLYPH_CX = 16.5;
const NUMERAL_TOP = 8;
const NUMERAL_H = 26;
const GLYPH_CY = 48;

function indexA(card, c, onDark) {
  const color = onDark ? c.paper : c.ink;
  return (
    numeral(card.index, INDEX_LEFT, NUMERAL_TOP, NUMERAL_H, color, 4.2, 'left') +
    kindGlyph(card, GLYPH_CX, GLYPH_CY, c, onDark)
  );
}

function indexB(card, c, onDark) {
  // 도장(낙관) 칸 안에 흰 숫자. 칸 크기는 모든 카드가 같다.
  const seal = rect(4, 5, 27, 31, { rx: 3, fill: onDark ? c.paper : c.red });
  return (
    seal +
    numeral(card.index, 17.5, 10.5, 21, onDark ? c.red : c.paper, 3.6, 'center', 19) +
    kindGlyph(card, GLYPH_CX + 1, GLYPH_CY, c, onDark)
  );
}

// ─── 결정적 PRNG (시안 B 붓 떨림) ───

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── 붓 획: 중심선(캣멀-롬) + 굵기 곡선 → 채운 다각형. filter 없이 붓 느낌을 낸다 ───

function catmull(pts, n) {
  if (pts.length === 2) {
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      return [pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t];
    });
  }
  const segs = pts.length - 1;
  const per = Math.max(2, Math.ceil(n / segs));
  const out = [];
  for (let i = 0; i < segs; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        [0, 1].map(
          (k) =>
            0.5 *
            (2 * p1[k] +
              (-p0[k] + p2[k]) * t +
              (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
              (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
        ),
      );
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * 붓 획 하나. start: 시작 굵기 비율(누름), end: 끝 굵기 비율(삐침), n: 표본 수(용량과 매끄러움의 교환).
 */
function brush(pts, width, { start = 0.45, end = 0.05, n = 12, fill, rng } = {}) {
  const c = catmull(pts, n);
  const left = [];
  const right = [];
  for (let i = 0; i < c.length; i++) {
    const t = i / (c.length - 1);
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const prof =
      t < 0.2 ? start + (1 - start) * (t / 0.2) : 1 - (1 - end) * ((t - 0.2) / 0.8) ** 1.6;
    const jitter = rng ? 1 + (rng() - 0.5) * 0.18 : 1;
    const w = (width * prof * jitter) / 2;
    left.push([c[i][0] + nx * w, c[i][1] + ny * w]);
    right.push([c[i][0] - nx * w, c[i][1] - ny * w]);
  }
  return poly([...left, ...right.reverse()], { fill });
}

// ─── 공통 틀 ───

function svgDoc(body) {
  const { w, h, r } = CARD;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><clipPath id="c"><rect width="${w}" height="${h}" rx="${r}"/></clipPath></defs>` +
    g({ 'clip-path': 'url(#c)' }, body) +
    `</svg>`
  );
}

// ═══════════════════════ 시안 A: 플랫 기하 (flat geometric) ═══════════════════════
// 평면 색 + 균일한 먹선(2.4) + 원·호·다각형. 광은 금색 안쪽 테두리, 12월 쌍피는 빨간 바탕.

const KEY = 2.4; // 먹선 굵기

function A_pine(c, { x, y, s = 1, trunk = true }) {
  const k = { stroke: c.ink, 'stroke-width': KEY, 'stroke-linejoin': 'round' };
  // 소나무: 휘어진 줄기 + 납작한 잎 덩어리 세 개(둥근 사다리꼴)
  const mound = (mx, my, w) =>
    path(
      `M${f(mx - w)} ${f(my)}C${f(mx - w)} ${f(my - 9 * s)} ${f(mx - w * 0.4)} ${f(my - 13 * s)} ${f(mx)} ${f(my - 13 * s)}C${f(mx + w * 0.4)} ${f(my - 13 * s)} ${f(mx + w)} ${f(my - 9 * s)} ${f(mx + w)} ${f(my)}Z`,
      { fill: c.green, ...k },
    );
  return (
    (trunk
      ? path(
          `M${f(x - 18 * s)} ${f(y + 70 * s)}C${f(x - 6 * s)} ${f(y + 40 * s)} ${f(x - 14 * s)} ${f(y + 22 * s)} ${f(x + 2 * s)} ${f(y + 2 * s)}`,
          stroke(c.ink, 6 * s),
        ) +
        path(
          `M${f(x - 8 * s)} ${f(y + 30 * s)}L${f(x + 16 * s)} ${f(y + 22 * s)}`,
          stroke(c.ink, 4 * s),
        )
      : '') +
    mound(x + 2 * s, y + 4 * s, 22 * s) +
    mound(x + 20 * s, y + 26 * s, 16 * s) +
    mound(x - 16 * s, y + 34 * s, 17 * s)
  );
}

function A_ribbon(c, { x, y, len = 92, angle = 0, color, text }) {
  // 매달린 띠: 위가 좁고 아래가 제비꼬리. text면 먹 글자 획 3개(홍단·청단)
  const w = 17;
  const body = poly(
    [
      [x - w / 2, y],
      [x + w / 2, y],
      [x + w / 2, y + len],
      [x, y + len - 8],
      [x - w / 2, y + len],
    ],
    { fill: color, stroke: c.ink, 'stroke-width': KEY },
  );
  const marks = text
    ? [0.22, 0.4, 0.58]
        .map((t) =>
          line(
            [
              [x - 4, y + len * t],
              [x + 4, y + len * t + 3],
            ],
            stroke(c.ink, 3.4),
          ),
        )
        .join('')
    : '';
  const tie = rect(x - w / 2 - 2, y - 5, w + 4, 7, { rx: 2, fill: c.ink });
  return g({ transform: angle ? rot(angle, x, y) : undefined }, body, marks, tie);
}

function A_mum(c, cx, cy, r, petals = 12) {
  // 국화: 둥근 꽃잎 고리 + 빨간 꽃심
  let out = '';
  for (let i = 0; i < petals; i++) {
    const a = (360 / petals) * i;
    out += ellipse(cx, cy - r * 0.62, r * 0.2, r * 0.42, {
      transform: rot(a, cx, cy),
      fill: c.gold,
      stroke: c.ink,
      'stroke-width': 1.8,
    });
  }
  return out + circle(cx, cy, r * 0.34, { fill: c.red, stroke: c.ink, 'stroke-width': 1.8 });
}

function A_leaf(c, x, y, angle, s = 1) {
  return path(
    `M${f(x)} ${f(y)}C${f(x + 6 * s)} ${f(y - 10 * s)} ${f(x + 18 * s)} ${f(y - 10 * s)} ${f(x + 24 * s)} ${f(y)}C${f(x + 18 * s)} ${f(y + 8 * s)} ${f(x + 6 * s)} ${f(y + 8 * s)} ${f(x)} ${f(y)}Z`,
    { fill: c.green, stroke: c.ink, 'stroke-width': 1.8, transform: rot(angle, x, y) },
  );
}

function A_mums(c, layout) {
  return layout
    .map(
      ([x, y, r, stemTo]) =>
        (stemTo ? line([[x, y], stemTo], stroke(c.ink, 3)) : '') + A_mum(c, x, y, r),
    )
    .join('');
}

function A_willow(c, xs, top = -4) {
  // 버들: 위에서 늘어진 초록 줄기 + 짧은 잎 획
  return xs
    .map(([x, len, bend]) => {
      const d = `M${f(x)} ${f(top)}C${f(x + bend)} ${f(top + len * 0.4)} ${f(x + bend)} ${f(top + len * 0.75)} ${f(x + bend * 0.4)} ${f(top + len)}`;
      let leaves = '';
      for (let t = 0.3; t < 1; t += 0.2) {
        const lx = x + bend * (t < 0.75 ? 0.9 : 0.5);
        const ly = top + len * t;
        leaves += line(
          [
            [lx, ly],
            [lx + 5, ly + 7],
          ],
          stroke(c.green, 3.2),
        );
      }
      return path(d, stroke(c.green, 3.4)) + leaves;
    })
    .join('');
}

function A_rain(c, pts) {
  return pts
    .map(([x, y]) =>
      line(
        [
          [x, y],
          [x - 5, y + 11],
        ],
        stroke(c.blue, 2.4),
      ),
    )
    .join('');
}

function A_gwangFrame(c) {
  return rect(3.5, 3.5, 93, 153, { rx: 5, fill: 'none', stroke: c.gold, 'stroke-width': 3.4 });
}

const A_ART = {
  // 1월 송학
  0: (c) =>
    circle(66, 48, 24, { fill: c.red, stroke: c.ink, 'stroke-width': KEY }) +
    A_pine(c, { x: 22, y: 128, s: 0.8, trunk: false }) +
    // 학: 몸통 물방울 + 먹 꼬리 + 목 + 머리(빨간 정수리) + 부리 + 다리
    path('M20 126C26 112 36 104 46 104L42 118Z', {
      fill: c.ink,
      stroke: c.ink,
      'stroke-width': KEY,
      'stroke-linejoin': 'round',
    }) +
    path('M34 110C40 96 58 90 72 96C72 108 58 116 42 116C38 116 35 114 34 110Z', {
      fill: c.paper,
      stroke: c.ink,
      'stroke-width': KEY,
    }) +
    path('M44 103C52 99 60 99 66 101', stroke(c.ink, 2)) +
    path('M66 97C74 88 70 76 76 68', stroke(c.ink, 5)) +
    circle(77, 66, 5, { fill: c.paper, stroke: c.ink, 'stroke-width': 2 }) +
    circle(77, 62.6, 2.4, { fill: c.red }) +
    poly(
      [
        [81, 64.5],
        [92, 69],
        [81, 68.5],
      ],
      { fill: c.ink },
    ) +
    line(
      [
        [52, 112],
        [48, 142],
      ],
      stroke(c.ink, 2.4),
    ) +
    line(
      [
        [58, 111],
        [60, 142],
      ],
      stroke(c.ink, 2.4),
    ) +
    A_gwangFrame(c),
  1: (c) =>
    A_pine(c, { x: 30, y: 104, s: 1 }) +
    A_ribbon(c, { x: 70, y: 30, len: 96, angle: -6, color: c.red, text: true }),
  2: (c) => A_pine(c, { x: 50, y: 80, s: 1.3 }),

  // 9월 국준
  32: (c) =>
    A_mums(c, [[72, 42, 20, [70, 70]]]) +
    // 술잔: 넓은 빨간 잔 + 굽 + 금색 꽃 문장
    path('M18 96H86C84 116 70 126 52 126C34 126 20 116 18 96Z', {
      fill: c.red,
      stroke: c.ink,
      'stroke-width': KEY,
    }) +
    ellipse(52, 96, 34, 6.5, { fill: c.red, stroke: c.ink, 'stroke-width': KEY }) +
    ellipse(52, 96, 28, 3.6, { fill: c.ink }) +
    path('M40 125L36 136H68L64 125', { fill: c.ink, stroke: c.ink, 'stroke-width': KEY }) +
    A_mum(c, 52, 111, 9, 8),
  33: (c) =>
    A_mums(c, [
      [30, 118, 17, [34, 160]],
      [60, 142, 13, [60, 162]],
    ]) +
    A_leaf(c, 8, 150, -30) +
    A_ribbon(c, { x: 70, y: 22, len: 92, angle: 5, color: c.blue, text: true }),
  34: (c) =>
    A_mums(c, [
      [66, 56, 22, [58, 162]],
      [34, 104, 18, [40, 162]],
      [76, 128, 14, [70, 162]],
    ]) +
    A_leaf(c, 42, 140, -20) +
    A_leaf(c, 6, 132, -10, 0.9),

  // 12월 비
  44: (c) =>
    A_willow(c, [
      [46, 70, 10],
      [88, 96, -8],
    ]) +
    A_rain(c, [
      [62, 30],
      [92, 44],
      [20, 76],
      [90, 122],
      [26, 140],
    ]) +
    // 우산: 빨간 반원 덮개 + 살 + 먹 손잡이
    path('M20 96C20 72 36 58 56 58C76 58 92 72 92 96Z', {
      fill: c.red,
      stroke: c.ink,
      'stroke-width': KEY,
    }) +
    path('M56 58C48 70 44 82 44 96M56 58C64 70 68 82 68 96M56 58V96', stroke(c.ink, 2)) +
    path('M56 96V132C56 138 48 138 48 132', stroke(c.ink, 4)) +
    circle(56, 56, 3, { fill: c.ink }) +
    A_gwangFrame(c),
  45: (c) =>
    A_willow(c, [
      [60, 64, 8],
      [86, 110, -10],
    ]) +
    // 제비: 먹색 몸 + 흰 배 + 빨간 목 + 긴 날개와 갈래 꼬리
    path('M24 118L50 96L86 72L62 102L78 104L56 108L40 132L42 112Z', {
      fill: c.ink,
      stroke: c.ink,
      'stroke-width': KEY,
    }) +
    path('M50 96C58 92 66 94 70 98C64 106 54 108 46 106Z', {
      fill: c.paper,
      stroke: c.ink,
      'stroke-width': 1.8,
    }) +
    circle(54, 96, 3, { fill: c.red }) +
    circle(47, 98, 1.6, { fill: c.paper }),
  46: (c) =>
    A_willow(c, [
      [42, 150, 12],
      [92, 90, -8],
    ]) +
    A_rain(c, [
      [60, 20],
      [84, 118],
      [22, 150],
    ]) +
    A_ribbon(c, { x: 64, y: 34, len: 94, angle: -4, color: c.red, text: false }),
  47: (c) =>
    rect(0, 0, 100, 160, { fill: c.red }) +
    // 12월 쌍피: 빨간 바탕 + 먹 구름 + 금색 번개
    path('M40 70C40 60 54 56 60 62C64 52 82 54 82 66C92 66 94 80 84 82H44C34 82 32 72 40 70Z', {
      fill: c.ink,
    }) +
    poly(
      [
        [66, 82],
        [52, 108],
        [64, 108],
        [48, 140],
        [78, 100],
        [66, 100],
        [76, 82],
      ],
      { fill: c.gold, stroke: c.ink, 'stroke-width': KEY },
    ) +
    path('M8 120C18 112 26 128 36 120', stroke(c.ink, 3.4)) +
    path('M70 146C80 138 88 154 98 146', stroke(c.ink, 3.4)),

  // 보너스 3피: 보라 바탕 + 큰 3 + 뺏기 갈고리
  50: (c) =>
    rect(0, 0, 100, 160, { fill: c.violet }) +
    numeral('3', 62, 30, 44, c.paper, 7) +
    // 뺏기: 오른쪽 상대 패에서 왼쪽으로 끌어오는 갈고리 화살표
    rect(66, 112, 18, 28, { rx: 2.5, fill: c.paper, stroke: c.ink, 'stroke-width': KEY }) +
    path('M72 110C70 96 44 96 36 112', stroke(c.gold, 5)) +
    poly(
      [
        [28, 106],
        [44, 110],
        [34, 121],
      ],
      { fill: c.gold },
    ),
};

function A_back(c) {
  // 빨간 바탕 + 청해파(겹친 호) 무늬 + 가운데 금 고리와 흰 꽃
  const pat =
    `<pattern id="w" width="20" height="10" patternUnits="userSpaceOnUse">` +
    [
      [10, 10],
      [0, 5],
      [20, 5],
    ]
      .map(([x, y]) =>
        [9, 6, 3].map((r) => circle(x, y, r, stroke(oklchToHex(BACK_TONES.A), 1.3))).join(''),
      )
      .join('') +
    `</pattern>`;
  return (
    `<defs>${pat}</defs>` +
    // 한지색 바깥 테(2.5): 초록 판 위에서 뒷면 윤곽이 보이게 한다(빨강·판 명도 대비만으로는 2.7:1)
    rect(0, 0, 100, 160, { fill: c.paper }) +
    rect(2.5, 2.5, 95, 155, { rx: 5, fill: c.red }) +
    rect(8, 8, 84, 144, { rx: 3, fill: 'url(#w)' }) +
    rect(8, 8, 84, 144, { rx: 3, fill: 'none', stroke: c.gold, 'stroke-width': 2.4 }) +
    circle(50, 80, 20, { fill: c.ink, stroke: c.gold, 'stroke-width': 3 }) +
    [0, 90, 180, 270]
      .map((a) => ellipse(50, 70, 5.5, 9, { fill: c.paper, transform: rot(a, 50, 80) }))
      .join('') +
    circle(50, 80, 4, { fill: c.gold })
  );
}

// ═══════════════════════ 시안 B: 먹·붓 미니멀 (ink brush minimal) ═══════════════════════
// 한지색 바탕 + 붓 획(채운 다각형) + 한 장에 강조색 하나. 모서리는 빨간 도장 칸에 흰 숫자.

function B_pineNeedles(c, rng, cx, cy, s, color) {
  // 솔잎 뭉치: 부채꼴로 퍼진 짧은 붓 획
  let out = '';
  for (let i = 0; i < 9; i++) {
    const a = ((-160 + i * 17.5) * Math.PI) / 180;
    const r = (11 + rng() * 5) * s;
    out += brush(
      [
        [cx, cy],
        [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
      ],
      3.4 * s,
      { start: 0.9, end: 0.1, n: 5, fill: color, rng },
    );
  }
  return out;
}

function B_pine(c, rng, { x, y, s = 1 }) {
  return (
    brush(
      [
        [x - 20 * s, y + 70 * s],
        [x - 8 * s, y + 42 * s],
        [x - 10 * s, y + 20 * s],
        [x + 4 * s, y],
      ],
      9 * s,
      { start: 0.9, end: 0.4, n: 14, fill: c.ink, rng },
    ) +
    brush(
      [
        [x - 8 * s, y + 30 * s],
        [x + 10 * s, y + 24 * s],
        [x + 22 * s, y + 26 * s],
      ],
      5 * s,
      { start: 0.8, end: 0.2, n: 8, fill: c.ink, rng },
    ) +
    B_pineNeedles(c, rng, x + 4 * s, y + 2 * s, s * 1.2, c.green) +
    B_pineNeedles(c, rng, x + 22 * s, y + 26 * s, s, c.green) +
    B_pineNeedles(c, rng, x - 12 * s, y + 38 * s, s, c.green)
  );
}

function B_ribbon(c, rng, { x, y, len, sway = 6, color, text }) {
  // 붓으로 그은 띠: 양옆이 살짝 흔들리는 긴 획 + 먹 글자 점 3개
  const body = brush(
    [
      [x, y],
      [x + sway, y + len * 0.35],
      [x - sway * 0.5, y + len * 0.7],
      [x + sway * 0.3, y + len],
    ],
    17,
    { start: 0.95, end: 0.55, n: 16, fill: color, rng },
  );
  const marks = text
    ? [0.25, 0.42, 0.59]
        .map((t) =>
          brush(
            [
              [x - 4 + sway * 0.5, y + len * t],
              [x + 4 + sway * 0.5, y + len * t + 2.5],
            ],
            3.6,
            { start: 1, end: 0.3, n: 4, fill: c.ink },
          ),
        )
        .join('')
    : '';
  return body + marks;
}

function B_mum(c, rng, cx, cy, r) {
  let out = '';
  for (let i = 0; i < 16; i++) {
    const a = ((i * 360) / 16 + rng() * 6) * (Math.PI / 180);
    out += brush(
      [
        [cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25],
        [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
      ],
      r * 0.26,
      { start: 0.5, end: 0.35, n: 5, fill: c.gold, rng },
    );
  }
  return out + circle(cx, cy, r * 0.26, { fill: c.ink });
}

function B_stem(c, rng, pts, w = 3.4) {
  return brush(pts, w, { start: 0.9, end: 0.3, n: 10, fill: c.ink, rng });
}

function B_leafDab(c, rng, x, y, angle, s = 1, color) {
  const a = (angle * Math.PI) / 180;
  return brush(
    [
      [x, y],
      [x + Math.cos(a) * 12 * s, y + Math.sin(a) * 12 * s - 3 * s],
      [x + Math.cos(a) * 22 * s, y + Math.sin(a) * 22 * s],
    ],
    9 * s,
    { start: 0.3, end: 0.05, n: 8, fill: color ?? c.ink, rng },
  );
}

function B_willow(c, rng, strands) {
  return strands
    .map(
      ([x, len, bend]) =>
        brush(
          [
            [x, -4],
            [x + bend, len * 0.45],
            [x + bend * 0.6, len],
          ],
          4,
          { start: 1, end: 0.05, n: 14, fill: c.ink, rng },
        ) +
        [0.35, 0.55, 0.75]
          .map((t) => B_leafDab(c, rng, x + bend * 0.85, len * t, 60, 0.45, c.green))
          .join(''),
    )
    .join('');
}

function B_rain(c, rng, pts) {
  return pts
    .map(([x, y]) =>
      brush(
        [
          [x, y],
          [x - 6, y + 16],
        ],
        2.4,
        { start: 1, end: 0.1, n: 4, fill: c.wash, rng },
      ),
    )
    .join('');
}

function B_gwangFrame(c) {
  return rect(4, 4, 92, 152, { rx: 4, fill: 'none', stroke: c.gold, 'stroke-width': 3 });
}

const B_ART = {
  0: (c, rng) =>
    circle(64, 52, 25, { fill: c.red }) +
    B_pine(c, rng, { x: 22, y: 118, s: 0.8 }) +
    // 학: 옅은 먹 몸 + 먹 꼬리 + 붓 목 + 빨간 정수리
    path('M34 110C42 96 62 92 74 100C68 112 50 118 34 110Z', { fill: c.wash }) +
    brush(
      [
        [74, 100],
        [58, 112],
        [36, 110],
      ],
      3,
      { start: 0.6, end: 0.2, n: 8, fill: c.ink, rng },
    ) +
    brush(
      [
        [40, 104],
        [30, 112],
        [22, 122],
      ],
      11,
      { start: 1, end: 0.1, n: 8, fill: c.ink, rng },
    ) +
    brush(
      [
        [70, 100],
        [74, 86],
        [70, 76],
        [76, 66],
      ],
      5,
      { start: 0.8, end: 0.7, n: 10, fill: c.ink, rng },
    ) +
    brush(
      [
        [76, 66],
        [90, 70],
      ],
      3,
      { start: 1, end: 0.1, n: 4, fill: c.ink },
    ) +
    circle(75, 63, 3.2, { fill: c.red }) +
    brush(
      [
        [52, 114],
        [50, 144],
      ],
      2.2,
      { start: 1, end: 0.6, n: 4, fill: c.ink },
    ) +
    brush(
      [
        [58, 113],
        [61, 144],
      ],
      2.2,
      { start: 1, end: 0.6, n: 4, fill: c.ink },
    ) +
    B_gwangFrame(c),
  1: (c, rng) =>
    B_pine(c, rng, { x: 30, y: 100, s: 1 }) +
    B_ribbon(c, rng, { x: 70, y: 28, len: 100, color: c.red, text: true }),
  2: (c, rng) => B_pine(c, rng, { x: 52, y: 78, s: 1.3 }),

  32: (c, rng) =>
    B_stem(c, rng, [
      [70, 62],
      [74, 80],
      [70, 94],
    ]) +
    B_mum(c, rng, 70, 44, 20) +
    // 술잔: 빨간 잔 + 금 테
    path('M16 98H88C86 118 70 128 52 128C34 128 18 118 16 98Z', { fill: c.red }) +
    path('M16 98H88', stroke(c.gold, 3.4)) +
    path('M40 127L36 138H68L64 127Z', { fill: c.ink }) +
    B_mum(c, rng, 52, 112, 8),
  33: (c, rng) =>
    B_stem(c, rng, [
      [30, 120],
      [34, 140],
      [32, 166],
    ]) +
    B_stem(c, rng, [
      [58, 140],
      [60, 166],
    ]) +
    B_mum(c, rng, 30, 118, 17) +
    B_mum(c, rng, 58, 140, 12) +
    B_leafDab(c, rng, 6, 150, -20, 1) +
    B_ribbon(c, rng, { x: 72, y: 20, len: 96, sway: -5, color: c.blue, text: true }),
  34: (c, rng) =>
    B_stem(c, rng, [
      [64, 60],
      [58, 110],
      [60, 166],
    ]) +
    B_stem(c, rng, [
      [34, 106],
      [40, 166],
    ]) +
    B_mum(c, rng, 64, 58, 22) +
    B_mum(c, rng, 34, 106, 17) +
    B_leafDab(c, rng, 60, 120, -30, 1.1) +
    B_leafDab(c, rng, 10, 136, -15, 0.9),

  44: (c, rng) =>
    B_willow(c, rng, [
      [44, 76, 8],
      [90, 100, -8],
    ]) +
    B_rain(c, rng, [
      [62, 28],
      [94, 40],
      [22, 76],
      [92, 122],
      [26, 138],
    ]) +
    // 우산: 빨간 덮개(붓 호) + 먹 살·손잡이
    path(
      'M20 96C20 72 36 58 56 58C76 58 92 72 92 96C84 92 76 92 68 96C62 92 50 92 44 96C36 92 28 92 20 96Z',
      {
        fill: c.red,
      },
    ) +
    brush(
      [
        [56, 60],
        [56, 110],
        [54, 132],
        [46, 132],
      ],
      4,
      { start: 1, end: 0.6, n: 12, fill: c.ink, rng },
    ) +
    B_gwangFrame(c),
  45: (c, rng) =>
    B_willow(c, rng, [
      [62, 64, 8],
      [88, 112, -10],
    ]) +
    // 제비: 먹 붓 두 획(날개) + 갈래 꼬리 + 빨간 목
    brush(
      [
        [46, 104],
        [66, 86],
        [88, 70],
      ],
      9,
      { start: 1, end: 0.02, n: 10, fill: c.ink, rng },
    ) +
    brush(
      [
        [46, 104],
        [60, 110],
        [80, 106],
      ],
      7,
      { start: 1, end: 0.02, n: 10, fill: c.ink, rng },
    ) +
    brush(
      [
        [46, 104],
        [34, 116],
        [22, 124],
      ],
      6,
      { start: 1, end: 0.02, n: 8, fill: c.ink, rng },
    ) +
    brush(
      [
        [44, 108],
        [36, 124],
        [32, 136],
      ],
      5,
      { start: 1, end: 0.02, n: 8, fill: c.ink, rng },
    ) +
    circle(50, 100, 3.6, { fill: c.red }),
  46: (c, rng) =>
    B_willow(c, rng, [
      [42, 150, 10],
      [92, 92, -8],
    ]) +
    B_rain(c, rng, [
      [58, 18],
      [86, 118],
      [22, 146],
    ]) +
    B_ribbon(c, rng, { x: 64, y: 32, len: 98, sway: 5, color: c.red, text: false }),
  47: (c, rng) =>
    rect(0, 0, 100, 160, { fill: c.red }) +
    // 붓 번개와 구름
    brush(
      [
        [44, 64],
        [64, 58],
        [86, 64],
      ],
      13,
      { start: 0.6, end: 0.3, n: 10, fill: c.ink, rng },
    ) +
    brush(
      [
        [30, 78],
        [58, 72],
        [92, 78],
      ],
      11,
      { start: 0.6, end: 0.1, n: 10, fill: c.ink, rng },
    ) +
    brush(
      [
        [70, 78],
        [52, 104],
        [68, 104],
        [46, 142],
      ],
      8,
      { start: 1, end: 0.02, n: 16, fill: c.ink, rng },
    ) +
    brush(
      [
        [80, 82],
        [70, 100],
        [80, 102],
        [66, 128],
      ],
      4,
      { start: 1, end: 0.02, n: 12, fill: c.gold, rng },
    ),
  50: (c, rng) =>
    rect(0, 0, 100, 160, { fill: c.ink }) +
    numeral('3', 62, 30, 44, c.paper, 7) +
    rect(66, 112, 18, 28, { rx: 2.5, fill: 'none', stroke: c.paper, 'stroke-width': 2.4 }) +
    brush(
      [
        [74, 110],
        [60, 98],
        [44, 100],
        [36, 112],
      ],
      6,
      { start: 1, end: 0.5, n: 12, fill: c.red, rng },
    ) +
    poly(
      [
        [27, 106],
        [44, 109],
        [34, 122],
      ],
      { fill: c.red },
    ),
};

function B_back(c) {
  const rng = mulberry32(99);
  // 금색 일원상(붓 한 획으로 거의 닫힌 원). 먹색은 검붉은 바탕과 대비가 낮아 금색을 쓴다
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = ((-70 + i * 32) * Math.PI) / 180;
    pts.push([50 + Math.cos(a) * 24, 80 + Math.sin(a) * 24]);
  }
  return (
    rect(0, 0, 100, 160, { fill: c.paper }) +
    rect(2.5, 2.5, 95, 155, { rx: 5, fill: oklchToHex(BACK_TONES.B) }) +
    rect(7, 7, 86, 146, { rx: 3, fill: 'none', stroke: c.paper, 'stroke-width': 1.6 }) +
    rect(11, 11, 78, 138, { rx: 2, fill: 'none', stroke: c.gold, 'stroke-width': 1.2 }) +
    brush(pts, 9, { start: 0.7, end: 0.05, n: 30, fill: c.gold, rng }) +
    rect(44, 74, 12, 12, { rx: 1.5, fill: c.red, stroke: c.gold, 'stroke-width': 1.2 })
  );
}

// ─── 표본 카드 목록 (카드 ID = 엔진 카탈로그, src/cards/map.json) ───

export const SAMPLE_CARDS = [
  { id: 0, label: '1월 광', index: '1', glyph: 'gwang' },
  { id: 1, label: '1월 홍단', index: '1', glyph: 'tti', ribbon: 'hong' },
  { id: 2, label: '1월 피', index: '1', glyph: 'pi' },
  { id: 32, label: '9월 국진', index: '9', glyph: 'gukjin' },
  { id: 33, label: '9월 청단', index: '9', glyph: 'tti', ribbon: 'cheong' },
  { id: 34, label: '9월 피', index: '9', glyph: 'pi' },
  { id: 44, label: '12월 비광', index: '12', glyph: 'bigwang' },
  { id: 45, label: '12월 열끗', index: '12', glyph: 'yeol' },
  { id: 46, label: '12월 비띠', index: '12', glyph: 'tti', ribbon: 'bi' },
  { id: 47, label: '12월 쌍피', index: '12', glyph: 'ssangpi', dark: true },
  { id: 50, label: '보너스 3피', index: '+3', glyph: 'bonus3', dark: true },
];

export const DRAFTS = {
  A: {
    name: '시안 A — 플랫 기하',
    art: A_ART,
    back: A_back,
    index: indexA,
    base: (c) => rect(0, 0, 100, 160, { fill: c.paper }),
  },
  B: {
    name: '시안 B — 먹·붓 미니멀',
    art: B_ART,
    back: B_back,
    index: indexB,
    base: (c) => rect(0, 0, 100, 160, { fill: c.paper }),
  },
};

/** 시안 하나의 카드 한 장(또는 'back')을 svgo 최적화 전 SVG 문자열로 만든다 */
export function renderCard(draftKey, id) {
  const draft = DRAFTS[draftKey];
  const c = hexPalette(PALETTES[draftKey]);
  if (id === 'back') return svgDoc(draft.back(c));
  const card = SAMPLE_CARDS.find((s) => s.id === id);
  const rng = mulberry32(1000 + id);
  return svgDoc(draft.base(c) + draft.art[id](c, rng) + draft.index(card, c, card.dark === true));
}

export function optimizeSvg(svg, name) {
  return optimize(svg, { ...svgoConfig, path: name }).data;
}

async function main() {
  let failed = false;
  for (const key of Object.keys(DRAFTS)) {
    const dir = join(OUT, key);
    await rm(dir, { recursive: true, force: true }); // README.md는 남긴다
    await mkdir(dir, { recursive: true });
    let total = 0;
    for (const id of [...SAMPLE_CARDS.map((s) => s.id), 'back']) {
      const data = optimizeSvg(renderCard(key, id), `${id}.svg`);
      const bytes = Buffer.byteLength(data);
      total += bytes;
      if (bytes > BUDGET_BYTES) failed = true;
      await writeFile(join(dir, `${id}.svg`), data);
      console.log(
        `${key} ${String(id).padStart(4)}.svg ${bytes.toString().padStart(6)} B${bytes > BUDGET_BYTES ? '  예산 초과' : ''}`,
      );
    }
    const n = SAMPLE_CARDS.length + 1;
    console.log(
      `${key} 합계 ${total} B (${n}장, 평균 ${Math.round(total / n)} B → 52장 추정 ${Math.round(((total / n) * 52) / 1024)} KiB)`,
    );
  }
  if (failed) {
    console.error('카드당 8 KB 예산 초과');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
