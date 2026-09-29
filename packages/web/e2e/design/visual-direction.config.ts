import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'visual-direction.render.ts',
  reporter: 'list',
  outputDir: '../../test-results/visual-direction',
  workers: 2,
  use: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5 },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
