// NF-03/07 · plan 1.8: 기존 Playwright로 입력 이미지를 로컬 WebP로 최적화한다.
// Docker 안에서만 실행. 네트워크 다운로드는 하지 않으며 원본을 덮어쓰지 않는다.
/* global createImageBitmap, document */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const [input, output, sizeArg = '512', tone = 'none', limitArg = '100'] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) {
  throw new Error('입력 출력 크기 [none|felt|wood] [최대KiB]; 서로 다른 경로 필요');
}
const size = Number(sizeArg);
if (!Number.isInteger(size) || size < 32 || size > 2048) throw new Error('크기 32~2048');
if (!['none', 'felt', 'wood'].includes(tone)) throw new Error('알 수 없는 색상 모드');
const source = await readFile(input);
if (source.length > 32 * 1024 * 1024) throw new Error('입력 파일 32MiB 초과');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ({ data, size, tone }) => {
      const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([raw]));
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      if (tone === 'felt' || tone === 'wood') {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const luma = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
          const base = tone === 'felt' ? [23, 65, 58] : [57, 34, 23];
          const light = (luma - 128) * (tone === 'felt' ? 0.3 : 0.22);
          for (let c = 0; c < 3; c++) pixels.data[i + c] = base[c] + light;
        }
        ctx.putImageData(pixels, 0, 0);
      }
      const url = canvas.toDataURL('image/webp', 0.82);
      if (!url.startsWith('data:image/webp;')) throw new Error('WebP 인코더 없음');
      return { width: canvas.width, height: canvas.height, data: url.split(',')[1] };
    },
    { data: source.toString('base64'), size, tone },
  );
  const bytes = Buffer.from(result.data, 'base64');
  if (bytes.length > Number(limitArg) * 1024) throw new Error(`자산 예산 초과: ${bytes.length}`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  console.log(
    JSON.stringify(
      {
        input,
        output,
        width: result.width,
        height: result.height,
        bytes: bytes.length,
        sourceSha256: createHash('sha256').update(source).digest('hex'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
