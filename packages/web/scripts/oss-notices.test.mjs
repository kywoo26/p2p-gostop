// NF-07: 실제 Vite 출력 모듈과 배포 고지의 웹 패키지를 맞춰 검증한다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const bundledPath = fileURLToPath(new URL('../dist/oss/bundled-packages.json', import.meta.url));
const noticesPath = fileURLToPath(new URL('../src/oss-notices.json', import.meta.url));
const noticeTextPath = fileURLToPath(new URL('../public/oss/NOTICE.txt', import.meta.url));

function missingPackages(bundled, noticed) {
  const names = new Set(noticed.map((item) => item.name));
  return bundled.filter((name) => !names.has(name));
}

test('실제 번들 패키지를 하나 빼면 누락을 검출한다', () => {
  assert.deepEqual(missingPackages(['clsx', 'svelte'], [{ name: 'svelte' }]), ['clsx']);
});

test('실제 배포 JS 모듈의 직·간접 npm 패키지가 모두 원문 고지에 있다', async () => {
  const bundled = JSON.parse(await readFile(bundledPath, 'utf8'));
  const notices = JSON.parse(await readFile(noticesPath, 'utf8'));
  const text = await readFile(noticeTextPath, 'utf8');
  assert.ok(bundled.includes('clsx'), '현재 Svelte 런타임의 clsx가 번들 분석에서 보여야 한다');
  assert.deepEqual(missingPackages(bundled, notices.web), []);
  assert.deepEqual(
    notices.web.map((item) => item.name).sort(),
    bundled,
    '고지 목록은 배포 JS에 실제 포함된 패키지와 일치해야 한다',
  );
  for (const item of notices.web) {
    assert.ok(text.includes(`### ${item.name} ${item.version}`));
  }
  assert.ok(text.includes('Copyright (c) Luke Edwards'));
});
