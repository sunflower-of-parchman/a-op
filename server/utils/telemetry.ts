import type { H3Event } from 'h3'
import { telemetryEventNameSchema, telemetryResourceTypeSchema } from '#shared/schemas/telemetry'
import type {
  OperationalCheck,
  OperationalStatusResponse,
  TelemetryPolicyResponse,
  TelemetrySummary,
} from '#shared/types/telemetry'
import type { Database } from '#shared/types/database'
import { getAdminSupabase } from './supabase'

type AnalyticsRow = Pick<
  Database['public']['Tables']['analytics_events']['Row'],
  'event_name' | 'session_id' | 'resource_type' | 'resource_key' | 'occurred_at'
>

const expectedStorageBuckets = [
  'artwork',
  'preview-media',
  'source-audio',
  'downloads',
  'license-documents',
  'lesson-media',
  'administrative',
]

export function requestHasPrivacySignal(event: H3Event) {
  return getRequestHeader(event, 'sec-gpc') === '1' || getRequestHeader(event, 'dnt') === '1'
}

export async function loadTelemetryPolicy(event: H3Event): Promise<TelemetryPolicyResponse> {
  const admin = getAdminSupabase(event)
  const { data, error } = await admin
    .from('telemetry_settings')
    .select('*')
    .eq('id', 'primary')
    .single()
  if (error || !data) {
    throw createError({ statusCode: 503, statusMessage: 'Privacy settings could not be loaded.' })
  }

  return {
    optionalEnabled: data.optional_enabled,
    consentMode: data.consent_mode,
    retentionDays: data.retention_days,
    meaningfulListenSeconds: data.meaningful_listen_seconds,
    privacySignal: requestHasPrivacySignal(event),
    purposes: [
      'Understand which public pages and artist-owned resources are useful.',
      'Measure meaningful listening, learning progress, and direct-support journeys.',
      'Improve this independent artist site without advertising profiles or third-party trackers.',
    ],
  }
}

function dayKey(timestamp: string) {
  return timestamp.slice(0, 10)
}

