import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { runSupabase } from './lib/command.mjs'
import {
  createAdminClient,
  getLocalStatus,
  recoverLocalAuthGateway,
  seedAuthorizationDemonstration,
  seedDemonstrationArtist,
  verifyAuthorizationDemonstration,
  verifyPublicDemonstration,
} from './lib/local-supabase.mjs'
import {
  assertConfirmation,
  assertFixtureAccountSet,
  assertHostedTarget,
  assertProjectMarker,
  buildFixtureFingerprint,
  confirmationForProjectRef,
  createHostedSqlExecutor,
  listAuthUsers,
  performHostedReset,
  readProviderMappings,
} from './lib/hosted-reset.mjs'

const projectRef = 'abcdefghijklmnopqrst'
const fixture = {
  localOnly: false,
  projectRef,
  accounts: [
    {
      key: 'owner',
      email: 'owner@judge.example',
      password: 'Judge-Owner-Private-2026!',
      displayName: 'Daymark Owner',
      role: 'owner',
    },
    {
      key: 'editor',
      email: 'editor@judge.example',
      password: 'Judge-Editor-Private-2026!',
      displayName: 'Daymark Editor',
      role: 'editor',
    },
    {
      key: 'customerOne',
      email: 'listener-one@judge.example',
      password: 'Judge-Listener-One-2026!',
      displayName: 'Listener One',
      role: 'customer',
    },
    {
      key: 'customerTwo',
      email: 'listener-two@judge.example',
      password: 'Judge-Listener-Two-2026!',
      displayName: 'Listener Two',
      role: 'customer',
    },
  ],
}

function expectRefusal(callback, pattern) {
  assert.throws(callback, pattern)
}

expectRefusal(
  () =>
    assertHostedTarget({
      status: {
        apiUrl: 'http://127.0.0.1:54321',
        publishableKey: 'local-publishable',
        secretKey: 'local-secret',
      },
      projectRef,
      linkedProjectRef: projectRef,
    }),
  /local Supabase target is not permitted/,
)
expectRefusal(
  () =>
    assertHostedTarget({
      status: {
        apiUrl: 'http://127.0.0.1:54321',
        publishableKey: 'local-publishable',
        secretKey: 'local-secret',
      },
      projectRef,
      linkedProjectRef: 'zyxwvutsrqponmlkjihg',
      allowLocalTest: true,
    }),
  /linked Supabase project does not match/,
)
expectRefusal(
  () => assertConfirmation('reset', projectRef, 'RESET-wrong'),
  /exact derived confirmation/,
)
expectRefusal(
  () => assertProjectMarker(new Map([['judging_project_ref_sha256', 'wrong']]), projectRef),
  /project marker does not match/,
)
expectRefusal(
  () => assertFixtureAccountSet([{ email: 'intruder@judge.example' }], fixture),
  /not the exact fixture set/,
)

