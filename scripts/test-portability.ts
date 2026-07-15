import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot, readJson, run } from './lib/command.mjs'
import { getLocalStatus, safeSupabaseError } from './lib/local-supabase.mjs'

const workspace = await mkdtemp(join(tmpdir(), 'artist-portability-test-'))
const firstDirectory = join(workspace, 'first')
const secondDirectory = join(workspace, 'second')

function execute(script: string, args: string[] = [], allowFailure = false) {
  return run(process.execPath, ['--experimental-strip-types', script, ...args], {
    cwd: projectRoot,
    capture: true,
    allowFailure,
  })
}

try {
  execute('scripts/reset-local-demo.mjs')
  const status = getLocalStatus()
  const first = JSON.parse(
    execute('scripts/export-artist.ts', ['--out', firstDirectory, '--json']).stdout,
  )
  const second = JSON.parse(
    execute('scripts/export-artist.ts', ['--out', secondDirectory, '--json']).stdout,
  )
  assert.equal(first.snapshotHash, second.snapshotHash)
  assert.equal(first.exportId, second.exportId)
  for (const file of [
    'manifest.json',
    'content.json',
    'media.json',
    'services.json',
    'operations.json',
  ]) {
    assert.equal(
      await readFile(join(firstDirectory, file), 'utf8'),
      await readFile(join(secondDirectory, file), 'utf8'),
    )
  }

  const verified = JSON.parse(
    execute('scripts/verify-export.ts', [firstDirectory, '--json']).stdout,
  )
  assert.equal(verified.snapshotHash, first.snapshotHash)
  assert.ok(verified.media >= 1)

  const combined = (
    await Promise.all(
      ['manifest.json', 'content.json', 'media.json', 'services.json', 'operations.json'].map(
        (file) => readFile(join(firstDirectory, file), 'utf8'),
      ),
    )
  ).join('\n')
  const accounts = readJson(join(projectRoot, 'content/demo/accounts.json'))
  for (const account of accounts.accounts) assert.ok(!combined.includes(account.email))
  assert.ok(!combined.includes(status.secretKey))
  assert.ok(!combined.includes(status.apiUrl))
  assert.ok(!combined.includes('019f6291-c1c9-7cf3-9da7-be2a19b7154c'))
  assert.ok(!combined.includes('external_price_id'))
  assert.ok(!combined.includes('provider_event_id'))

  const refused = execute('scripts/restore-check.ts', [firstDirectory], true)
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /--confirm-disposable-local/)

  const restoredOutput = execute('scripts/restore-check.ts', [
    firstDirectory,
    '--confirm-disposable-local',
    '--json',
  ]).stdout
  const restored = JSON.parse(restoredOutput)
  assert.equal(restored.restoreTarget, 'disposable-local')
  assert.equal(restored.projection.configuration, 'equivalent')
  assert.equal(restored.projection.media, verified.media)
  assert.equal(restored.externalAccounts.length, 6)
  assert.ok(!restoredOutput.includes(status.secretKey))
  assert.ok(!restoredOutput.includes(status.apiUrl))

  const tamperedPath = join(secondDirectory, 'content.json')
  await writeFile(tamperedPath, `${await readFile(tamperedPath, 'utf8')} `)
  const tampered = execute('scripts/verify-export.ts', [secondDirectory, '--json'], true)
  assert.notEqual(tampered.status, 0)
  assert.match(tampered.stderr, /hash does not match/)

  console.log(
    'Artist portability: PASS (deterministic export, validation, media hashes, clean restore, redaction, tamper denial)',
  )
} catch (error) {
  console.error(`Artist portability: FAIL\n${safeSupabaseError(error)}`)
  process.exitCode = 1
} finally {
  try {
    execute('scripts/reset-local-demo.mjs')
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
