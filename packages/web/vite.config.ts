import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * 빌드 식별자용 git 짧은 해시. 컨테이너에 git이 없어도 되도록 .git을 직접 읽는다.
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

export default defineConfig({
  // Android assets(127.0.0.1:17777/)와 로컬 미리보기 어디서나 열리도록 상대 경로
  base: './',
  plugins: [svelte()],
  define: {
    __BUILD_ID__: JSON.stringify(gitShortHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    // 게스트 iOS 17+ Safari (spec NF-02)
    target: ['es2022', 'safari17'],
  },
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
