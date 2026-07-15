import { resolve } from 'node:path'
import { projectRoot, readJson, run, writeJsonIfChanged } from './lib/command.mjs'

const steps = [
  ['Formatting', ['run', 'format:check']],
  ['Lint', ['run', 'lint']],
  ['Type checking', ['run', 'typecheck']],
  ['Unit tests', ['run', 'test:unit']],
  ['Integration tests', ['run', 'test:integration']],
  ['Documentation and demo package', ['run', 'test:docs']],
  ['Production build', ['run', 'build']],
]

for (const [label, args] of steps) {
  console.log(`\n${label}`)
  run('npm', args)
}

const statePath = resolve(projectRoot, 'setup/project-state.json')
const state = readJson(statePath)
state.checks.foundation = 'pass'
writeJsonIfChanged(statePath, state)

console.log('\nFoundation verification: PASS')
