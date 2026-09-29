// E2E: Playwright Chromium(Android WebView 대역) + WebKit(iPhone Safari 대역). 호스트·CI 모두 네이티브 실행(AGENTS.md §5).
import { defineConfig, devices } from '@playwright/test';

// PR은 기능 전체(C) + 게스트/레이아웃/폰트(W), main은 전체 행렬이다.
const smoke = process.env['E2E_SUITE'] === 'smoke';
// 동시 워크트리 검증에서 다른 브랜치 미리보기를 재사용하지 않도록 포트를 지정할 수 있다.
const PORT = Number(process.env['PLAYWRIGHT_PORT'] ?? 4173);
const baseURL = `http://127.0.0.1:${PORT}`;
// 스크린샷의 시스템 글꼴 집합을 install-deps 글꼴로 고정한다(e2e/fonts.conf). 브라우저는 이 환경 변수를 물려받는다.
process.env['FONTCONFIG_FILE'] = new URL('./e2e/fonts.conf', import.meta.url).pathname;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // 공유 머신 부하 규칙(AGENTS.md §5): 로컬은 4 workers. CI는 --workers=2를 준다.
  ...(process.env['CI'] ? {} : { workers: 4 }),
  // 첫 리포터가 RP-07 비밀을 오류 첨부·메시지에서 가린 뒤 나머지가 결과를 읽는다.
  reporter: process.env['CI']
    ? [['./e2e/redact-remote-artifacts.ts'], ['list'], ['html', { open: 'never' }]]
    : [['./e2e/redact-remote-artifacts.ts'], ['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  // 스크린샷 기준 이미지는 Ubuntu 24.04 + playwright install --with-deps + e2e/fonts.conf(호스트 tools/setup-host.sh·CI 공통)에서 만든다:
  // npm run e2e -w packages/web -- --update-snapshots
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: {
    toHaveScreenshot: {
      // 같은 이미지 안에서도 안티에일리어싱이 드물게 몇 픽셀 흔들린다
      maxDiffPixelRatio: 0.001,
    },
  },
  // 턴 시간 계측(@timing, spec AC-06)은 CPU 부하에 민감하다: 병렬 워커와 겹치면 최댓값이 0.8~1.5s로 튄다(PR #34 리뷰 I-1).
  // 그래서 일반 프로젝트에서 빼고, 다른 테스트가 모두 끝난 뒤(dependencies) 브라우저 하나씩 차례로(timing-webkit은
  // timing-chromium 뒤), 프로젝트당 워커 1개로(--repeat-each 반복도 겹치지 않게) 혼자 돌린다.
  // 다른 테스트가 실패하면 의존 관계 때문에 계측은 건너뛴다. --repeat-each는 의존 대상 프로젝트에는 적용되지 않는다.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Pixel 7'] },
      grepInvert: smoke ? /@timing|@full/ : /@timing/,
    },
    {
      name: 'webkit',
      use: { ...devices['iPhone 15'] },
      ...(smoke ? { grep: /@guest|@layout|@fonts/ } : {}),
      grepInvert: smoke ? /@timing|@full|@paired/ : /@timing/,
    },
    {
      name: 'timing-chromium',
      use: { ...devices['Pixel 7'] },
      grep: /@timing/,
      // PR에서도 AC-06 Chromium 빠름·NP-03 혼합 브라우저 재접속을 직렬 계측한다.
      ...(smoke ? { grepInvert: /@full/ } : {}),
      workers: 1,
      dependencies: ['chromium', 'webkit'],
    },
    // #145의 AC-06 표본·임계값·hosted WebKit 기록 정책은 full에서 그대로 유지한다.
    ...(smoke
      ? []
      : [
          {
            name: 'timing-webkit',
            use: { ...devices['iPhone 15'] },
            grep: /@timing/,
            workers: 1,
            dependencies: ['timing-chromium'],
          },
        ]),
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env['CI'] && !process.env['PLAYWRIGHT_PORT'],
    timeout: 180_000,
  },
});
