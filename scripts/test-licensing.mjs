import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { projectRoot, run } from './lib/command.mjs'
import { safeSupabaseError } from './lib/local-supabase.mjs'

const checkoutIntentId = '70000000-0000-4000-8000-000000000001'
const projectTitle = 'Licensing integration project'
const purchaseEventId = 'licensing-purchase-v1'
const refundEventId = 'licensing-refund-v1'
const providerPaymentId = 'sim-license-payment-v1'

async function cleanup(admin) {
  const { data: selections } = await admin
    .from('license_selections')
    .select('id')
    .eq('project_title', projectTitle)
  const selectionIds = selections?.map(({ id }) => id) ?? []
  const { data: issued } = selectionIds.length
    ? await admin
        .from('issued_licenses')
        .select('id, document_media_id')
        .in('selection_id', selectionIds)
    : { data: [] }
  const issuedIds = issued?.map(({ id }) => id) ?? []
  const mediaIds =
    issued?.flatMap(({ document_media_id }) => (document_media_id ? [document_media_id] : [])) ?? []

  const { data: paymentEvents } = await admin
    .from('payment_events')
    .select('id')
    .eq('provider', 'simulation')
    .in('provider_event_id', [purchaseEventId, refundEventId])
  const eventIds = paymentEvents?.map(({ id }) => id) ?? []
  const { data: orders } = eventIds.length
    ? await admin.from('orders').select('id').in('payment_event_id', eventIds)
    : { data: [] }
  const orderIds = orders?.map(({ id }) => id) ?? []

  const entitlementFilters = [
    issuedIds.length ? `and(source_type.eq.license,source_id.in.(${issuedIds.join(',')}))` : '',
    orderIds.length ? `and(source_type.eq.order,source_id.in.(${orderIds.join(',')}))` : '',
  ].filter(Boolean)
  const { data: entitlements } = entitlementFilters.length
    ? await admin.from('entitlement_grants').select('id').or(entitlementFilters.join(','))
    : { data: [] }
  const entitlementIds = entitlements?.map(({ id }) => id) ?? []
  if (entitlementIds.length) {
    await admin.from('download_records').delete().in('entitlement_id', entitlementIds)
  }
  if (mediaIds.length) await admin.from('download_records').delete().in('media_object_id', mediaIds)
  if (issuedIds.length) {
    await admin.from('license_document_jobs').delete().in('issued_license_id', issuedIds)
    await admin
      .from('entitlement_grants')
      .delete()
      .eq('source_type', 'license')
      .in('source_id', issuedIds)
    await admin.from('issued_licenses').delete().in('id', issuedIds)
  }
  if (mediaIds.length) {
    const { data: media } = await admin
      .from('media_objects')
      .select('bucket_id, object_path')
      .in('id', mediaIds)
    for (const item of media ?? [])
      await admin.storage.from(item.bucket_id).remove([item.object_path])
    await admin.from('media_objects').delete().in('id', mediaIds)
  }
  if (orderIds.length) {
    await admin.from('refunds').delete().in('order_id', orderIds)
    await admin
      .from('entitlement_grants')
      .delete()
      .eq('source_type', 'order')
      .in('source_id', orderIds)
    await admin.from('order_items').delete().in('order_id', orderIds)
    await admin.from('orders').delete().in('id', orderIds)
  }
  await admin.from('checkout_intents').delete().eq('id', checkoutIntentId)
  if (eventIds.length) await admin.from('payment_events').delete().in('id', eventIds)
  if (selectionIds.length) await admin.from('license_selections').delete().in('id', selectionIds)
}

