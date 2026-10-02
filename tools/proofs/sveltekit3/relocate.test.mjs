import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { artifactRoot, digest, fixture, verifyFixtures } from './common.mjs';
import { relocate } from './relocate.mjs';

const { html: original } = JSON.parse(
  await readFile(resolve(artifactRoot, 'fixtures/split-original.fixture.json'), 'utf8'),
);
await test('고정 HTML digest/count, 정확 변환과 멱등성', async () => {
  await verifyFixtures();
  assert.equal(digest(original), fixture.relocation.originalSha256);
  const out = relocate(original, fixture.relocation);
  assert.deepEqual(out.counts, { preloads: 11, styles: 1, imports: 2 });
  assert.equal(digest(out.html), fixture.relocation.resultSha256);
  assert.equal(out.html.length - original.length, 14);
  assert.equal(relocate(out.html, fixture.relocation).html, out.html);
});
await test('유한 fixture 밖 입력 fail closed (원형 4개 및 추가 경계)', () => {
  const bad = [
    original.replace('rel="modulepreload"', 'rel="x"'),
    original.replace('kit.start(app, element);', 'kit.changed();'),
    original.replace('</head>', '<script>"/_app/user-string"</script></head>'),
    original.replace('<script>', '<script nonce="x">'),
    original.replace('rel="stylesheet"', 'rel="stylesheet" integrity="x"'),
    original.replace('</head>', '<meta http-equiv="Content-Security-Policy" content="x"></head>'),
    original.replace('start.D7sZih-A.js', 'start.changed.js'),
    original.replace('lang="ko"', 'lang="en"'),
    original.replace('href="/_app/', 'href="./_app/'),
    original.replace('href="/_app/', 'href="https://invalid.example/_app/'),
    '',
  ];
  for (const input of bad) assert.throws(() => relocate(input, fixture.relocation));
});

await test('명시 digest/count 입력 누락·오류 거절', () => {
  assert.throws(() => relocate(original));
  assert.throws(() =>
    relocate(original, { ...fixture.relocation, originalSha256: '0'.repeat(64) }),
  );
  assert.throws(() =>
    relocate(original, { ...fixture.relocation, counts: { preloads: 12, styles: 1, imports: 2 } }),
  );
  assert.throws(() => relocate(original, { ...fixture.relocation, resultSha256: '0'.repeat(64) }));
});
await test('입력 digest를 알고 있어도 CSP/SRI/nonce 변환은 금지', () => {
  for (const attribute of ['nonce="x"', 'integrity="x"', 'content-security-policy="x"']) {
    const html = original.replace('<script>', '<script ' + attribute + '>');
    assert.throws(
      () => relocate(html, { ...fixture.relocation, originalSha256: digest(html) }),
      /CSP\/SRI/,
    );
  }
});
