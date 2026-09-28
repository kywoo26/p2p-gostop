// 컴포넌트 테스트: Vitest 브라우저 모드 (Chromium + WebKit, plan.md 4장).
// Playwright 브라우저가 필요하므로 e2e 컨테이너에서 실행한다: ./dev.sh test:browser
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
      },
    },
  }),
);
