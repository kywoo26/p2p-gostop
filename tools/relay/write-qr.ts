// RP-03B: 공개 중계 기본 URL을 스캔할 수 있는 로컬 SVG로 쓴다. 초대 QR은 방 UI가 만든다.
import { writeFile } from 'node:fs/promises';
import { qrPath } from '../../packages/web/src/p2p/qr.ts';

const [url, output] = process.argv.slice(2);
if (url === undefined || output === undefined || !/^https:\/\/[a-z0-9.-]+\.ts\.net\/$/.test(url)) {
  throw new Error('사용: node tools/relay/write-qr.ts https://<node>.ts.net/ <output.svg>');
}
const { size, d } = qrPath(url);
await writeFile(
  output,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${d}" fill="black"/></svg>\n`,
  { mode: 0o600 },
);
console.log(`QR: ${output}`);
