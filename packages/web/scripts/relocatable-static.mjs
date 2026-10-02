// SK3 / NF-03·NF-09: 공식 adapter-static 후 index 한 파일만 상대화한다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  lstatSync,
  renameSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import adapter from '@sveltejs/adapter-static';
import { digest, planEntry, relocateHtml } from './kit-entry-graph.mjs';

const require = createRequire(import.meta.url);
/** @param {string} path */
const read = (path) => {
  assert(lstatSync(path).isFile(), '일반 파일만 허용');
  return readFileSync(path, 'utf8');
};

// 같은 graph/원본/증거와 정확한 결과만 두 번째 호출의 no-op으로 인정한다.
/** @param {string} htmlPath @param {string} evidenceDir @param {string} template
 * @param {ReturnType<typeof planEntry>} plan @param {string} version
 * @param {{ client: string, server: string }} graphs */
export function writeRelocated(htmlPath, evidenceDir, template, plan, version, graphs) {
  const recordPath = join(evidenceDir, 'relocation.json');
  const originalPath = join(evidenceDir, 'index.original.html');
  const current = read(htmlPath);
  const inputs = {
    templateSha: digest(template),
    clientSha: digest(graphs.client),
    serverSha: digest(graphs.server),
    version,
    plan,
  };
  let prior;
  try {
    prior = JSON.parse(read(recordPath));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  if (prior) {
    assert.deepEqual(prior.inputs, inputs, '다른 빌드/graph 증거');
    const checked = relocateHtml(read(originalPath), template, plan, version);
    assert.equal(prior.inputSha, checked.inputSha);
    assert.equal(prior.outputSha, checked.outputSha);
    assert.equal(prior.count, checked.count);
    assert.equal(current, checked.result, '부분 변환/결과 변조');
    return { ...prior, repeated: true };
  }
  const { result, ...checked } = relocateHtml(current, template, plan, version);
  writeFileSync(originalPath, current, { flag: 'wx' });
  // 단일 build lane의 변경 감지다. 악의적 동시 writer 전체 방어/서명 인증이 아니다.
  assert.equal(read(htmlPath), current, '승인 뒤 HTML 변경');
  const temporary = `${htmlPath}.relocating`;
  writeFileSync(temporary, result, { flag: 'wx' });
  renameSync(temporary, htmlPath);
  const record = { inputs, ...checked };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return { ...record, repeated: false };
}

/** @returns {import('@sveltejs/kit').Adapter} */
export default function relocatableStatic() {
  const official = adapter({ pages: 'dist', assets: 'dist', precompress: false, strict: true });
  return {
    name: 'p2p-relocatable-static',
    async adapt(builder) {
      for (const [name, version] of [
        ['@sveltejs/kit', '3.0.0'],
        ['@sveltejs/adapter-static', '4.0.0'],
      ]) {
        assert.equal(
          JSON.parse(read(require.resolve(`${name}/package.json`))).version,
          version,
          '지원 핀',
        );
        const lock = JSON.parse(read(resolve('../../package-lock.json')));
        assert.equal(lock.packages[`node_modules/${name}`].version, version, 'lock 핀');
      }
      const c = builder.config;
      assert.deepEqual(c.router, { type: 'hash', resolution: 'client' });
      assert.equal(c.output.bundleStrategy, 'split');
      assert.equal(c.output.linkHeaderPreload, false);
      assert.equal(c.appDir, '_app');
      assert.equal(c.paths.base, '');
      assert.equal(c.paths.assets, '');
      assert.equal(c.paths.relative, true);
      assert.equal(c.inlineStyleThreshold, 0);
      assert.equal(c.serviceWorker.register, false);
      assert.equal(c.embedded, false);
      assert.equal(c.experimental.remoteFunctions, false);
      assert.equal(c.experimental.forkPreloads, false);
      assert.equal(c.compilerOptions.experimental?.async ?? false, false);
      assert(
        Object.values(c.csp.directives).every((v) => v === undefined || v === false),
        'CSP directives 미지원',
      );
      assert(
        Object.values(c.csp.reportOnly).every((v) => v === undefined || v === false),
        'CSP report-only 미지원',
      );
      assert.equal(builder.prerendered.pages.size, 1);
      assert.equal(builder.prerendered.pages.get('/')?.file, 'index.html');
      const clientDir = builder.getClientDirectory();
      const serverDir = builder.getServerDirectory();
      const clientPath = join(clientDir, '.vite/manifest.json');
      const serverPath = join(serverDir, '.vite/manifest.json');
      const graphs = { client: read(clientPath), server: read(serverPath) };
      const plan = planEntry(JSON.parse(graphs.client), JSON.parse(graphs.server));
      assert(plan.styles[0]);
      assert.equal(
        read(join(clientDir, plan.styles[0])),
        read(join(serverDir, plan.serverCss)),
        'client/SSR root CSS 바이트',
      );
      for (const file of new Set([...plan.preloads, ...plan.styles, ...plan.imports]))
        read(join(clientDir, file));
      const template = read('src/app.html');
      const evidence = resolve('.svelte-kit/relocation');
      rmSync(evidence, { recursive: true, force: true });
      mkdirSync(evidence, { recursive: true });
      writeFileSync(join(evidence, 'client.json'), graphs.client, { flag: 'wx' });
      writeFileSync(join(evidence, 'server.json'), graphs.server, { flag: 'wx' });
      await official.adapt(builder);
      assert.equal(read(clientPath), graphs.client, 'adapter 중 client graph 변경');
      assert.equal(read(serverPath), graphs.server, 'adapter 중 SSR graph 변경');
      const result = writeRelocated(
        'dist/index.html',
        evidence,
        template,
        plan,
        c.version.name,
        graphs,
      );
      builder.log(`Kit 초기 경로 ${result.count}개 상대화 (graph 독립 도출, +${result.count} B)`);
      // adapter가 public을 복사한 뒤에만 평가용 이미지를 제거한다. 고지 원문은 항상 남긴다.
      if (process.env['PRO_ASSET_REVIEW'] !== '1') {
        for (const name of readdirSync('dist/pro')) {
          if (name !== 'NOTICE.md')
            rmSync(join('dist/pro', name), { recursive: true, force: true });
        }
      }
    },
  };
}
