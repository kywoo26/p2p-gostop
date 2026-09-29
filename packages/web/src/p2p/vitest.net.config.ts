import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../net/vitest.config.ts';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['src/net/*.node.test.ts', 'src/net/*.net.ts', 'src/p2p/*.net.ts'],
      maxWorkers: 2,
    },
  }),
);
