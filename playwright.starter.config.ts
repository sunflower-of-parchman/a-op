import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.STARTER_PORT ?? 3101)
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'starter.spec.ts',
  fullyParallel: true,
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
        command: `NUXT_PUBLIC_STARTER_MODE=true NUXT_IGNORE_LOCK=1 npm run dev -- --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
})
