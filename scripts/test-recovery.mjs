import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, run } from './lib/command.mjs'

const recoveryDocument = readFileSync(resolve(projectRoot, 'docs/operations/recovery.md'), 'utf8')
for (const required of [
  'Database and storage',
  'Stripe reconciliation',
  'Media retry',
  'Application upgrade',
  'External-action boundary',
]) {
  assert.ok(recoveryDocument.includes(required), `Recovery documentation is missing: ${required}`)
}

const steps = [
  ['First local bootstrap', ['run', 'setup:local']],
  ['Safe local rerun', ['run', 'setup:local']],
  ['Payment reconciliation', ['run', 'test:commerce']],
  ['Media retry and lease recovery', ['run', 'test:media']],
  ['Database and storage restore', ['run', 'test:portability']],
  ['Final redacted installation check', ['run', 'setup:check', '--', '--json']],
]

for (const [label, arguments_] of steps) {
  console.log(`\n${label}`)
  run('npm', arguments_)
}

console.log(
  '\nRecovery drills: PASS (safe rerun, payment reconciliation, media retry, database and storage restore)',
)
