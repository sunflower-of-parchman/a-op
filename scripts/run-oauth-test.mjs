import { resolve } from 'node:path'
import { projectRoot, run } from './lib/command.mjs'

run('npm', ['run', 'setup:local'])

const port = process.env.OAUTH_TEST_PORT ?? '3111'
run(
  resolve(projectRoot, 'node_modules/.bin/playwright'),
  ['test', 'tests/e2e/oauth.spec.ts', '--project=chromium'],
  {
    env: {
      ...process.env,
      NUXT_IGNORE_LOCK: '1',
      NUXT_PUBLIC_OAUTH_PROVIDERS: 'google,github',
      NUXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
      PORT: port,
      TEST_OAUTH_ENABLED: '1',
    },
  },
)

console.log('Optional OAuth PKCE gate: PASS')
