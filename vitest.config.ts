// 루트 `npm test`: Node에서 도는 단위·속성·계약 테스트.
// packages/web의 컴포넌트 테스트는 브라우저가 필요해 따로 돈다 (docker compose run --rm dev npm run test:browser).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'tools/*', '!packages/web'],
  },
});