let localStatus
async function runHostedResetContract() {
  runSupabase(['start', '--exclude', 'studio'], { capture: true })
  runSupabase(['db', 'reset', '--local'], { capture: true })
  localStatus = getLocalStatus()
  await recoverLocalAuthGateway(localStatus)

  const executeSql = createHostedSqlExecutor({ target: 'local' })
  const preflightAdmin = createAdminClient(localStatus)
  const { error: unexpectedStorageError } = await preflightAdmin.storage
    .from('administrative')
    .upload('unexpected-before-initialize.txt', Buffer.from('unexpected'), { upsert: true })
  assert.ifError(unexpectedStorageError)
  await assert.rejects(
    performHostedReset({
      operation: 'initialize',
      projectRef,
      confirmation: confirmationForProjectRef('initialize', projectRef),
      fixture,
      status: localStatus,
      linkedProjectRef: projectRef,
      executeSql,
      allowLocalTest: true,
    }),
    /dedicated storage buckets are not empty/,
  )
  const { error: unexpectedStorageRemovalError } = await preflightAdmin.storage
    .from('administrative')
    .remove(['unexpected-before-initialize.txt'])
  assert.ifError(unexpectedStorageRemovalError)

  const initialize = await performHostedReset({
    operation: 'initialize',
    projectRef,
    confirmation: confirmationForProjectRef('initialize', projectRef),
    fixture,
    status: localStatus,
    linkedProjectRef: projectRef,
    executeSql,
    allowLocalTest: true,
  })
  assert.equal(initialize.status, 'pass')
  assert.equal(initialize.accountCount, 4)
  assert.ok(initialize.storageObjectCount > 0)

  const admin = createAdminClient(localStatus)
  const { data: stripeProducts, error: productError } = await admin
    .from('products')
    .select('id,slug')
    .eq('purchase_mode', 'stripe')
  assert.ifError(productError)
  assert.ok((stripeProducts ?? []).length >= 3)

  for (const product of stripeProducts ?? []) {
    const { data: prices, error: priceReadError } = await admin
      .from('prices')
      .select('id')
      .eq('product_id', product.id)
    assert.ifError(priceReadError)
    for (const price of prices ?? []) {
      const safeSlug = product.slug.replace(/[^a-z0-9]/g, '_')
      const { error: mappingError } = await admin
        .from('prices')
        .update({
          external_product_id: `prod_test_${safeSlug}`,
          external_price_id: `price_test_${safeSlug}`,
        })
        .eq('id', price.id)
      assert.ifError(mappingError)
    }
  }

  const expectedMappings = await readProviderMappings(admin)
  assert.ok(expectedMappings.length >= 3)
  const expectedFingerprint = await buildFixtureFingerprint(admin)
  assert.equal(expectedFingerprint, initialize.fixtureFingerprint)

  const { error: driftError } = await admin
    .from('pages')
    .update({ title: 'Unexpected fixture drift' })
    .eq('slug', 'about')
  assert.ifError(driftError)
  await assert.rejects(
    performHostedReset({
      operation: 'check',
      projectRef,
      fixture,
      status: localStatus,
      linkedProjectRef: projectRef,
      executeSql,
      allowLocalTest: true,
    }),
    /fixture data fingerprint is not recognized/,
  )
  const { error: driftRestoreError } = await admin
    .from('pages')
    .update({ title: 'About Daymark Assembly' })
    .eq('slug', 'about')
  assert.ifError(driftRestoreError)

  const { error: transactionalDocumentError } = await admin.from('media_objects').insert({
    kind: 'license_document',
    bucket_id: 'licenses',
    object_path: 'hosted-reset-proof/transactional-license.pdf',
    media_type: 'application/pdf',
    byte_size: 128,
    sha256: 'a'.repeat(64),
    status: 'ready',
    is_public: false,
    metadata: { fixture: false, transactional: true },
  })
  assert.ifError(transactionalDocumentError)
  assert.equal(
    await buildFixtureFingerprint(admin),
    expectedFingerprint,
    'Transactional license documents must not look like artist catalog drift',
  )

  async function createRepresentativeState() {
    const { error } = await admin.from('analytics_events').insert({
      id: randomUUID(),
      event_name: 'page_view',
      session_id: randomUUID(),
      path: '/judge-dirty-state',
      consent_state: 'implied',
    })
    assert.ifError(error)
  }

  await createRepresentativeState()
  const initialUsers = await listAuthUsers(admin)
  const firstReset = await performHostedReset({
    operation: 'reset',
    projectRef,
    confirmation: confirmationForProjectRef('reset', projectRef),
    fixture,
    status: localStatus,
    linkedProjectRef: projectRef,
    executeSql,
    allowLocalTest: true,
  })
  assert.equal(firstReset.status, 'pass')
  assert.equal(firstReset.fixtureFingerprint, expectedFingerprint)
  assert.equal(firstReset.sessionsRotated, true)
  assert.ok(firstReset.storageObjectCount > 0)
  assert.ok(firstReset.removedStorageObjectCount > 0)
  assert.deepEqual(await readProviderMappings(admin), expectedMappings)

  const firstUsers = await listAuthUsers(admin)
  assert.equal(
    firstUsers.some((user) => initialUsers.some((prior) => prior.id === user.id)),
    false,
  )

  await createRepresentativeState()
  const secondReset = await performHostedReset({
    operation: 'reset',
    projectRef,
    confirmation: confirmationForProjectRef('reset', projectRef),
    fixture,
    status: localStatus,
    linkedProjectRef: projectRef,
    executeSql,
    allowLocalTest: true,
  })
  assert.equal(secondReset.fixtureFingerprint, firstReset.fixtureFingerprint)
  assert.equal(secondReset.sessionsRotated, true)
  assert.deepEqual(await readProviderMappings(admin), expectedMappings)

  const secondUsers = await listAuthUsers(admin)
  assert.equal(
    secondUsers.some((user) => firstUsers.some((prior) => prior.id === user.id)),
    false,
  )

  const check = await performHostedReset({
    operation: 'check',
    projectRef,
    fixture,
    status: localStatus,
    linkedProjectRef: projectRef,
    executeSql,
    allowLocalTest: true,
  })
  assert.equal(check.fixtureFingerprint, secondReset.fixtureFingerprint)
  assert.equal(check.accountCount, 4)
}

async function restoreLocalDemonstration() {
  if (!localStatus) return
  runSupabase(['db', 'reset', '--local'], { capture: true })
  const restoredStatus = getLocalStatus()
  await recoverLocalAuthGateway(restoredStatus)
  await seedDemonstrationArtist(restoredStatus, { attempts: 60 })
  await seedAuthorizationDemonstration(restoredStatus)
  await verifyPublicDemonstration(restoredStatus)
  await verifyAuthorizationDemonstration(restoredStatus)
}

let primaryError
try {
  await runHostedResetContract()
} catch (error) {
  primaryError = error
}

let cleanupError
try {
  await restoreLocalDemonstration()
} catch (error) {
  cleanupError = error
}

if (primaryError && cleanupError) {
  throw new AggregateError(
    [primaryError, cleanupError],
    'Hosted reset contract and local demonstration restoration both failed.',
    { cause: primaryError },
  )
}
if (primaryError) throw primaryError
if (cleanupError) throw cleanupError

console.log(
  'Hosted reset contract: PASS (target and fingerprint refusals, initialization, two idempotent resets, identity rotation, provider preservation)',
)
