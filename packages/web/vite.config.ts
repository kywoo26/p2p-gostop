import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import relocatableStatic from './scripts/relocatable-static.mjs';
import { defineConfig } from 'vite';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * 빌드 식별자용 git 짧은 해시. git 실행 파일 없이도 되도록 .git을 직접 읽는다.
 * CI에서는 GITHUB_SHA를 우선한다. 알 수 없으면 'dev'.
 */
function gitShortHash(): string {
  const fromEnv = process.env['GIT_SHA'] ?? process.env['GITHUB_SHA'];
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    let gitDir = resolve(repoRoot, '.git');
    if (!existsSync(resolve(gitDir, 'HEAD'))) {
      // 워크트리: .git 파일에 "gitdir: <경로>"
      const pointer = readFileSync(gitDir, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1];
      if (!pointer) return 'dev';
      gitDir = resolve(repoRoot, pointer.trim());
    }
    const head = readFileSync(resolve(gitDir, 'HEAD'), 'utf8').trim();
    const ref = head.match(/^ref:\s*(.+)$/)?.[1];
    if (!ref) return head.slice(0, 7);
    const commonDir = existsSync(resolve(gitDir, 'commondir'))
      ? resolve(gitDir, readFileSync(resolve(gitDir, 'commondir'), 'utf8').trim())
      : gitDir;
    for (const dir of [gitDir, commonDir]) {
      const loose = resolve(dir, ref);
      if (existsSync(loose)) return readFileSync(loose, 'utf8').trim().slice(0, 7);
    }
    const packed = resolve(commonDir, 'packed-refs');
    if (existsSync(packed)) {
      const line = readFileSync(packed, 'utf8')
        .split('\n')
        .find((l) => l.endsWith(` ${ref}`));
      if (line) return line.slice(0, 7);
    }
  } catch {
    // .git이 없거나 읽을 수 없음
  }
  return 'dev';
}

export default defineConfig(({ isPreview }) => {
  // Kit preview는 adapter 전 중간 산출물을 읽는다. 배포 검증은 후처리된 dist만 서빙한다.
  if (isPreview === true)
    return {
      appType: 'mpa',
      publicDir: false,
      build: { outDir: 'dist' },
      preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    };
  return {
    plugins: [
      sveltekit({
        adapter: relocatableStatic(),
        files: { assets: 'public' },
        router: { type: 'hash' },
        preprocess: vitePreprocess(),
        compilerOptions: { runes: true },
        version: { name: gitShortHash(), pollInterval: 0 },
        serviceWorker: { register: false },
      }),
      {
        name: 'record-bundled-npm-packages',
        apply: 'build',
        generateBundle(options, bundle) {
          // SSR 중간물이 아닌 실제 출하 client chunk만 고지 집합으로 수집한다.
          if (!String(options.dir).endsWith('/client')) return;
          const names = new Set<string>();
          for (const output of Object.values(bundle)) {
            if (output.type !== 'chunk') continue;
            for (const id of Object.keys(output.modules)) {
              const match = id.replaceAll('\\', '/').match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/);
              if (match?.[1]) names.add(match[1]);
            }
          }
          this.emitFile({
            type: 'asset',
            fileName: 'oss/bundled-packages.json',
            source: `${JSON.stringify([...names].sort())}\n`,
          });
        },
      },
    ],
    define: {
      'import.meta.env.BASE_URL': JSON.stringify('./'),
      'import.meta.env.PRO_ASSET_REVIEW': JSON.stringify(process.env['PRO_ASSET_REVIEW'] === '1'),
      __BUILD_ID__: JSON.stringify(gitShortHash()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    build: {
      // 게스트 iOS 17+ Safari (spec NF-02)
      target: ['es2022', 'safari17'],
    },
    server: { host: true, port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  };
});
