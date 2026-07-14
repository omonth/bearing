import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: 1,
  workers: 1,
  outputDir: 'test-results/storefront',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/startE2eServer.js',
      cwd: './backend',
      env: {
        DB_PATH: 'test-bearings.db',
        NODE_ENV: 'test',
      },
      port: 3001,
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: 'npm run dev',
      env: {
        NEXT_PUBLIC_API_URL: 'http://localhost:3001/api',
      },
      port: 3000,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