export function summarizeTelemetry(rows: AnalyticsRow[], windowDays = 30): TelemetrySummary {
  const sessions = new Set<string>()
  const totals = new Map<string, number>()
  const daily = new Map<string, { pageViews: number; meaningfulActions: number }>()
  const content = new Map<
    string,
    { resourceType: string; resourceKey: string; eventName: string; count: number }
  >()

  for (const row of rows) {
    sessions.add(row.session_id)
    totals.set(row.event_name, (totals.get(row.event_name) ?? 0) + 1)

    const date = dayKey(row.occurred_at)
    const day = daily.get(date) ?? { pageViews: 0, meaningfulActions: 0 }
    if (row.event_name === 'page_view') day.pageViews += 1
    else day.meaningfulActions += 1
    daily.set(date, day)

    const resourceType = telemetryResourceTypeSchema.safeParse(row.resource_type)
    const eventName = telemetryEventNameSchema.safeParse(row.event_name)
    if (resourceType.success && eventName.success && row.resource_key) {
      const key = `${resourceType.data}:${row.resource_key}:${eventName.data}`
      const current = content.get(key) ?? {
        resourceType: resourceType.data,
        resourceKey: row.resource_key,
        eventName: eventName.data,
        count: 0,
      }
      current.count += 1
      content.set(key, current)
    }
  }

  return {
    windowDays,
    sessions: sessions.size,
    events: rows.length,
    totals: [...totals.entries()]
      .map(([eventName, count]) => ({
        eventName: telemetryEventNameSchema.parse(eventName),
        count,
      }))
      .sort(
        (left, right) => right.count - left.count || left.eventName.localeCompare(right.eventName),
      ),
    daily: [...daily.entries()]
      .map(([date, value]) => ({ date, ...value }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    content: [...content.values()]
      .map((item) => ({
        ...item,
        resourceType: telemetryResourceTypeSchema.parse(item.resourceType),
        eventName: telemetryEventNameSchema.parse(item.eventName),
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 25),
  }
}

function statusRank(status: OperationalCheck['status']) {
  return status === 'fail' ? 2 : status === 'action_required' ? 1 : 0
}

function operationalCheck(
  id: string,
  label: string,
  status: OperationalCheck['status'],
  summary: string,
  action: string | null,
  checkedAt = new Date().toISOString(),
): OperationalCheck {
  return { id, label, status, summary, action, checkedAt }
}

export async function loadOperationalStatus(event: H3Event): Promise<OperationalStatusResponse> {
  const admin = getAdminSupabase(event)
  const config = useRuntimeConfig(event)
  const [
    { data: metadata, error: metadataError },
    { data: buckets, error: bucketError },
    { data: mediaJobs, error: mediaError },
    { data: documentJobs, error: documentError },
    { data: webhookFailures, error: webhookError },
    { data: recordedChecks, error: checkError },
  ] = await Promise.all([
    admin.from('installation_metadata').select('key, value, updated_at'),
    admin.storage.listBuckets(),
    admin.from('media_jobs').select('status'),
    admin.from('license_document_jobs').select('status'),
    admin.from('webhook_failures').select('status').neq('status', 'resolved'),
    admin.from('operational_checks').select('*').order('checked_at', { ascending: false }),
  ])

  if (metadataError || bucketError || mediaError || documentError || webhookError || checkError) {
    throw createError({ statusCode: 503, statusMessage: 'System status could not be verified.' })
  }

  const metadataMap = new Map(metadata.map((item) => [item.key, item]))
  const schema = metadataMap.get('schema_version')
  const contactAdapter = metadataMap.get('contact_adapter')
  const bucketNames = new Set(buckets.map(({ id }) => id))
  const missingBuckets = expectedStorageBuckets.filter((bucket) => !bucketNames.has(bucket))
  const failedMedia = mediaJobs.filter(({ status }) => status === 'failed').length
  const activeMedia = mediaJobs.filter(({ status }) =>
    ['pending', 'processing'].includes(status),
  ).length
  const failedDocuments = documentJobs.filter(({ status }) => status === 'failed').length
  const activeDocuments = documentJobs.filter(({ status }) =>
    ['queued', 'processing'].includes(status),
  ).length
  const latestSetup = recordedChecks.find(({ id }) => id === 'setup.local')
  const generatedAt = new Date().toISOString()

  const checks: OperationalCheck[] = [
    operationalCheck(
      'database.schema',
      'Database migration',
      schema?.value === '20260715070000' ? 'pass' : 'fail',
      schema?.value === '20260715070000'
        ? 'The expected application schema is installed.'
        : 'The installed schema does not match this application release.',
      schema?.value === '20260715070000' ? null : 'Apply the current Supabase migrations.',
      schema?.updated_at ?? generatedAt,
    ),
    operationalCheck(
      'storage.buckets',
      'Storage',
      missingBuckets.length === 0 ? 'pass' : 'fail',
      missingBuckets.length === 0
        ? 'All seven application storage boundaries are present.'
        : `${missingBuckets.length} required storage ${missingBuckets.length === 1 ? 'boundary is' : 'boundaries are'} missing.`,
      missingBuckets.length === 0 ? null : 'Reapply storage migrations before accepting uploads.',
    ),
    operationalCheck(
      'workers.media',
      'Audio processing worker',
      failedMedia > 0 ? 'fail' : activeMedia > 0 ? 'action_required' : 'pass',
      failedMedia > 0
        ? `${failedMedia} media ${failedMedia === 1 ? 'job needs' : 'jobs need'} attention.`
        : activeMedia > 0
          ? `${activeMedia} media ${activeMedia === 1 ? 'job is' : 'jobs are'} awaiting completion.`
          : 'No failed or unfinished audio-processing jobs are present.',
      failedMedia > 0 || activeMedia > 0
        ? 'Run the supported media worker and review its redacted result.'
        : null,
    ),
    operationalCheck(
      'workers.documents',
      'License document worker',
      failedDocuments > 0 ? 'fail' : activeDocuments > 0 ? 'action_required' : 'pass',
      failedDocuments > 0
        ? `${failedDocuments} document ${failedDocuments === 1 ? 'job needs' : 'jobs need'} attention.`
        : activeDocuments > 0
          ? `${activeDocuments} document ${activeDocuments === 1 ? 'job is' : 'jobs are'} awaiting completion.`
          : 'No failed or unfinished license-document jobs are present.',
      failedDocuments > 0 || activeDocuments > 0
        ? 'Run the supported document worker and review its redacted result.'
        : null,
    ),
    operationalCheck(
      'commerce.webhooks',
      'Payment webhooks',
      webhookFailures.length === 0 ? 'pass' : 'fail',
      webhookFailures.length === 0
        ? 'No unresolved payment webhook failures are present.'
        : `${webhookFailures.length} payment ${webhookFailures.length === 1 ? 'event needs' : 'events need'} replay or review.`,
      webhookFailures.length === 0
        ? null
        : 'Review and replay the failed event from Commerce administration.',
    ),
    operationalCheck(
      'commerce.stripe',
      'Stripe test connection',
      config.stripeSecretKey && config.stripeWebhookSecret ? 'pass' : 'action_required',
      config.stripeSecretKey && config.stripeWebhookSecret
        ? 'Both server-only Stripe test settings are present.'
        : 'The local payment simulation is active; Stripe test settings are not both present.',
      config.stripeSecretKey && config.stripeWebhookSecret
        ? null
        : 'Add both Stripe test settings when validating hosted checkout.',
    ),
    operationalCheck(
      'contact.adapter',
      'Contact delivery adapter',
      contactAdapter?.value === 'local_capture' ? 'action_required' : 'pass',
      contactAdapter?.value === 'local_capture'
        ? 'Messages are captured in artist administration for this local installation.'
        : 'A deployed contact delivery adapter is recorded.',
      contactAdapter?.value === 'local_capture'
        ? 'Choose and verify a delivery adapter before relying on hosted notifications.'
        : null,
      contactAdapter?.updated_at ?? generatedAt,
    ),
    operationalCheck(
      'setup.local',
      'Latest setup verification',
      latestSetup?.status ?? 'action_required',
      latestSetup?.summary ?? 'No recorded setup verification is available yet.',
      latestSetup ? null : 'Run npm run setup:check.',
      latestSetup?.checked_at ?? generatedAt,
    ),
  ]

  const overall = checks.reduce<OperationalCheck['status']>(
    (current, check) => (statusRank(check.status) > statusRank(current) ? check.status : current),
    'pass',
  )
  return { generatedAt, overall, checks }
}
