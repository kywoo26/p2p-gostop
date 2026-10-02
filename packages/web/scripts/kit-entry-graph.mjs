// SK3 / NF-03·NF-09: Kit 3.0.0 split/hash 출력의 제한된 구조 정합 검사.
// 내부 모듈을 실행하지 않는다. 공개 Vite JSON graph만 읽고, 미지원 topology는 거절한다.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
/** @typedef {import('vite').Manifest} Manifest */

/** @param {string | Buffer} bytes */
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const START = '../../node_modules/@sveltejs/kit/src/runtime/client/entry.js';
const RUNTIME = '../../node_modules/@sveltejs/kit/src/runtime/client/client-entry.js';
const APP = '.svelte-kit/generated/build/client-optimized/app.js';
const ROOT = '.svelte-kit/generated/build/client-optimized/nodes/0.js';
const LAYOUT = 'src/routes/+layout.svelte';
// 앱 소스 template의 명시 검토 경계다. 생성 HTML/BUILD_ID digest를 고정하지 않는다.
const TEMPLATE_SHA = '033c8e09199734f966356a0cb6a8c28eff72a3f79dd734e3eabf62ceee699ddc';

/** @param {unknown} value @returns {string[]} */
function list(value) {
  assert(
    value === undefined || (Array.isArray(value) && value.every((s) => typeof s === 'string')),
  );
  const values = value ?? [];
  assert.equal(new Set(values).size, values.length, '중복 graph edge');
  return values;
}

/** @param {Manifest} graph @param {string} key */
function chunk(graph, key) {
  const value = graph[key];
  assert(value, '필수 graph 역할 누락');
  return value;
}

/** @param {Manifest} graph @param {boolean} client */
function validate(graph, client) {
  assert(graph && typeof graph === 'object' && !Array.isArray(graph), 'manifest 누락');
  for (const chunk of Object.values(graph)) {
    assert(chunk && typeof chunk === 'object' && typeof chunk.file === 'string');
    assert(
      /^[A-Za-z0-9_./-]+$/.test(chunk.file) &&
        !chunk.file.split('/').some((s) => s === '.' || s === '..'),
    );
    assert(!chunk.file.startsWith('/'), '절대 graph 경로');
    if (client) assert(chunk.file.startsWith('_app/immutable/'), '비 immutable client 출력');
    for (const edges of [chunk.imports, chunk.dynamicImports]) {
      for (const edge of list(edges)) assert(Object.hasOwn(graph, edge), '없는 graph edge');
    }
    for (const files of [chunk.css, chunk.assets]) {
      for (const file of list(files)) {
        assert(/^_app\/immutable\/[A-Za-z0-9_./-]+$/.test(file));
        assert(!file.split('/').some((s) => s === '.' || s === '..'));
      }
    }
  }
}

/** @param {Manifest} graph @param {string} key @param {Set<string>} [seen] */
function closure(graph, key, seen = new Set()) {
  if (seen.has(key)) return seen;
  assert(chunk(graph, key), '필수 역할 누락');
  seen.add(key);
  for (const edge of chunk(graph, key).imports ?? []) closure(graph, edge, seen);
  return seen;
}

/** @param {Manifest} graph @param {string} key @param {string} name */
function entry(graph, key, name) {
  assert.equal(chunk(graph, key)?.src, key, 'entry src');
  assert.equal(chunk(graph, key)?.name, name, 'entry name');
  assert.equal(chunk(graph, key)?.isEntry, true, 'entry 역할');
}

/** @param {Manifest} graph @param {string} root */
function rootStyles(graph, root) {
  const keys = closure(graph, root);
  // 현재 root CSS는 단일 정적 group이다. 동적 CSS/asset group의 일반 재현기는 만들지 않는다.
  assert.equal(list(chunk(graph, root).css).length, 1, 'root 단일 CSS');
  for (const key of keys) {
    if (key !== root) assert.equal(list(chunk(graph, key).css).length, 0, '분리된 root CSS group');
    const visited = new Set();
    /** @param {string} edge */
    const checkDynamic = (edge) => {
      if (visited.has(edge)) return;
      visited.add(edge);
      const dynamic = chunk(graph, edge);
      assert.equal(
        list(dynamic.css).length + list(dynamic.assets).length,
        0,
        '동적 CSS/asset 미지원',
      );
      for (const child of [...list(dynamic.imports), ...list(dynamic.dynamicImports)])
        checkDynamic(child);
    };
    for (const edge of list(chunk(graph, key).dynamicImports)) checkDynamic(edge);
  }
  return [...keys];
}

