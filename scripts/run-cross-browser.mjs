import { resolve } from 'node:path'
import { projectRoot, run } from './lib/command.mjs'

run('npm', ['run', 'setup:local'])
const crossBrowserEnvironment = {
  ...process.env,
  AOP_LOCAL_PREVIEW: process.env.CI ? '1' : process.env.AOP_LOCAL_PREVIEW,
  NUXT_IGNORE_LOCK: '1',
  HOST: '127.0.0.1',
  PORT: process.env.CROSS_BROWSER_PORT ?? '3100',
}
if (process.env.CI) run('npm', ['run', 'build'], { env: crossBrowserEnvironment })

run(
  resolve(projectRoot, 'node_modules/.bin/playwright'),
  ['test', '--config', 'playwright.cross-browser.config.ts'],
  { env: crossBrowserEnvironment },
)

console.log('Cross-browser public journey: PASS (Chromium and WebKit)')
