// 루트 `npm test`: Node에서 도는 단위·속성·계약 테스트.
// packages/web의 컴포넌트 테스트는 브라우저가 필요해 따로 돈다 (npm run test:browser).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // tools/에는 셸 스크립트(setup-host.sh)도 있어 워크스페이스를 이름으로 적는다.
    projects: ['packages/*', 'tools/sim', '!packages/web'],
  },
});
