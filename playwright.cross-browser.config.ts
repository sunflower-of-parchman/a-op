import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT ?? 3100)
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'cross-browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.platform === 'darwin' && !process.env.PLAYWRIGHT_FORCE_FIREFOX
      ? []
      : [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }]),
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
