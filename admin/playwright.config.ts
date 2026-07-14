import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/startE2eServer.js',
      cwd: '../backend',
      env: {
        DB_PATH: 'test-bearings.db',
        NODE_ENV: 'test',
      },
      port: 3001,
      reuseExistingServer: false,
      timeout: 15000,
    },
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: true,
      timeout: 15000,
    },
  ],
});
