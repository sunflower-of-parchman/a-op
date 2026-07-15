import assert from 'node:assert/strict'
import { run } from './lib/command.mjs'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { getLocalStatus, safeSupabaseError } from './lib/local-supabase.mjs'

const ids = {
  first: '90000000-0000-4000-8000-000000000001',
  implied: '90000000-0000-4000-8000-000000000002',
  disabled: '90000000-0000-4000-8000-000000000003',
  old: '90000000-0000-4000-8000-000000000004',
  session: '90000000-0000-4000-8000-000000000005',
}

try {
  const { admin, anonymous, authenticated } = await getAuthorityTestContext()
  const owner = authenticated.owner
  const { data: original, error: originalError } = await admin
    .from('telemetry_settings')
    .select('*')
    .eq('id', 'primary')
    .single()
  requireNoError(originalError, 'Telemetry settings lookup failed')
  requireNoError(
    (await admin.from('analytics_events').delete().gte('occurred_at', '1900-01-01')).error,
    'Event cleanup failed',
  )

  for (const [label, client] of [
    ['anonymous', anonymous],
    ['owner', owner.client],
  ]) {
    const { error } = await client.from('analytics_events').select('id').limit(1)
    assert.ok(error, `${label} read raw optional analytics events`)
    const { error: operationError } = await client.from('operational_events').select('id').limit(1)
    assert.ok(operationError, `${label} read raw operational history`)
  }

  const { data: collected, error: collectionError } = await admin.rpc('record_analytics_event', {
    p_event_id: ids.first,
    p_event_name: 'page_view',
    p_session_id: ids.session,
    p_path: '/music',
    p_resource_type: 'page',
    p_resource_key: 'music',
    p_value: null,
    p_consent_state: 'granted',
  })
  requireNoError(collectionError, 'Granted analytics event failed')
  assert.equal(collected, true)

  const { data: replayed } = await admin.rpc('record_analytics_event', {
    p_event_id: ids.first,
    p_event_name: 'page_view',
    p_session_id: ids.session,
    p_path: '/music',
    p_resource_type: 'page',
    p_resource_key: 'music',
    p_value: null,
    p_consent_state: 'granted',
  })
  assert.equal(replayed, false)

  const { data: implied } = await admin.rpc('record_analytics_event', {
    p_event_id: ids.implied,
    p_event_name: 'catalog_search',
    p_session_id: ids.session,
    p_path: '/music',
    p_resource_type: null,
    p_resource_key: null,
    p_value: 3,
    p_consent_state: 'implied',
  })
  assert.equal(implied, false, 'Opt-in mode accepted an implied-consent event')

  requireNoError(
    (
      await admin.rpc('save_telemetry_settings', {
        p_actor_id: owner.user.id,
        p_optional_enabled: false,
        p_consent_mode: original.consent_mode,
        p_retention_days: original.retention_days,
        p_meaningful_listen_seconds: original.meaningful_listen_seconds,
      })
    ).error,
    'Owner could not disable optional analytics',
  )
  const { data: disabled } = await admin.rpc('record_analytics_event', {
    p_event_id: ids.disabled,
    p_event_name: 'page_view',
    p_session_id: ids.session,
    p_path: '/',
    p_resource_type: 'page',
    p_resource_key: 'home',
    p_value: null,
    p_consent_state: 'granted',
  })
  assert.equal(disabled, false, 'Disabled analytics accepted an event')

  requireNoError(
    (
      await admin.rpc('save_telemetry_settings', {
        p_actor_id: owner.user.id,
        p_optional_enabled: original.optional_enabled,
        p_consent_mode: original.consent_mode,
        p_retention_days: original.retention_days,
        p_meaningful_listen_seconds: original.meaningful_listen_seconds,
      })
    ).error,
    'Telemetry settings restore failed',
  )

  requireNoError(
    (
      await admin.from('analytics_events').insert({
        id: ids.old,
        event_name: 'page_view',
        session_id: ids.session,
        path: '/old',
        resource_type: 'page',
        resource_key: 'old',
        consent_state: 'granted',
        occurred_at: '2020-01-01T00:00:00.000Z',
      })
    ).error,
    'Expired event fixture failed',
  )
  const { data: pruned, error: pruneError } = await admin.rpc('prune_analytics_events')
  requireNoError(pruneError, 'Retention pruning failed')
  assert.ok(pruned >= 1)

  const { error: operationError } = await admin.rpc('record_operational_event', {
    p_event_name: 'setup_health',
    p_check_key: 'setup.local',
    p_status: 'pass',
    p_summary: 'Telemetry verification setup check passed.',
    p_safe_details: { schemaVersion: '20260715070000', storageBoundaries: 7 },
  })
  requireNoError(operationError, 'Operational event recording failed')
  const { data: currentCheck, error: currentCheckError } = await admin
    .from('operational_checks')
    .select('status, summary')
    .eq('id', 'setup.local')
    .single()
  requireNoError(currentCheckError, 'Operational current-state lookup failed')
  assert.equal(currentCheck.status, 'pass')

  const diagnostic = run(process.execPath, ['scripts/diagnose.mjs', '--json'], { capture: true })
  const output = diagnostic.stdout
  const status = getLocalStatus()
  assert.doesNotThrow(() => JSON.parse(output))
  assert.ok(!output.includes(status.apiUrl), 'Diagnostic exposed the database URL')
  assert.ok(!output.includes(status.secretKey), 'Diagnostic exposed the service credential')
  assert.ok(!output.includes(owner.account.email), 'Diagnostic exposed an account email')
  assert.ok(!output.includes(ids.session), 'Diagnostic exposed a raw session identifier')

  requireNoError(
    (await admin.from('analytics_events').delete().gte('occurred_at', '1900-01-01')).error,
    'Final event cleanup failed',
  )
  console.log('Privacy-conscious telemetry and redacted diagnostics: PASS')
} catch (error) {
  console.error(
    `Privacy-conscious telemetry and redacted diagnostics: FAIL\n${safeSupabaseError(error)}`,
  )
  process.exit(1)
}
