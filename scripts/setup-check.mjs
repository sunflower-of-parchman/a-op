import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, readJson, writeJsonIfChanged } from './lib/command.mjs'
import {
  getLocalStatus,
  safeSupabaseError,
  verifyPublicDemonstration,
} from './lib/local-supabase.mjs'

const statePath = resolve(projectRoot, 'setup/project-state.json')

try {
  const state = readJson(statePath)
  const artistConfig = readJson(resolve(projectRoot, 'content/demo/bootstrap-config.json'))
  console.log(`Artist configuration: ${artistConfig.schemaVersion === 1 ? 'PASS' : 'FAIL'}`)

  const status = getLocalStatus()
  console.log('Supabase connection: PASS')

  await verifyPublicDemonstration(status)
  console.log('Database migration: PASS')
  console.log('Demo seed: PASS')

  const databaseTypes = readFileSync(resolve(projectRoot, 'shared/types/database.ts'), 'utf8')
  const generated = !databaseTypes.includes('narrow placeholder')
  console.log(`Generated database types: ${generated ? 'PASS' : 'FAIL'}`)
  if (!generated) throw new Error('Run npm run setup:local to generate database types.')

  state.checks.localSupabase = 'pass'
  state.checks.databaseTypes = 'pass'
  state.checks.demoSeed = 'pass'
  writeJsonIfChanged(statePath, state)

  console.log('Storage policies: PENDING MILESTONE 2')
  console.log('Authentication redirects: LOCAL')
  console.log('Stripe test mode: ACTION REQUIRED')
  console.log('Stripe webhook: ACTION REQUIRED')
  console.log('Deployment: LOCAL')
  console.log('Domain: LOCAL')
  console.log('Setup check: PASS')
} catch (error) {
  console.error(`Setup check: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
