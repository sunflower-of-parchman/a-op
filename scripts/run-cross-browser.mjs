import { resolve } from 'node:path'
import { projectRoot, run } from './lib/command.mjs'

run('npm', ['run', 'setup:local'])
const crossBrowserEnvironment = {
  ...process.env,
  NUXT_IGNORE_LOCK: '1',
  PORT: process.env.CROSS_BROWSER_PORT ?? '3100',
}

run(
  resolve(projectRoot, 'node_modules/.bin/playwright'),
  ['test', '--config', 'playwright.cross-browser.config.ts'],
  { env: crossBrowserEnvironment },
)

console.log(
  process.platform === 'darwin' && !process.env.PLAYWRIGHT_FORCE_FIREFOX
    ? 'Cross-browser public journey: PASS (Chromium and WebKit locally; Firefox remains mandatory in Linux CI)'
    : 'Cross-browser public journey: PASS (Chromium, Firefox, WebKit)',
)
