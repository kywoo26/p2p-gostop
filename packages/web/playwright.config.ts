// E2E: Playwright Chromium(Android WebView 대역) + WebKit(iPhone Safari 대역). 도커 e2e 컨테이너에서만 실행.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  // 스크린샷 기준 이미지는 개발 이미지 안에서만 만든다(글꼴·렌더러 고정): docker compose run --rm dev npm run e2e -w packages/web -- --update-snapshots
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: {
    toHaveScreenshot: {
      // 같은 이미지 안에서도 안티에일리어싱이 드물게 몇 픽셀 흔들린다
      maxDiffPixelRatio: 0.001,
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
