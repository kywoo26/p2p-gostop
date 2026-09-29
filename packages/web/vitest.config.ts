// 컴포넌트 테스트: Vitest 브라우저 모드 (Chromium + WebKit, plan.md 4장).
// Playwright 브라우저가 필요하므로 개발 이미지에서 실행한다: docker compose run --rm dev npm run test:browser
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    // 테스트 도중 의존성 최적화로 페이지가 다시 로드되지 않게 미리 묶는다 (QR: uqr)
    optimizeDeps: { include: ['uqr'] },
    test: {
      include: ['src/**/*.test.ts'],
      setupFiles: ['src/test-setup.ts'],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
      },
    },
  }),
);
