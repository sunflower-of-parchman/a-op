import { createAdminClient, getLocalStatus, safeSupabaseError } from './lib/local-supabase.mjs'

const expectedBuckets = [
  'artwork',
  'preview-media',
  'source-audio',
  'downloads',
  'license-documents',
  'lesson-media',
  'administrative',
]

function check(id, status, summary) {
  return { id, status, summary }
}

try {
  const status = getLocalStatus()
  const admin = createAdminClient(status)
  const [
    { data: metadata, error: metadataError },
    { data: buckets, error: bucketError },
    { data: telemetry, error: telemetryError },
    { data: events, error: eventError },
    { data: mediaJobs, error: mediaError },
    { data: documentJobs, error: documentError },
    { data: webhookFailures, error: webhookError },
    { data: setup, error: setupError },
  ] = await Promise.all([
    admin.from('installation_metadata').select('key, value'),
    admin.storage.listBuckets(),
    admin.from('telemetry_settings').select('*').eq('id', 'primary').single(),
    admin.from('analytics_events').select('session_id'),
    admin.from('media_jobs').select('status'),
    admin.from('license_document_jobs').select('status'),
    admin.from('webhook_failures').select('status').neq('status', 'resolved'),
    admin.from('operational_checks').select('status').eq('id', 'setup.local').maybeSingle(),
  ])

  if (
    metadataError ||
    bucketError ||
    telemetryError ||
    eventError ||
    mediaError ||
    documentError ||
    webhookError ||
    setupError
  ) {
    throw new Error('One or more redacted status queries failed.')
  }

  const values = new Map(metadata.map(({ key, value }) => [key, value]))
  const bucketNames = new Set(buckets.map(({ id }) => id))
  const bucketCount = expectedBuckets.filter((bucket) => bucketNames.has(bucket)).length
  const failedMedia = mediaJobs.filter(({ status }) => status === 'failed').length
  const activeMedia = mediaJobs.filter(({ status }) =>
    ['pending', 'processing'].includes(status),
  ).length
  const failedDocuments = documentJobs.filter(({ status }) => status === 'failed').length
  const activeDocuments = documentJobs.filter(({ status }) =>
    ['queued', 'processing'].includes(status),
  ).length
  const sessions = new Set(events.map(({ session_id }) => session_id)).size
  const checks = [
    check(
      'database.schema',
      values.get('schema_version') === '20260715070000' ? 'pass' : 'fail',
      values.get('schema_version') === '20260715070000'
        ? 'Expected application schema installed.'
        : 'Application schema needs migration.',
    ),
    check(
      'storage.buckets',
      bucketCount === expectedBuckets.length ? 'pass' : 'fail',
      `${bucketCount} of ${expectedBuckets.length} storage boundaries present.`,
    ),
    check(
      'workers.media',
      failedMedia ? 'fail' : activeMedia ? 'action_required' : 'pass',
      `${failedMedia} failed and ${activeMedia} unfinished audio-processing jobs.`,
    ),
    check(
      'workers.documents',
      failedDocuments ? 'fail' : activeDocuments ? 'action_required' : 'pass',
      `${failedDocuments} failed and ${activeDocuments} unfinished document jobs.`,
    ),
    check(
      'commerce.webhooks',
      webhookFailures.length ? 'fail' : 'pass',
      `${webhookFailures.length} unresolved payment webhook failures.`,
    ),
    check(
      'contact.adapter',
      values.get('contact_adapter') === 'local_capture' ? 'action_required' : 'pass',
      values.get('contact_adapter') === 'local_capture'
        ? 'Local administrative message capture is active.'
        : 'A deployed delivery adapter is recorded.',
    ),
    check(
      'setup.local',
      setup?.status ?? 'action_required',
      setup ? 'A redacted local setup verification is recorded.' : 'Run npm run setup:check.',
    ),
  ]

  const result = {
    generatedAt: new Date().toISOString(),
    telemetry: {
      enabled: telemetry.optional_enabled,
      consentMode: telemetry.consent_mode,
      retentionDays: telemetry.retention_days,
      events: events.length,
      sessions,
    },
    checks,
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('Artist-Owned Platform diagnostic')
    console.log(`Optional analytics: ${result.telemetry.enabled ? 'ENABLED' : 'DISABLED'}`)
    console.log(
      `Audience aggregate: ${result.telemetry.events} events across ${result.telemetry.sessions} sessions`,
    )
    for (const item of checks) {
      console.log(`${item.id}: ${item.status.toUpperCase()} — ${item.summary}`)
    }
    console.log('Diagnostic output: REDACTED')
  }
} catch (error) {
  console.error(`Diagnostic: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
