import { spawnSync } from 'node:child_process'
import { projectRoot, run } from './lib/command.mjs'

const port = Number(process.env.DEMO_PORT ?? 3000)
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error('DEMO_PORT must be an available integer from 1024 through 65535.')
}

for (const [label, script] of [
  ['Preparing the pinned document renderer', 'setup:documents'],
  ['Checking local requirements', 'setup:preflight'],
  ['Installing the deterministic fictional artist', 'setup:local'],
  ['Verifying the local installation', 'setup:check'],
]) {
  console.log(`\n${label}`)
  run('npm', ['run', script])
}

console.log(`\nDaymark Assembly is ready at http://127.0.0.1:${port}`)
console.log('Local-only demonstration accounts: content/demo/accounts.json')
console.log('Press Control-C to stop Nuxt. Run npm run demo:reset to restore the demo.')

const result = spawnSync(
  'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  },
)

if (result.error) throw result.error
if (result.signal) process.exit(0)
process.exit(result.status ?? 1)
