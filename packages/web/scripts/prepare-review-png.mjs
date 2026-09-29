// 문서 PNG 전용: 원 크기에서 적응형 256색 팔레트로 최적화. 앱 자산/픽셀 기준샷에는 적용하지 않는다.
/* global document, Image */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';
const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) throw new Error('input.png output.png 필요 (별도 파일)');
const source = await readFile(input);
const browser = await chromium.launch();
let raster;
try {
  const page = await browser.newPage();
  raster = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let binary = '';
    for (let i = 0; i < rgba.length; i += 8192)
      binary += String.fromCharCode(...rgba.subarray(i, i + 8192));
    return { data: btoa(binary), width: canvas.width, height: canvas.height };
  }, source.toString('base64'));
} finally {
  await browser.close();
}
const rgba = Buffer.from(raster.data, 'base64');
const histogram = new Map();
const keyAt = (i) => ((rgba[i] >> 2) << 12) | ((rgba[i + 1] >> 2) << 6) | (rgba[i + 2] >> 2);
for (let i = 0; i < rgba.length; i += 4) {
  if (rgba[i + 3] !== 255) throw new Error('불투명 스크린샷만 지원');
  const key = keyAt(i);
  const bin = histogram.get(key) ?? { key, n: 0, sum: [0, 0, 0] };
  bin.n++;
  for (let c = 0; c < 3; c++) bin.sum[c] += rgba[i + c];
  histogram.set(key, bin);
}
const points = [...histogram.values()].map((b) => ({ ...b, rgb: b.sum.map((v) => v / b.n) }));
function box(items) {
  const weight = items.reduce((n, b) => n + b.n, 0);
  const ranges = [0, 1, 2].map(
    (c) => Math.max(...items.map((b) => b.rgb[c])) - Math.min(...items.map((b) => b.rgb[c])),
  );
  const axis = ranges.indexOf(Math.max(...ranges));
  return { items, weight, axis, priority: items.length > 1 ? ranges[axis] * Math.sqrt(weight) : 0 };
}
const boxes = [box(points)];
while (boxes.length < 256) {
  boxes.sort((a, b) => b.priority - a.priority);
  const selected = boxes.shift();
  if (!selected.priority) {
    boxes.unshift(selected);
    break;
  }
  selected.items.sort((a, b) => a.rgb[selected.axis] - b.rgb[selected.axis]);
  let sum = 0,
    cut = 1;
  for (; cut < selected.items.length - 1; cut++) {
    sum += selected.items[cut - 1].n;
    if (sum >= selected.weight / 2) break;
  }
  boxes.push(box(selected.items.slice(0, cut)), box(selected.items.slice(cut)));
}
const palette = boxes.map((b) =>
  [0, 1, 2].map((c) => Math.round(b.items.reduce((n, p) => n + p.sum[c], 0) / b.weight)),
);
const lookup = new Map(
  points.map((p) => {
    let best = 0,
      distance = Infinity;
    palette.forEach((color, index) => {
      const d = color.reduce((n, v, c) => n + [0.3, 0.59, 0.11][c] * (v - p.rgb[c]) ** 2, 0);
      if (d < distance) {
        best = index;
        distance = d;
      }
    });
    return [p.key, best];
  }),
);
const { width, height } = raster;
const scanlines = Buffer.alloc((width + 1) * height);
for (let y = 0; y < height; y++) {
  scanlines[y * (width + 1)] = 0;
  for (let x = 0; x < width; x++)
    scanlines[y * (width + 1) + x + 1] = lookup.get(keyAt((y * width + x) * 4));
}
function chunk(type, data) {
  const label = Buffer.from(type);
  const payload = Buffer.concat([label, data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4),
    tail = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, payload, tail]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 3;
const bytes = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('PLTE', Buffer.from(palette.flat())),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
if (bytes.length > 300000) throw new Error(`PNG 예산 초과: ${bytes.length}`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes);
console.log(JSON.stringify({ output, bytes: bytes.length, colors: palette.length, width, height }));
