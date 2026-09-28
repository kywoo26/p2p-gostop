import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'wireframe.spec.ts',
  reporter: 'list',
  use: { browserName: 'chromium', deviceScaleFactor: 1 },
  workers: 1,
});
