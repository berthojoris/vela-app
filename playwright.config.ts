import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
