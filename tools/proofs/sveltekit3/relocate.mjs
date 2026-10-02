import assert from 'node:assert/strict';
import { digest } from './common.mjs';

// 기존 relocate.mjs의 유한 문법을 보존. 전체 문서 digest까지 잠가 미지 입력을 거절한다.
export function relocate(html, expected) {
  assert.ok(
    expected &&
      /^[a-f0-9]{64}$/.test(expected.originalSha256) &&
      /^[a-f0-9]{64}$/.test(expected.resultSha256),
    'explicit source/result SHA-256 required',
  );
  assert.ok(
    expected.counts &&
      ['preloads', 'styles', 'imports'].every(
        (key) => Number.isSafeInteger(expected.counts[key]) && expected.counts[key] >= 0,
      ),
    'explicit reference counts required',
  );
  assert.ok(
    [expected.originalSha256, expected.resultSha256].includes(digest(html)),
    'source HTML digest drift',
  );
  if (/integrity=|content-security-policy|nonce=/i.test(html))
    throw Error('CSP/SRI requires separate reviewed generation');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (
    scripts.length !== 1 ||
    !scripts[0][1].includes('kit.start(app, element);') ||
    !scripts[0][1].includes("base: new URL('.', location).pathname.slice(0, -1)")
  )
    throw Error('unknown Kit bootstrap');
  const seen = { preloads: 0, styles: 0, imports: 0 };
  let output = html.replace(
    /<link href="(\.?\/_app\/immutable\/[A-Za-z0-9_./-]+)" rel="(modulepreload|stylesheet)">/g,
    (_, url, rel) => {
      seen[rel === 'stylesheet' ? 'styles' : 'preloads']++;
      return `<link href="${url.startsWith('.') ? url : '.' + url}" rel="${rel}">`;
    },
  );
  const raw = scripts[0][0];
  const patched = raw.replace(
    /import\("(\.?\/_app\/immutable\/entry\/(?:start|app)\.[A-Za-z0-9_-]+\.js)"\)/g,
    (_, url) => {
      seen.imports++;
      return `import("${url.startsWith('.') ? url : '.' + url}")`;
    },
  );
  output = output.replace(raw, patched);
  assert.deepEqual(seen, expected.counts, 'generated reference count drift');
  if (/(?<!\.)\/_app\//.test(output)) throw Error('unrecognised absolute app reference');
  assert.equal(digest(output), expected.resultSha256, 'result HTML digest drift');
  return { html: output, counts: seen };
}
