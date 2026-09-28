// 카드 시안 미리보기 PNG 생성용 Playwright 설정 (디자인 트랙 D1). 앱 E2E(playwright.config.ts)와 별개다.
//   ./dev.sh e2e -c scripts/card-preview.config.mjs
// → docs/design/preview-A.png, preview-B.png, preview-compare.png
// 서버 없이 page.setContent로 그린다. 크로뮴 하나만 쓴다(글꼴·렌더러는 도커 e2e 이미지로 고정).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /card-preview\.spec\.mjs$/,
  reporter: 'list',
  outputDir: '../test-results/card-preview',
  projects: [{ name: 'chromium', use: { browserName: 'chromium', deviceScaleFactor: 2 } }],
});
