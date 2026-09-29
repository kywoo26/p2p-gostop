import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/net/*.node.test.ts', 'src/net/*.net.ts'], environment: 'node' },
});
