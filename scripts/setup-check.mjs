import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, readJson, writeJsonIfChanged } from './lib/command.mjs'
import {
  getLocalStatus,
  safeSupabaseError,
  verifyAuthorizationDemonstration,
  verifyPublicDemonstration,
} from './lib/local-supabase.mjs'

const statePath = resolve(projectRoot, 'setup/project-state.json')

function privateEnvironmentValue(name) {
  if (process.env[name]) return process.env[name]
  try {
    const environment = readFileSync(resolve(projectRoot, '.env'), 'utf8')
    const line = environment.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`))
    return line?.slice(name.length + 1).trim() ?? ''
  } catch {
    return ''
  }
}

try {
  const state = readJson(statePath)
  const artistConfig = readJson(resolve(projectRoot, 'content/demo/bootstrap-config.json'))
  console.log(`Artist configuration: ${artistConfig.schemaVersion === 1 ? 'PASS' : 'FAIL'}`)

  const status = getLocalStatus()
  console.log('Supabase connection: PASS')

  await verifyPublicDemonstration(status)
  await verifyAuthorizationDemonstration(status)
  console.log('Database migration: PASS')
  console.log('Demo seed: PASS')
  console.log('Storage buckets and policies: PASS')
  console.log('Authentication fixtures and roles: PASS')

  const databaseTypes = readFileSync(resolve(projectRoot, 'shared/types/database.ts'), 'utf8')
  const generated = !databaseTypes.includes('narrow placeholder')
  console.log(`Generated database types: ${generated ? 'PASS' : 'FAIL'}`)
  if (!generated) throw new Error('Run npm run setup:local to generate database types.')

  state.checks.localSupabase = 'pass'
  state.checks.databaseTypes = 'pass'
  state.checks.demoSeed = 'pass'
  state.checks.authentication = 'pass'
  state.checks.storage = 'pass'
  writeJsonIfChanged(statePath, state)

  console.log('Authentication redirects: LOCAL')
  const stripeKey = privateEnvironmentValue('NUXT_STRIPE_SECRET_KEY')
  const webhookSecret = privateEnvironmentValue('NUXT_STRIPE_WEBHOOK_SECRET')
  const stripeStatus = !stripeKey
    ? 'ACTION REQUIRED'
    : stripeKey.startsWith('sk_test_')
      ? 'PASS'
      : 'FAIL'
  const webhookStatus = !webhookSecret
    ? 'ACTION REQUIRED'
    : webhookSecret.startsWith('whsec_')
      ? 'PASS'
      : 'FAIL'
  console.log(`Stripe test mode: ${stripeStatus}`)
  console.log(`Stripe webhook: ${webhookStatus}`)
  if (stripeStatus === 'FAIL' || webhookStatus === 'FAIL') {
    throw new Error('Stripe configuration is not a recognizable test-mode configuration.')
  }
  console.log('Deployment: LOCAL')
  console.log('Domain: LOCAL')
  console.log('Setup check: PASS')
} catch (error) {
  console.error(`Setup check: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
