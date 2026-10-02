// NF-07: Node만으로 실제 Vite 출력·npm lockfile과 커밋된 웹 고지를 대조한다.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const bundledPath = fileURLToPath(new URL('../dist/oss/bundled-packages.json', import.meta.url));
const lockPath = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));
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
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
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
    const locked = lock.packages[`node_modules/${item.name}`];
    assert.ok(locked, `npm lockfile 누락: ${item.name}`);
    assert.equal(item.version, locked.version, `npm 버전 불일치: ${item.name}`);
    assert.equal(item.license, locked.license, `npm 라이선스 불일치: ${item.name}`);
    assert.ok(text.includes(`${item.name} ${item.version} — ${item.license}`));
    assert.ok(text.includes(`### ${item.name} ${item.version}`));
    const dir = new URL(`../../../node_modules/${item.name}/`, import.meta.url);
    const license = (await readdir(dir)).find((name) => /^LICEN[SC]E(?:\..*)?$/i.test(name));
    assert.ok(license, `설치 패키지 라이선스 원문 누락: ${item.name}`);
    const original = await readFile(new URL(license, dir), 'utf8');
    assert.ok(text.includes(original), `원문 바이트 불일치: ${item.name}`);
  }
  assert.equal(await readFile(new URL('../dist/oss/NOTICE.txt', import.meta.url), 'utf8'), text);
  assert.ok(text.includes('Copyright (c) Luke Edwards'));
});