const workspace = await mkdtemp(join(tmpdir(), 'artist-license-test-'))
try {
  const { status, admin, authenticated } = await getAuthorityTestContext()
  const customerOne = authenticated.customerOne
  const customerTwo = authenticated.customerTwo
  await cleanup(admin)

  const { data: offer, error: offerError } = await admin
    .from('license_offers')
    .select('id, product_id, price_id, template_version_id, option_id')
    .eq('state', 'published')
    .order('created_at')
    .limit(1)
    .single()
  requireNoError(offerError, 'Published license offer lookup failed')
  const { data: option, error: optionError } = await admin
    .from('license_options')
    .select('label, amount_minor, currency, exclusive')
    .eq('id', offer.option_id)
    .single()
  requireNoError(optionError, 'License option lookup failed')
  assert.equal(option.exclusive, false)

  const { data: selectionRows, error: selectionError } = await admin.rpc(
    'create_license_selection',
    {
      p_subject_id: customerOne.user.id,
      p_offer_id: offer.id,
      p_licensee_name: 'Daybreak Dance Project',
      p_project_title: projectTitle,
      p_project_description:
        'A fictional independent dance film study made solely for the licensing integration test.',
    },
  )
  requireNoError(selectionError, 'License selection creation failed')
  const selection = selectionRows[0]
  assert.equal(selection.amount_minor, option.amount_minor)
  assert.equal(selection.currency, option.currency)

  const { data: selectionRecord, error: selectionReadError } = await admin
    .from('license_selections')
    .select('terms_snapshot')
    .eq('id', selection.selection_id)
    .single()
  requireNoError(selectionReadError, 'License terms snapshot read failed')

  const { error: intentError } = await admin.from('checkout_intents').insert({
    id: checkoutIntentId,
    subject_id: customerOne.user.id,
    product_id: selection.product_id,
    price_id: selection.price_id,
    license_selection_id: selection.selection_id,
    provider: 'simulation',
    provider_session_id: `sim_${checkoutIntentId}`,
  })
  requireNoError(intentError, 'License checkout intent creation failed')

  let orderId
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin.rpc('process_commerce_payment_event', {
      p_provider: 'simulation',
      p_provider_event_id: purchaseEventId,
      p_target_customer_id: customerOne.user.id,
      p_target_product_id: selection.product_id,
      p_target_price_id: selection.price_id,
      p_paid_amount_minor: selection.amount_minor,
      p_paid_currency: selection.currency,
      p_checkout_intent_id: checkoutIntentId,
      p_provider_payment_id: providerPaymentId,
      p_provider_customer_id: `sim-customer:${customerOne.user.id}`,
      p_event_payload: { eventType: 'simulation.checkout.completed', objectId: checkoutIntentId },
    })
    requireNoError(error, `License fulfillment attempt ${attempt + 1} failed`)
    orderId = data[0].order_id
    assert.equal(data[0].replayed, attempt > 0)
  }

  const { data: issuedRows, error: issuedError } = await admin
    .from('issued_licenses')
    .select('id, terms_snapshot, status, document_status')
    .eq('selection_id', selection.selection_id)
  requireNoError(issuedError, 'Issued license lookup failed')
  assert.equal(issuedRows.length, 1)
  const issued = issuedRows[0]
  assert.deepEqual(issued.terms_snapshot, selectionRecord.terms_snapshot)
  assert.equal(issued.status, 'active')
  assert.equal(issued.document_status, 'queued')

  const { data: documentJobs } = await admin
    .from('license_document_jobs')
    .select('id')
    .eq('issued_license_id', issued.id)
  assert.equal(documentJobs.length, 1)
  const { data: otherCustomerLicenses, error: otherCustomerError } = await customerTwo.client
    .from('issued_licenses')
    .select('id')
    .eq('id', issued.id)
  requireNoError(otherCustomerError, 'Cross-account license isolation query failed')
  assert.equal(otherCustomerLicenses.length, 0)

  const localPython = resolve(
    projectRoot,
    '.venv-documents',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  )
  const python =
    process.env.LICENSE_DOCUMENT_PYTHON ?? (existsSync(localPython) ? localPython : 'python3')
  const worker = run(
    process.execPath,
    ['--experimental-strip-types', 'workers/documents/index.ts'],
    {
      capture: true,
      cwd: projectRoot,
      env: {
        ...process.env,
        NUXT_PUBLIC_SUPABASE_URL: status.apiUrl,
        NUXT_SUPABASE_SECRET_KEY: status.secretKey,
        LICENSE_DOCUMENT_PYTHON: python,
        LICENSE_DOCUMENT_WORKER_ID: 'integration-document-worker',
      },
    },
  )
  const workerOutput = `${worker.stdout}\n${worker.stderr}`
  assert.match(workerOutput, /"event":"license-document-ready"/)
  assert.ok(!workerOutput.includes(status.secretKey), 'Document worker logs exposed the server key')
  assert.ok(!workerOutput.includes(workspace), 'Document worker logs exposed a temporary path')

  const { data: readyLicense, error: readyError } = await admin
    .from('issued_licenses')
    .select('document_status, document_media_id')
    .eq('id', issued.id)
    .single()
  requireNoError(readyError, 'Completed license document lookup failed')
  assert.equal(readyLicense.document_status, 'ready')
  assert.ok(readyLicense.document_media_id)
  const { data: media, error: mediaError } = await admin
    .from('media_objects')
    .select('bucket_id, object_path, media_type, sha256')
    .eq('id', readyLicense.document_media_id)
    .single()
  requireNoError(mediaError, 'License document media lookup failed')
  assert.equal(media.media_type, 'application/pdf')
  assert.match(media.sha256, /^[a-f0-9]{64}$/)
  const { data: blob, error: blobError } = await admin.storage
    .from(media.bucket_id)
    .download(media.object_path)
  requireNoError(blobError, 'License document storage download failed')
  const pdf = Buffer.from(await blob.arrayBuffer())
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.byteLength > 4000)

  const pdfPath = join(workspace, 'issued-license.pdf')
  await writeFile(pdfPath, pdf)
  const extracted = run(
    python,
    [
      '-c',
      'import sys; from pypdf import PdfReader; print("\\n".join((p.extract_text() or "") for p in PdfReader(sys.argv[1]).pages))',
      pdfPath,
    ],
    { capture: true },
  ).stdout
  assert.match(extracted, /Daybreak Dance Project/)
  assert.match(extracted, /Licensing integration project/)
  assert.match(extracted, new RegExp(option.label))
  assert.match(extracted, /Non-exclusive/)

  const immutableVersion = await admin
    .from('license_template_versions')
    .update({ title: 'Mutation must fail' })
    .eq('id', offer.template_version_id)
  assert.ok(immutableVersion.error, 'An issued license template version was mutated')

  const { data: refundRows, error: refundError } = await admin.rpc('process_refund_event', {
    p_provider: 'simulation',
    p_provider_event_id: refundEventId,
    p_provider_refund_id: 'sim-license-refund-v1',
    p_provider_payment_id: providerPaymentId,
    p_refund_amount_minor: selection.amount_minor,
    p_refund_status: 'succeeded',
    p_refund_reason: 'requested_by_customer',
    p_event_payload: { eventType: 'simulation.refund.updated', objectId: 'sim-license-refund-v1' },
  })
  requireNoError(refundError, 'License refund failed')
  assert.equal(refundRows[0].order_id, orderId)
  const { data: accessAfterRefund, error: accessError } = await admin.rpc('decide_access', {
    target_subject_id: customerOne.user.id,
    target_resource_type: 'issued_license',
    target_resource_id: issued.id,
  })
  requireNoError(accessError, 'Refunded license access decision failed')
  assert.equal(accessAfterRefund.allowed, false)
  assert.equal(accessAfterRefund.reason, 'revoked')

  console.log(
    'Music licensing: PASS (immutable terms, replay-safe issue, private PDF, isolation, refund revocation)',
  )
} catch (error) {
  console.error(
    `Music licensing: FAIL\n${error instanceof Error && error.stack ? error.stack : safeSupabaseError(error)}`,
  )
  process.exitCode = 1
} finally {
  try {
    const { admin } = await getAuthorityTestContext()
    await cleanup(admin)
  } catch {
    // Preserve the primary failure while leaving the next run's opening cleanup able to recover.
  }
  await rm(workspace, { recursive: true, force: true })
}
