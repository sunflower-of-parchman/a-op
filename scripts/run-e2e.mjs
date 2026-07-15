import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const playwright = join(root, 'node_modules', '.bin', 'playwright')
const requested = process.argv.slice(2)

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (requested.length > 0) {
  run(playwright, ['test', ...requested])
  process.exit(0)
}

const specifications = readdirSync(join(root, 'tests', 'e2e'))
  .filter((file) => file.endsWith('.spec.ts') && file !== 'cross-browser.spec.ts')
  .sort()
  .map((file) => `tests/e2e/${file}`)

for (const specification of specifications) {
  console.log(`\n[e2e] Resetting the local demonstration before ${specification}`)
  run(process.execPath, ['scripts/reset-local-demo.mjs'])
  run(playwright, ['test', specification])
}

console.log(`\nFull browser regression: PASS (${specifications.length} isolated specifications)`)
