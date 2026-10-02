// SK3: 실제 build graph의 양성 대조 + 유한 변조 반례. vite build 뒤 실행한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { digest, planEntry, relocateHtml } from './kit-entry-graph.mjs';
import { writeRelocated } from './relocatable-static.mjs';

const evidence = new URL('../.svelte-kit/relocation/', import.meta.url);
const read = (name) => readFileSync(new URL(name, evidence), 'utf8');
const graphs = { client: read('client.json'), server: read('server.json') };
const client = JSON.parse(graphs.client);
const server = JSON.parse(graphs.server);
const original = read('index.original.html');
const template = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
const record = JSON.parse(read('relocation.json'));
const version = record.inputs.version;
const plan = planEntry(client, server);
const root = '.svelte-kit/generated/build/client-optimized/nodes/0.js';
const start = '../../node_modules/@sveltejs/kit/src/runtime/client/entry.js';

test('실제 graph 초기 집합과 adapter 결과/원본 digest 일치; lazy/worker 구별', () => {
  const checked = relocateHtml(original, template, plan, version);
  assert.equal(
    checked.result,
    readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'),
  );
  assert.equal(record.count, plan.preloads.length + plan.styles.length + 2);
  assert.equal(record.inputSha, digest(original));
  assert.equal(record.outputSha, digest(checked.result));
  const lazy = client['.svelte-kit/generated/build/client-optimized/nodes/2.js'].file;
  assert(!plan.preloads.includes(lazy));
  assert(!plan.preloads.some((p) => p.includes('/workers/')));
});

test('같은 개수 lazy 치환·절대/상대 혼합·미지 bootstrap·CSP/SRI 실패', () => {
  const target = '/' + plan.preloads[0];
  const lazy = '/' + client['.svelte-kit/generated/build/client-optimized/nodes/2.js'].file;
  const link = `<link href="${target}" rel="modulepreload">`;
  const invalid = [
    original.replace(target, lazy),
    original.replace(target, '.' + target),
    original.replace(target, target + '?x=1'),
    original.replace(target, target + '#x'),
    original.replace(target, 'https://example.invalid' + target),
    original.replace(target, '//example.invalid' + target),
    original.replace(link, link + link),
    original.replace('<script>', '<script>throw new Error();'),
    original.replace('<script>', '<script nonce = "example">'),
    original.replace('<script>', '<script NONCE=example>'),
    original.replace('rel="modulepreload"', 'rel="modulepreload" integrity = "sha256-example"'),
    original.replace(
      '</head>',
      '<meta http-equiv="Content-Security-Policy" content="script-src none"></head>',
    ),
    original.replace('</head>', '<base href="/elsewhere/"></head>'),
    original.replace(link, '<!--' + link + '-->'),
  ];
  for (const input of invalid) assert.throws(() => relocateHtml(input, template, plan, version));
  assert.throws(() => relocateHtml(original, template + '\n', plan, version));
  assert.throws(() => relocateHtml(original, template, plan, 'invalid version'));
});

test('누락 graph/edge·runtime 순서·root SSR 교집합·동적 CSS 미지원 실패', () => {
  assert.throws(() => planEntry(undefined, server));
  assert.throws(() => planEntry(client, {}));
  const cases = [
    (c) => {
      delete c[root];
    },
    (c) => {
      c[start].imports.push('missing');
    },
    (c) => {
      c[start].imports.push(c[start].imports[0]);
    },
    (c) => {
      c[start].dynamicImports.unshift(root);
    },
    (c) => {
      c[root].css[0] += '?x=1';
    },
    (c) => {
      c['src/game/ai-core.ts'].css = ['_app/immutable/assets/dynamic.css'];
    },
    (c) => {
      c[root].file = '../escape.js';
    },
  ];
  for (const change of cases) {
    const copy = structuredClone(client);
    change(copy);
    assert.throws(() => planEntry(copy, server));
  }
  const otherServer = structuredClone(server);
  otherServer['src/routes/+layout.svelte'].css[0] = '_app/immutable/assets/_layout.other.css';
  assert.throws(() => planEntry(client, otherServer));
});

test('정상 BUILD_ID/출력 hash 변경은 생성 HTML digest의 코드 수정 없이 통과', () => {
  let c = graphs.client,
    s = graphs.server,
    html = original;
  const replacements = new Map();
  for (const chunk of [...Object.values(client), ...Object.values(server)]) {
    for (const file of [chunk.file, ...(chunk.css ?? [])]) {
      const changed = file.replace(/\.([\w-]+)\.(js|css)$/, '.$1Z.$2');
      if (changed !== file) replacements.set(file, changed);
    }
  }
  for (const [from, to] of replacements) {
    c = c.replaceAll(from, to);
    s = s.replaceAll(from, to);
    html = html.replaceAll(from, to);
  }
  const nextVersion = version === '1234567' ? '7654321' : '1234567';
  html = html.replace(`version: "${version}"`, `version: "${nextVersion}"`);
  const nextPlan = planEntry(JSON.parse(c), JSON.parse(s));
  const next = relocateHtml(html, template, nextPlan, nextVersion);
  assert.notEqual(next.inputSha, record.inputSha);
  assert.equal(next.count, record.count);
  assert.throws(() => relocateHtml(original, template, nextPlan, version), '다른 build graph');
});

test('원본/graph/결과/증거가 일치하는 재실행만 no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p2p-kit-entry-'));
  try {
    const htmlPath = join(dir, 'index.html');
    writeFileSync(htmlPath, original);
    const first = writeRelocated(htmlPath, dir, template, plan, version, graphs);
    assert.equal(first.repeated, false);
    const second = writeRelocated(htmlPath, dir, template, plan, version, graphs);
    assert.equal(second.repeated, true);
    assert.equal(first.outputSha, second.outputSha);
    assert.throws(() =>
      writeRelocated(htmlPath, dir, template, plan, version, {
        ...graphs,
        client: graphs.client + ' ',
      }),
    );
    writeFileSync(htmlPath, original);
    assert.throws(() => writeRelocated(htmlPath, dir, template, plan, version, graphs));
    writeFileSync(htmlPath, relocateHtml(original, template, plan, version).result);
    const meta = join(dir, 'relocation.json');
    const changed = JSON.parse(readFileSync(meta, 'utf8'));
    changed.count++;
    writeFileSync(meta, JSON.stringify(changed));
    assert.throws(() => writeRelocated(htmlPath, dir, template, plan, version, graphs));
    rmSync(meta);
    assert.throws(() => writeRelocated(htmlPath, dir, template, plan, version, graphs));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
