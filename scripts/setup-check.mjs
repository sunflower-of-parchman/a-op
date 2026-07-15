import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artistConfigSchema } from '../shared/schemas/artistConfig.ts'
import { projectStateSchema } from '../shared/schemas/setup.ts'
import { projectRoot, readJson, writeJsonIfChanged } from './lib/command.mjs'
import {
  createAdminClient,
  getLocalStatus,
  safeSupabaseError,
  verifyAuthorizationDemonstration,
  verifyPublicDemonstration,
} from './lib/local-supabase.mjs'

const statePath = resolve(projectRoot, 'setup/project-state.json')
const jsonOutput = process.argv.includes('--json')
const checks = []

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

function record(id, status, summary, safeDetails = undefined, runbook = undefined) {
  const item = {
    id,
    status,
    summary,
    ...(safeDetails ? { safeDetails } : {}),
    ...(runbook ? { runbook } : {}),
  }
  checks.push(item)
  if (!jsonOutput) console.log(`${id}: ${status.toUpperCase()} — ${summary}`)
}

try {
  const state = projectStateSchema.parse(readJson(statePath))
  const status = getLocalStatus()
  record('supabase.connection', 'pass', 'The local database service is reachable.')

  const admin = createAdminClient(status)
  const { data: published, error: publishedError } = await admin
    .from('site_config_versions')
    .select('config')
    .eq('installation_key', 'primary')
    .eq('status', 'published')
    .single()
  if (publishedError || !published) throw new Error('Published artist configuration is missing.')
  const artistConfig = artistConfigSchema.parse(published.config)
  record(
    'artist.configuration',
    'pass',
    'The published artist configuration matches schema version 1.',
    {
      schemaVersion: artistConfig.schemaVersion,
      enabledModules: Object.values(artistConfig.features).filter(Boolean).length,
    },
  )

  await verifyPublicDemonstration(status)
  await verifyAuthorizationDemonstration(status)
  record(
    'database.migration',
    'pass',
    'The expected schema and public publication view are available.',
    {
      schemaVersion: '20260715070000',
    },
  )
  record('demonstration.seed', 'pass', 'The deterministic authority fixtures are present.')
  record('storage.boundaries', 'pass', 'All seven storage boundaries and policies are present.', {
    buckets: 7,
  })
  record(
    'authentication.fixtures',
    'pass',
    'The owner, editor, and isolated customer roles are verified.',
  )

  const databaseTypes = readFileSync(resolve(projectRoot, 'shared/types/database.ts'), 'utf8')
  const generated = !databaseTypes.includes('narrow placeholder')
  if (!generated) throw new Error('Run npm run setup:local to generate database types.')
  record('database.types', 'pass', 'Generated database types are present.')

  state.checks.localSupabase = 'pass'
  state.checks.databaseTypes = 'pass'
  state.checks.demoSeed = 'pass'
  state.checks.authentication = 'pass'
  state.checks.storage = 'pass'
  writeJsonIfChanged(statePath, state)

  const stripeKey = privateEnvironmentValue('NUXT_STRIPE_SECRET_KEY')
  const webhookSecret = privateEnvironmentValue('NUXT_STRIPE_WEBHOOK_SECRET')
  const stripeStatus = !stripeKey
    ? 'action-required'
    : stripeKey.startsWith('sk_test_')
      ? 'pass'
      : 'fail'
  const webhookStatus = !webhookSecret
    ? 'action-required'
    : webhookSecret.startsWith('whsec_')
      ? 'pass'
      : 'fail'
  record(
    'stripe.test-mode',
    stripeStatus,
    stripeStatus === 'pass'
      ? 'A server-only Stripe test credential is present.'
      : stripeStatus === 'action-required'
        ? 'The labeled local payment simulation is active.'
        : 'The configured Stripe credential is not recognizable as test mode.',
    undefined,
    'docs/agent/stripe.md',
  )
  record(
    'stripe.webhook',
    webhookStatus,
    webhookStatus === 'pass'
      ? 'A server-only Stripe webhook credential is present.'
      : webhookStatus === 'action-required'
        ? 'Webhook verification remains a hosted-service checkpoint.'
        : 'The configured webhook credential has an unsupported shape.',
    undefined,
    'docs/agent/stripe.md',
  )
  if (stripeStatus === 'fail' || webhookStatus === 'fail') {
    throw new Error('Stripe configuration is not a recognizable test-mode configuration.')
  }

  record(
    'authentication.redirects',
    'action-required',
    'Local redirects are active; hosted OAuth redirects remain unconfigured.',
    undefined,
    'docs/agent/authentication-oauth.md',
  )
  record(
    'deployment',
    'action-required',
    'The application is verified locally and has not been deployed.',
    undefined,
    'docs/agent/vercel-domain.md',
  )
  record(
    'domain',
    'action-required',
    'The local hostname is active; no custom DNS change has been made.',
    undefined,
    'docs/agent/vercel-domain.md',
  )

  const { error: operationalError } = await admin.rpc('record_operational_event', {
    p_event_name: 'setup_health',
    p_check_key: 'setup.local',
    p_status: 'pass',
    p_summary: 'Local setup verification passed.',
    p_safe_details: {
      schemaVersion: '20260715070000',
      storageBoundaries: 7,
      authentication: 'verified',
      stripe: stripeStatus === 'pass' ? 'test-configured' : 'simulation',
      stripeWebhook: webhookStatus === 'pass' ? 'configured' : 'simulation',
    },
  })
  if (operationalError) throw new Error('The redacted setup-health record could not be saved.')

  const result = { overall: 'pass', installation: 'local', checks }
  if (jsonOutput) console.log(JSON.stringify(result, null, 2))
  else console.log('Setup check: PASS')
} catch (error) {
  const message = safeSupabaseError(error)
  if (jsonOutput)
    console.log(
      JSON.stringify({ overall: 'fail', installation: 'local', checks, error: message }, null, 2),
    )
  else console.error(`Setup check: FAIL\n${message}`)
  process.exit(1)
}
