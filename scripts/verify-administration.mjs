import { resolve } from 'node:path'
import { projectRoot, readJson, run, writeJsonIfChanged } from './lib/command.mjs'

try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  run(npm, ['run', 'setup:local'])
  run(npm, ['run', 'test:administration'])
  run(npm, ['run', 'test:e2e', '--', 'tests/e2e/administration.spec.ts', '--project=chromium'])
  const statePath = resolve(projectRoot, 'setup/project-state.json')
  const state = readJson(statePath)
  state.checks.administration = 'pass'
  writeJsonIfChanged(statePath, state)
  console.log('Artist administration verification: PASS')
} catch (error) {
  console.error(
    `Artist administration verification: FAIL\n${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}
