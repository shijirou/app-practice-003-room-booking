import { defineConfig } from '@playwright/test'

// E2E テスト: 本物の DB・API・画面を起動し、ブラウザ（Chromium）を自動で動かして確かめる。
// ポートは決まりどおり 5173（画面）・8080（API）・5432（DB）。開発用のサーバーが動いていたら、先に止める。
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // 同じ DB を使うので、1 つずつ順番に動かす
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalTeardown: './e2e/global-teardown.mjs',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node e2e/start-api.mjs',
      url: 'http://localhost:8080/api/employees',
      // 開発用の API が動いたままだと、開発用の DB につながってしまうので、使い回さない
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
