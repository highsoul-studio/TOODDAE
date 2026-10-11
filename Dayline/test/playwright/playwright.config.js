// Playwright 設定。チームの e2e 規約に合わせる: fullyParallel / CI は retries 2 + workers 1 / forbidOnly /
// screenshot only-on-failure / trace on-first-retry。違い: video は retain-on-failure (全件録画は重いので)、reporter は list + html。
import { defineConfig, devices } from '@playwright/test';

const chromiumLaunch = process.env.DAYLINE_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.DAYLINE_CHROMIUM_EXECUTABLE } } : {};
const desktop = (name) => ({ ...devices[name], viewport: { width: 1280, height: 800 } });

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  // 3 つのエンジン (Chromium / Firefox / WebKit = Safari) + モバイル 2 種。サーバと一時 vault は worker ごとに自動で立つ (fixtures.js)
  projects: [
    { name: 'chromium', use: { ...desktop('Desktop Chrome'), ...chromiumLaunch }, testIgnore: /mobile\.spec/ },
    { name: 'firefox', use: desktop('Desktop Firefox'), testIgnore: /mobile\.spec|security\.spec/ }, // security.spec はブラウザを使わない (生の HTTP) ので、エンジンごとに繰り返さない
    { name: 'webkit', use: desktop('Desktop Safari'), testIgnore: /mobile\.spec|security\.spec/ },
    { name: 'mobile-safari', use: devices['iPhone 13'], testMatch: /mobile\.spec/ },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], ...chromiumLaunch }, testMatch: /mobile\.spec/ },
  ],
});
