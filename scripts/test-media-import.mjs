import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { projectRoot, run } from './lib/command.mjs'
import { safeSupabaseError } from './lib/local-supabase.mjs'

function runTypeScript(args, status) {
  const result = run(process.execPath, ['--experimental-strip-types', ...args], {
    capture: true,
    cwd: projectRoot,
    env: {
      ...process.env,
      NUXT_PUBLIC_SUPABASE_URL: status.apiUrl,
      NUXT_SUPABASE_SECRET_KEY: status.secretKey,
      MEDIA_WORKER_ID: 'import-integration-worker',
      MEDIA_PREVIEW_SECONDS: '2',
    },
  })
  const output = `${result.stdout}\n${result.stderr}`
  assert.ok(!output.includes(status.secretKey), 'Media intake logs exposed the server credential')
  return result.stdout.trim()
}

function makeTone(path, frequency) {
  run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${frequency}:duration=2`,
      '-codec:a',
      'pcm_s16le',
      path,
    ],
    { capture: true },
  )
}

const workspace = await mkdtemp(join(tmpdir(), 'artist-import-test-'))
try {
  const { status, anonymous, admin } = await getAuthorityTestContext()
  const sourceDirectory = join(workspace, 'two-track-study')
  const manifestPath = join(workspace, 'approved-import.json')
  await mkdir(sourceDirectory)
  makeTone(join(sourceDirectory, '01 arriving.wav'), 392)
  makeTone(join(sourceDirectory, '02 returning.wav'), 523.25)

  const inspection = runTypeScript(
    ['scripts/import-media.ts', 'inspect', sourceDirectory, '--out', manifestPath],
    status,
  )
  assert.match(inspection, /"event":"media-import-proposed"/)
  const proposal = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(proposal.tracks.length, 2)
  assert.deepEqual(proposal.confirmations, {
    rightsConfirmed: false,
    metadataApproved: false,
    publicationApproved: false,
    approvedBy: 'pending',
  })

  const sourceIds = proposal.tracks.map(({ sourceMediaId }) => sourceMediaId)
  const trackIds = proposal.tracks.map(({ stableId }) => stableId)
  const { data: priorDerivatives } = await admin
    .from('media_objects')
    .select('id, bucket_id, object_path')
    .in('source_media_id', sourceIds)
  for (const derivative of priorDerivatives ?? []) {
    await admin.storage.from(derivative.bucket_id).remove([derivative.object_path])
  }
  if (priorDerivatives?.length) {
    await admin
      .from('media_objects')
      .delete()
      .in(
        'id',
        priorDerivatives.map(({ id }) => id),
      )
  }
  const { data: oldSources } = await admin
    .from('media_objects')
    .select('bucket_id, object_path')
    .in('id', sourceIds)
  await admin.from('media_jobs').delete().in('media_object_id', sourceIds)
  for (const source of oldSources ?? []) {
    await admin.storage.from(source.bucket_id).remove([source.object_path])
  }
  await admin.from('media_objects').delete().in('id', sourceIds)
  await admin.from('release_tracks').delete().eq('release_id', proposal.release.stableId)
  await admin.from('tracks').delete().in('id', trackIds)
  await admin.from('releases').delete().eq('id', proposal.release.stableId)

  proposal.release.slug = 'two-track-import-study'
  proposal.release.title = 'Two-Track Import Study'
  proposal.release.description = 'Metadata revised by the artist before application.'
  proposal.release.releaseDate = '2026-07-15'
  proposal.tracks[0].proposed.description = 'An edited opening description.'
  proposal.tracks[0].proposed.tempoBpm = 78
  proposal.tracks[0].proposed.meter = '4/4'
  proposal.tracks[1].proposed.description = 'An edited closing description.'
  proposal.confirmations = {
    rightsConfirmed: true,
    metadataApproved: true,
    publicationApproved: true,
    approvedBy: 'Build Week integration fixture',
  }
  await writeFile(manifestPath, `${JSON.stringify(proposal, null, 2)}\n`)

  const firstApply = JSON.parse(
    runTypeScript(['scripts/import-media.ts', 'apply', manifestPath, '--confirm-apply'], status),
  )
  assert.deepEqual(
    {
      tracksApplied: firstApply.tracksApplied,
      sourcesCreated: firstApply.sourcesCreated,
      sourcesReused: firstApply.sourcesReused,
      jobsCreated: firstApply.jobsCreated,
    },
    { tracksApplied: 2, sourcesCreated: 2, sourcesReused: 0, jobsCreated: 2 },
  )

  const secondApply = JSON.parse(
    runTypeScript(['scripts/import-media.ts', 'apply', manifestPath, '--confirm-apply'], status),
  )
  assert.deepEqual(
    {
      tracksApplied: secondApply.tracksApplied,
      sourcesCreated: secondApply.sourcesCreated,
      sourcesReused: secondApply.sourcesReused,
      jobsCreated: secondApply.jobsCreated,
    },
    { tracksApplied: 2, sourcesCreated: 0, sourcesReused: 2, jobsCreated: 0 },
  )

  const workerOutput = runTypeScript(['workers/media/index.ts', '--once'], status)
  assert.match(workerOutput, /"processed":2,"failed":0/)

  const { data: release, error: releaseError } = await anonymous
    .from('releases')
    .select('id, title, description, state')
    .eq('id', proposal.release.stableId)
    .single()
  requireNoError(releaseError, 'Imported public release failed')
  assert.deepEqual(release, {
    id: proposal.release.stableId,
    title: 'Two-Track Import Study',
    description: 'Metadata revised by the artist before application.',
    state: 'published',
  })
  const { data: order, error: orderError } = await anonymous
    .from('release_tracks')
    .select('track_id, position')
    .eq('release_id', proposal.release.stableId)
    .order('position')
  requireNoError(orderError, 'Imported track order failed')
  assert.deepEqual(
    order.map(({ track_id }) => track_id),
    trackIds,
  )
  const { data: previews, error: previewsError } = await anonymous
    .from('media_objects')
    .select('track_id, bucket_id, object_path, metadata')
    .in('track_id', trackIds)
    .eq('kind', 'preview_audio')
    .eq('status', 'ready')
  requireNoError(previewsError, 'Imported preview verification failed')
  assert.equal(previews.length, 2)
  assert.ok(previews.every(({ metadata }) => metadata.waveform.length === 120))
  const previewResponse = await fetch(
    `${status.apiUrl}/storage/v1/object/public/${previews[0].bucket_id}/${previews[0].object_path}`,
  )
  assert.equal(previewResponse.status, 200)
  assert.ok((await previewResponse.arrayBuffer()).byteLength > 500)

  console.log(
    'Media import: PASS (proposal, approvals, metadata edit, idempotent apply, process, publish)',
  )
} catch (error) {
  console.error(`Media import: FAIL\n${safeSupabaseError(error)}`)
  process.exitCode = 1
} finally {
  await rm(workspace, { recursive: true, force: true })
}
