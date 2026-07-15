import assert from 'node:assert/strict'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { demoFixtureIds, safeSupabaseError } from './lib/local-supabase.mjs'

const testIds = {
  draftTrack: '50000000-0000-4000-8000-000000000001',
  playlist: '50000000-0000-4000-8000-000000000002',
  history: '50000000-0000-4000-8000-000000000003',
  source: '50000000-0000-4000-8000-000000000004',
  job: '50000000-0000-4000-8000-000000000005',
  derivative: '50000000-0000-4000-8000-000000000006',
  duplicateDerivative: '50000000-0000-4000-8000-000000000007',
}

try {
  const { anonymous, admin, authenticated } = await getAuthorityTestContext()
  const editor = authenticated.editor
  const customerOne = authenticated.customerOne
  const customerTwo = authenticated.customerTwo

  const { data: releaseOrder, error: releaseOrderError } = await anonymous
    .from('release_tracks')
    .select('track_id, position')
    .eq('release_id', demoFixtureIds.release)
    .order('position')
  requireNoError(releaseOrderError, 'Public release ordering failed')
  assert.deepEqual(
    releaseOrder.map(({ track_id }) => track_id),
    [demoFixtureIds.trackOne, demoFixtureIds.trackTwo, demoFixtureIds.trackThree],
  )

  const { data: collectionOrder, error: collectionOrderError } = await anonymous
    .from('collection_tracks')
    .select('track_id, position')
    .eq('collection_id', demoFixtureIds.collection)
    .order('position')
  requireNoError(collectionOrderError, 'Public collection ordering failed')
  assert.deepEqual(
    collectionOrder.map(({ track_id }) => track_id),
    [demoFixtureIds.trackThree, demoFixtureIds.trackOne],
  )

  await admin.from('tracks').delete().eq('id', testIds.draftTrack)
  const { error: draftInsertError } = await editor.client.from('tracks').insert({
    id: testIds.draftTrack,
    slug: 'catalog-authority-draft',
    title: 'Catalog authority draft',
    description: 'A private catalog fixture.',
    state: 'draft',
    created_by: editor.user.id,
  })
  requireNoError(draftInsertError, 'Editor draft creation failed')
  const { error: draftUpdateError } = await editor.client
    .from('tracks')
    .update({ title: 'Catalog authority draft, revised' })
    .eq('id', testIds.draftTrack)
  requireNoError(draftUpdateError, 'Editor draft update failed')
  const { data: anonymousDraft, error: anonymousDraftError } = await anonymous
    .from('tracks')
    .select('id')
    .eq('id', testIds.draftTrack)
  requireNoError(anonymousDraftError, 'Anonymous draft query failed')
  assert.equal(anonymousDraft.length, 0)
  const { error: customerTrackError } = await customerOne.client.from('tracks').insert({
    slug: 'customer-must-not-create-tracks',
    title: 'Unauthorized catalog entry',
  })
  assert.ok(customerTrackError, 'A customer created a catalog track')

  await admin.from('playlists').delete().eq('id', testIds.playlist)
  const { error: playlistError } = await customerOne.client.from('playlists').insert({
    id: testIds.playlist,
    owner_id: customerOne.user.id,
    title: 'Private movement queue',
  })
  requireNoError(playlistError, 'Customer playlist creation failed')
  const { error: playlistTrackError } = await customerOne.client.from('playlist_tracks').insert({
    playlist_id: testIds.playlist,
    track_id: demoFixtureIds.trackOne,
    position: 1,
  })
  requireNoError(playlistTrackError, 'Customer playlist ordering failed')
  const { error: favoriteError } = await customerOne.client.from('favorites').insert({
    owner_id: customerOne.user.id,
    resource_type: 'track',
    resource_id: demoFixtureIds.trackOne,
  })
  requireNoError(favoriteError, 'Customer favorite creation failed')
  const { error: historyError } = await customerOne.client.from('listening_history').insert({
    id: testIds.history,
    owner_id: customerOne.user.id,
    track_id: demoFixtureIds.trackOne,
    progress_ms: 1000,
    completed: true,
  })
  requireNoError(historyError, 'Customer listening-history creation failed')

  const { data: otherPlaylists, error: otherPlaylistsError } = await customerTwo.client
    .from('playlists')
    .select('id')
    .eq('id', testIds.playlist)
  requireNoError(otherPlaylistsError, 'Second customer playlist query failed')
  assert.equal(otherPlaylists.length, 0)
  const { error: crossCustomerInsertError } = await customerTwo.client
    .from('playlist_tracks')
    .insert({
      playlist_id: testIds.playlist,
      track_id: demoFixtureIds.trackTwo,
      position: 2,
    })
  assert.ok(crossCustomerInsertError, 'A second customer changed the first customer playlist')

  await admin.from('media_jobs').delete().eq('id', testIds.job)
  await admin
    .from('media_objects')
    .delete()
    .in('id', [testIds.source, testIds.derivative, testIds.duplicateDerivative])
  const sourceHash = 'c'.repeat(64)
  const derivativeKey = `${sourceHash}:catalog-test-v1:preview`
  const { error: sourceError } = await admin.from('media_objects').insert({
    id: testIds.source,
    track_id: demoFixtureIds.trackTwo,
    kind: 'source_audio',
    bucket_id: 'source-audio',
    object_path: 'catalog-test/source.wav',
    media_type: 'audio/wav',
    byte_size: 1024,
    sha256: sourceHash,
    status: 'pending',
    is_public: false,
  })
  requireNoError(sourceError, 'Source media creation failed')
  const { error: jobError } = await admin.from('media_jobs').insert({
    id: testIds.job,
    media_object_id: testIds.source,
    processing_profile_version: 'catalog-test-v1',
  })
  requireNoError(jobError, 'Media job creation failed')

  const { error: anonymousClaimError } = await anonymous.rpc('claim_media_job', {
    p_worker_id: 'anonymous-worker',
    p_lease_seconds: 30,
  })
  assert.ok(anonymousClaimError, 'An anonymous client claimed a media job')

  const { data: firstClaim, error: firstClaimError } = await admin.rpc('claim_media_job', {
    p_worker_id: 'catalog-worker-a',
    p_lease_seconds: 30,
  })
  requireNoError(firstClaimError, 'Initial media job claim failed')
  assert.equal(firstClaim.length, 1)
  assert.equal(firstClaim[0].job_id, testIds.job)
  const { data: concurrentClaim, error: concurrentClaimError } = await admin.rpc(
    'claim_media_job',
    { p_worker_id: 'catalog-worker-b', p_lease_seconds: 30 },
  )
  requireNoError(concurrentClaimError, 'Concurrent media job claim failed')
  assert.equal(concurrentClaim.length, 0)

  const { error: expireError } = await admin
    .from('media_jobs')
    .update({ lease_expires_at: '2020-01-01T00:00:00.000Z' })
    .eq('id', testIds.job)
  requireNoError(expireError, 'Media job lease expiration setup failed')
  const { data: reclaimed, error: reclaimError } = await admin.rpc('claim_media_job', {
    p_worker_id: 'catalog-worker-b',
    p_lease_seconds: 30,
  })
  requireNoError(reclaimError, 'Expired media job reclaim failed')
  assert.equal(reclaimed.length, 1)
  assert.equal(reclaimed[0].job_id, testIds.job)

  const { error: staleFinalizeError } = await admin.rpc('finalize_media_job', {
    p_job_id: testIds.job,
    p_worker_id: 'catalog-worker-a',
    p_result_metadata: { stale: true },
  })
  assert.ok(staleFinalizeError, 'A stale worker finalized a reclaimed media job')
  const { error: finalizeError } = await admin.rpc('finalize_media_job', {
    p_job_id: testIds.job,
    p_worker_id: 'catalog-worker-b',
    p_result_metadata: { verified: true },
  })
  requireNoError(finalizeError, 'Current worker media finalization failed')

  const { error: derivativeError } = await admin.from('media_objects').insert({
    id: testIds.derivative,
    track_id: demoFixtureIds.trackTwo,
    source_media_id: testIds.source,
    kind: 'preview_audio',
    bucket_id: 'preview-media',
    object_path: 'catalog-test/preview.mp3',
    media_type: 'audio/mpeg',
    byte_size: 256,
    sha256: 'd'.repeat(64),
    status: 'ready',
    is_public: true,
    processing_profile_version: 'catalog-test-v1',
    derivative_key: derivativeKey,
  })
  requireNoError(derivativeError, 'Derivative media creation failed')
  const { error: duplicateDerivativeError } = await admin.from('media_objects').insert({
    id: testIds.duplicateDerivative,
    track_id: demoFixtureIds.trackTwo,
    source_media_id: testIds.source,
    kind: 'preview_audio',
    bucket_id: 'preview-media',
    object_path: 'catalog-test/duplicate.mp3',
    media_type: 'audio/mpeg',
    byte_size: 256,
    sha256: 'e'.repeat(64),
    status: 'ready',
    is_public: true,
    processing_profile_version: 'catalog-test-v1',
    derivative_key: derivativeKey,
  })
  assert.ok(duplicateDerivativeError, 'A duplicate derivative key was stored')

  console.log(
    'Catalog authority: PASS (ordering, draft privacy, library isolation, durable media leases)',
  )
} catch (error) {
  console.error(`Catalog authority: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
