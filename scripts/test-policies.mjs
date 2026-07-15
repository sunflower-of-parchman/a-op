import assert from 'node:assert/strict'
import { demoFixtureIds, safeSupabaseError } from './lib/local-supabase.mjs'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'

try {
  const { anonymous, admin, authenticated } = await getAuthorityTestContext()
  const owner = authenticated.owner
  const editor = authenticated.editor
  const customerOne = authenticated.customerOne
  const customerTwo = authenticated.customerTwo

  const { data: published, error: publishedError } = await anonymous
    .from('releases')
    .select('id')
    .eq('id', demoFixtureIds.release)
  requireNoError(publishedError, 'Anonymous published-release query failed')
  assert.equal(published.length, 1)

  const { data: anonymousDrafts, error: anonymousDraftError } = await anonymous
    .from('releases')
    .select('id')
    .eq('state', 'draft')
  requireNoError(anonymousDraftError, 'Anonymous draft query failed')
  assert.equal(anonymousDrafts.length, 0)

  const roleExpectations = new Map([
    [owner, ['customer', 'owner']],
    [editor, ['customer', 'editor']],
    [customerOne, ['customer']],
    [customerTwo, ['customer']],
  ])
  for (const [identity, expected] of roleExpectations) {
    const { data, error } = await identity.client
      .from('app_roles')
      .select('role')
      .eq('user_id', identity.user.id)
      .order('role')
    requireNoError(error, `Role query failed for ${identity.account.key}`)
    assert.deepEqual(data.map(({ role }) => role).sort(), expected.sort())
  }

  const testReleaseId = '20000000-0000-4000-8000-000000000001'
  const { error: ownerCreateError } = await owner.client.from('releases').insert({
    id: testReleaseId,
    slug: 'policy-owner-draft',
    title: 'Owner policy draft',
    state: 'draft',
    created_by: owner.user.id,
  })
  requireNoError(ownerCreateError, 'Owner could not create content')

  const editorReleaseId = '20000000-0000-4000-8000-000000000002'
  const { error: editorCreateError } = await editor.client.from('releases').insert({
    id: editorReleaseId,
    slug: 'policy-editor-draft',
    title: 'Editor policy draft',
    state: 'draft',
    created_by: editor.user.id,
  })
  requireNoError(editorCreateError, 'Editor could not create content')

  const { error: customerCreateError } = await customerOne.client.from('releases').insert({
    slug: 'customer-must-not-create',
    title: 'Customer content',
    state: 'draft',
    created_by: customerOne.user.id,
  })
  assert.ok(customerCreateError, 'Customer content insertion unexpectedly succeeded')

  const { error: editorPaymentError } = await editor.client.from('payment_events').insert({
    provider: 'simulation',
    provider_event_id: 'editor-must-not-write',
    customer_id: customerOne.user.id,
    product_id: demoFixtureIds.product,
    amount_minor: 1200,
    currency: 'USD',
  })
  assert.ok(editorPaymentError, 'Editor payment insertion unexpectedly succeeded')

  const draftConfigId = '20000000-0000-4000-8000-000000000003'
  const { error: draftConfigError } = await admin.from('site_config_versions').insert({
    id: draftConfigId,
    installation_key: 'primary',
    status: 'draft',
    config_schema_version: 1,
    config: { policyTest: true },
  })
  requireNoError(draftConfigError, 'Service role could not create a draft configuration')

  const { data: ownerConfigs, error: ownerConfigError } = await owner.client
    .from('site_config_versions')
    .select('id')
  requireNoError(ownerConfigError, 'Owner configuration query failed')
  assert.equal(ownerConfigs.length, 2)

  const { data: customerConfigs, error: customerConfigError } = await customerOne.client
    .from('site_config_versions')
    .select('id')
  requireNoError(customerConfigError, 'Customer configuration query failed')
  assert.equal(customerConfigs.length, 1)

  for (const [label, client] of [
    ['anonymous', anonymous],
    ['owner', owner.client],
    ['customer', customerOne.client],
  ]) {
    const { error: intentReadError } = await client.from('upload_intents').select('id').limit(1)
    assert.ok(intentReadError, `${label} read server-only upload intents`)
    const { error: releaseDraftReadError } = await client
      .from('release_drafts')
      .select('release_id')
      .limit(1)
    assert.ok(releaseDraftReadError, `${label} read server-only release drafts`)
    const { error: collectionDraftReadError } = await client
      .from('collection_drafts')
      .select('collection_id')
      .limit(1)
    assert.ok(collectionDraftReadError, `${label} read server-only collection drafts`)
  }

  const { data: ownerProfiles, error: ownerProfileError } = await owner.client
    .from('profiles')
    .select('id')
  requireNoError(ownerProfileError, 'Owner profile query failed')
  assert.equal(ownerProfiles.length, 4)

  const { data: crossProfile, error: crossProfileError } = await customerOne.client
    .from('profiles')
    .select('id')
    .eq('id', customerTwo.user.id)
  requireNoError(crossProfileError, 'Cross-profile denial query failed')
  assert.equal(crossProfile.length, 0)

  const { error: fulfillmentError } = await admin.rpc('process_simulated_payment_event', {
    p_provider_event_id: 'policy-customer-isolation',
    p_target_customer_id: customerOne.user.id,
    p_target_product_id: demoFixtureIds.product,
    p_paid_amount_minor: 1200,
    p_paid_currency: 'USD',
    p_event_payload: { test: 'policy' },
  })
  requireNoError(fulfillmentError, 'Policy-test fulfillment failed')

  const { data: firstCustomerOrders, error: firstOrderError } = await customerOne.client
    .from('orders')
    .select('id')
  requireNoError(firstOrderError, 'First customer order query failed')
  assert.equal(firstCustomerOrders.length, 1)

  const { data: secondCustomerOrders, error: secondOrderError } = await customerTwo.client
    .from('orders')
    .select('id')
  requireNoError(secondOrderError, 'Second customer order query failed')
  assert.equal(secondCustomerOrders.length, 0)

  const { data: serviceEvents, error: serviceEventError } = await admin
    .from('payment_events')
    .select('id')
    .eq('provider_event_id', 'policy-customer-isolation')
  requireNoError(serviceEventError, 'Service payment query failed')
  assert.equal(serviceEvents.length, 1)

  await admin.from('site_config_versions').delete().eq('id', draftConfigId)
  await admin.from('releases').delete().in('id', [testReleaseId, editorReleaseId])

  console.log('Database role policies: PASS (anonymous, customer, editor, owner, service role)')
} catch (error) {
  console.error(`Database role policies: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
