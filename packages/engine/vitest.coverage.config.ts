// 엔진 단독 실행 설정: 커버리지(v8, ≥ 90%)와 10,000판 속성 테스트(ENGINE_FULL=1)용.
// 커버리지 옵션은 루트(projects) 설정에서만 유효하므로 엔진 전용 루트 설정을 따로 둔다.
// 사용: npm run coverage -w packages/engine / npm run test:full -w packages/engine
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
