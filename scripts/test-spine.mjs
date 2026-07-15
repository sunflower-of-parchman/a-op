import assert from 'node:assert/strict'
import { demoFixtureIds, safeSupabaseError } from './lib/local-supabase.mjs'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'

try {
  const { status, anonymous, admin, authenticated } = await getAuthorityTestContext()
  const customerOne = authenticated.customerOne
  const customerTwo = authenticated.customerTwo

  const { data: media, error: mediaError } = await anonymous
    .from('media_objects')
    .select('bucket_id, object_path')
    .eq('id', demoFixtureIds.preview)
    .single()
  requireNoError(mediaError, 'The public preview record could not be read')

  const previewUrl = `${status.apiUrl}/storage/v1/object/public/${media.bucket_id}/${media.object_path}`
  const previewResponse = await fetch(previewUrl)
  assert.equal(previewResponse.status, 200)
  const preview = Buffer.from(await previewResponse.arrayBuffer())
  assert.equal(preview.subarray(0, 4).toString('ascii'), 'RIFF')

  const replays = []
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await admin.rpc('process_simulated_payment_event', {
      p_provider_event_id: 'gate-a-idempotency',
      p_target_customer_id: customerOne.user.id,
      p_target_product_id: demoFixtureIds.product,
      p_paid_amount_minor: 1200,
      p_paid_currency: 'USD',
      p_event_payload: { signed: true, attempt },
    })
    requireNoError(error, `Fulfillment attempt ${attempt + 1} failed`)
    replays.push(data[0])
  }
  assert.equal(replays[0].replayed, false)
  assert.ok(replays.slice(1).every(({ replayed }) => replayed))

  const { data: events, error: eventsError } = await admin
    .from('payment_events')
    .select('id')
    .eq('provider_event_id', 'gate-a-idempotency')
  requireNoError(eventsError, 'Payment event count failed')
  assert.equal(events.length, 1)

  const eventId = events[0].id
  const { data: orders, error: ordersError } = await admin
    .from('orders')
    .select('id')
    .eq('payment_event_id', eventId)
  requireNoError(ordersError, 'Order count failed')
  assert.equal(orders.length, 1)

  const { data: entitlements, error: entitlementError } = await admin
    .from('entitlement_grants')
    .select('id')
    .eq('subject_id', customerOne.user.id)
    .eq('resource_type', 'release')
    .eq('resource_id', demoFixtureIds.release)
    .eq('source_id', orders[0].id)
  requireNoError(entitlementError, 'Entitlement count failed')
  assert.equal(entitlements.length, 1)

  const [{ data: allowed, error: allowedError }, { data: denied, error: deniedError }] =
    await Promise.all([
      admin.rpc('decide_access', {
        target_subject_id: customerOne.user.id,
        target_resource_type: 'release',
        target_resource_id: demoFixtureIds.release,
      }),
      admin.rpc('decide_access', {
        target_subject_id: customerTwo.user.id,
        target_resource_type: 'release',
        target_resource_id: demoFixtureIds.release,
      }),
    ])
  requireNoError(allowedError, 'Entitled access decision failed')
  requireNoError(deniedError, 'Unentitled access decision failed')
  assert.equal(allowed.allowed, true)
  assert.equal(denied.allowed, false)

  const { data: download, error: downloadError } = await admin
    .from('media_objects')
    .select('bucket_id, object_path')
    .eq('id', demoFixtureIds.download)
    .single()
  requireNoError(downloadError, 'Private download lookup failed')
  const { data: signed, error: signedError } = await admin.storage
    .from(download.bucket_id)
    .createSignedUrl(download.object_path, 60)
  requireNoError(signedError, 'Signed URL creation failed')
  const signedResponse = await fetch(signed.signedUrl)
  assert.equal(signedResponse.status, 200)
  assert.match(await signedResponse.text(), /local demonstration download/)

  console.log(
    'Authority and fulfillment spine: PASS (one event, one order, one entitlement, one allow, one denial)',
  )
} catch (error) {
  console.error(`Authority and fulfillment spine: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
