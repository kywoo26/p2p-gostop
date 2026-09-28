// 루트 `npm test`: Node에서 도는 단위·속성·계약 테스트.
// packages/web의 컴포넌트 테스트는 브라우저가 필요해 e2e 컨테이너에서 따로 돈다 (./dev.sh test:browser).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'tools/*', '!packages/web'],
  },
});