/** @param {Manifest} client @param {Manifest} server */
export function planEntry(client, server) {
  validate(client, true);
  validate(server, false);
  entry(client, START, 'entry/start');
  entry(client, APP, 'entry/app');
  entry(client, ROOT, 'nodes/0');
  entry(server, LAYOUT, 'entries/pages/_layout.svelte');
  assert.equal(chunk(client, RUNTIME)?.src, RUNTIME);
  assert.equal(chunk(client, RUNTIME)?.isDynamicEntry, true);
  assert.deepEqual(chunk(client, START).dynamicImports, [RUNTIME], 'start 첫 runtime edge');
  assert(chunk(client, APP).dynamicImports?.includes(ROOT), 'app→root lazy edge');
  for (const key of Object.keys(server))
    assert(
      !/^src\/routes\/\+layout\.(?:server\.)?[jt]s$/.test(key),
      'root universal/server 미지원',
    );

  const initial = new Set();
  for (const role of [START, RUNTIME, APP]) {
    for (const key of closure(client, role)) {
      assert.equal(list(chunk(client, key).css).length, 0, 'bootstrap CSS 미지원');
      assert(
        !list(chunk(client, key).assets).some((p) => /\.(woff2?|ttf|otf)$/.test(p)),
        'bootstrap font 미지원',
      );
      initial.add(chunk(client, key).file);
    }
  }
  const rootKeys = rootStyles(client, ROOT);
  rootStyles(server, LAYOUT);
  // node0 정적 CSS group을 원래 +layout 역할로 대응한다. SSR group 존재가 교집합의 근거다.
  assert.deepEqual(
    chunk(client, ROOT).assets,
    chunk(server, LAYOUT).assets,
    'root client/SSR assets',
  );
  const css = list(chunk(client, ROOT).css)[0];
  const serverCss = list(chunk(server, LAYOUT).css)[0];
  assert(css && serverCss, 'root CSS 누락');
  assert(/^_app\/immutable\/assets\/0\.[\w-]+\.css$/.test(css));
  assert.equal(serverCss, css.replace('/0.', '/_layout.'), 'root client/SSR CSS 대응');
  for (const key of rootKeys) initial.add(chunk(client, key).file);
  const imports = [chunk(client, START).file, chunk(client, APP).file];
  assert.equal(new Set(imports).size, 2, 'bootstrap 역할 충돌');
  return { preloads: [...initial], styles: [css], imports, serverCss };
}

/** @param {string} global @param {string} version @param {string[]} imports @param {string} prefix */
function bootstrap(global, version, imports, prefix) {
  return `\n\t\t\t<script>\n\t\t\t\t{\n\t\t\t\t\t${global} = {\n\t\t\t\t\t\tbase: new URL('.', location).pathname.slice(0, -1),\n\t\t\t\t\t\tversion: ${JSON.stringify(version)}\n\t\t\t\t\t};\n\n\t\t\t\t\tconst element = document.currentScript.parentElement;\n\n\t\t\t\t\timport("${prefix}${imports[0]}").then(async (kit) => {\n\t\t\t\t\t\tkit.init(${global});\n\t\t\t\t\t\tconst app = await import("${prefix}${imports[1]}");\n\t\t\t\t\t\tkit.start(app, element);\n\t\t\t\t\t});\n\t\t\t\t}\n\t\t\t</script>\n\t\t`;
}

/** @param {string} input @param {string} template @param {ReturnType<typeof planEntry>} plan @param {string} version */
export function relocateHtml(input, template, plan, version) {
  assert.equal(digest(template), TEMPLATE_SHA, 'app template 변경은 별도 구조 검토 필요');
  assert(/^(?:[0-9a-f]{7}|dev)$/.test(version), 'BUILD_ID 형식');
  const globals = [...input.matchAll(/\b(__sveltekit_[a-z0-9]+) = \{/g)];
  assert.equal(globals.length, 1, '유일 bootstrap global');
  const global = globals[0]?.[1];
  assert(global);
  /** @param {string} prefix */
  const render = (prefix) => {
    const head =
      plan.preloads.map((p) => `<link href="${prefix}${p}" rel="modulepreload">`).join('\n\t\t') +
      '\n\t\t\n\t\t' +
      plan.styles.map((p) => `<link href="${prefix}${p}" rel="stylesheet">`).join('\n\t\t');
    return template
      .replace('%sveltekit.head%', head)
      .replace('%sveltekit.body%', bootstrap(global, version, plan.imports, prefix));
  };
  // template 전체가 고정되므로 주석/사용자 문자열/nonce 공백/추가 실행문까지 미지 문법은 실패한다.
  assert.equal(input, render('/'), 'Kit 생성 HTML 문법/graph 참조집합 불일치');
  const result = render('./');
  const count = plan.preloads.length + plan.styles.length + plan.imports.length;
  assert.equal(Buffer.byteLength(result) - Buffer.byteLength(input), count);
  return { result, count, inputSha: digest(input), outputSha: digest(result) };
}
