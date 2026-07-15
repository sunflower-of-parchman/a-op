import { resolve } from 'node:path'
import { projectRoot, readJson, run, writeJsonIfChanged } from './lib/command.mjs'

try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  run(npm, ['run', 'setup:local'])
  run(npm, ['run', 'setup:check'])
  run(npm, ['run', 'test:policies'])
  run(npm, ['run', 'test:spine'])
  run(npm, ['run', 'build'])
  run(npm, ['run', 'test:browser-secrets'])
  run(npm, ['run', 'test:e2e', '--', 'tests/e2e/authority.spec.ts', '--project=chromium'])
  const statePath = resolve(projectRoot, 'setup/project-state.json')
  const state = readJson(statePath)
  state.checks.authoritySpine = 'pass'
  writeJsonIfChanged(statePath, state)
  console.log('Integration Gate A: PASS')
} catch (error) {
  console.error(
    `Integration Gate A: FAIL\n${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}
