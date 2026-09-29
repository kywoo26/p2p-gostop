// E2E: Playwright Chromium(Android WebView 대역) + WebKit(iPhone Safari 대역). 호스트와 개발 이미지 모두에서 돈다(AGENTS.md §5).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;
// 스크린샷은 기준 이미지를 만든 환경에서만 비교한다(Playwright visual comparisons). compose.yaml의 dev 서비스가 표시를 준다.
const inDevImage = process.env['P2P_GOSTOP_DEV_IMAGE'] === '1';
if (process.env['CI'] && !inDevImage) {
  throw new Error(
    'CI E2E는 개발 이미지(docker compose run --rm dev)에서 실행해야 스크린샷을 비교한다.',
  );
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // 공유 머신 부하 규칙: 로컬은 4 workers(기본값은 코어의 절반). CI는 --workers=2를 준다.
  ...(process.env['CI'] ? {} : { workers: 4 }),
  // 호스트에서는 toHaveScreenshot 비교·갱신을 건너뛰고 나머지 단언은 그대로 돈다. 비교는 npm run verify:image(@visual)와 CI.
  ignoreSnapshots: !inDevImage,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  // 스크린샷 기준 이미지는 개발 이미지 안에서만 만든다(글꼴·렌더러 고정): docker compose run --rm dev npm run e2e:visual -w packages/web -- --update-snapshots
  // 새 toHaveScreenshot 테스트에는 { tag: '@visual' }를 붙인다(이미지 비교 대상).
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
    { name: 'chromium', use: { ...devices['Pixel 7'] }, grepInvert: /@timing/ },
    { name: 'webkit', use: { ...devices['iPhone 15'] }, grepInvert: /@timing/ },
    {
      name: 'timing-chromium',
      use: { ...devices['Pixel 7'] },
      grep: /@timing/,
      workers: 1,
      dependencies: ['chromium', 'webkit'],
    },
    {
      name: 'timing-webkit',
      use: { ...devices['iPhone 15'] },
      grep: /@timing/,
      workers: 1,
      dependencies: ['timing-chromium'],
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
