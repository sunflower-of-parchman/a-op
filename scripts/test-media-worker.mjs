import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { projectRoot, run } from './lib/command.mjs'
import { demoFixtureIds, safeSupabaseError } from './lib/local-supabase.mjs'

const ids = {
  source: '60000000-0000-4000-8000-000000000001',
  job: '60000000-0000-4000-8000-000000000002',
  invalidSource: '60000000-0000-4000-8000-000000000003',
  invalidJob: '60000000-0000-4000-8000-000000000004',
}
const sourcePath = 'worker-test/approved-tone.wav'
const invalidPath = 'worker-test/invalid-audio.wav'
const profile = 'worker-test-v1'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function runWorker(status) {
  const result = run(
    process.execPath,
    ['--experimental-strip-types', 'workers/media/index.ts', '--once'],
    {
      capture: true,
      cwd: projectRoot,
      env: {
        ...process.env,
        NUXT_PUBLIC_SUPABASE_URL: status.apiUrl,
        NUXT_SUPABASE_SECRET_KEY: status.secretKey,
        MEDIA_WORKER_ID: 'integration-worker',
        MEDIA_PREVIEW_SECONDS: '2',
      },
    },
  )
  const output = `${result.stdout}\n${result.stderr}`
  assert.ok(!output.includes(status.secretKey), 'Worker logs exposed the server credential')
  assert.ok(!output.includes('/private/tmp/'), 'Worker logs exposed a temporary local path')
  return output
}

const workspace = await mkdtemp(join(tmpdir(), 'artist-media-test-'))
try {
  const { status, admin } = await getAuthorityTestContext()
  const fixturePath = join(workspace, 'approved-tone.wav')
  run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=330:duration=2',
      '-codec:a',
      'pcm_s16le',
      fixturePath,
    ],
    { capture: true },
  )
  const source = await readFile(fixturePath)
  const invalid = Buffer.from('This is deliberately not an audio file.\n', 'utf8')

  await admin.from('media_jobs').delete().in('id', [ids.job, ids.invalidJob])
  const { data: oldDerivatives } = await admin
    .from('media_objects')
    .select('id, bucket_id, object_path')
    .in('source_media_id', [ids.source, ids.invalidSource])
  for (const derivative of oldDerivatives ?? []) {
    await admin.storage.from(derivative.bucket_id).remove([derivative.object_path])
  }
  if (oldDerivatives?.length) {
    await admin
      .from('media_objects')
      .delete()
      .in(
        'id',
        oldDerivatives.map(({ id }) => id),
      )
  }
  await admin.from('media_objects').delete().in('id', [ids.source, ids.invalidSource])
  await admin.storage.from('source-audio').remove([sourcePath, invalidPath])

  const { error: sourceUploadError } = await admin.storage
    .from('source-audio')
    .upload(sourcePath, source, { contentType: 'audio/wav', upsert: false })
  requireNoError(sourceUploadError, 'Approved source upload failed')
  const { error: sourceRecordError } = await admin.from('media_objects').insert({
    id: ids.source,
    track_id: demoFixtureIds.trackTwo,
    kind: 'source_audio',
    bucket_id: 'source-audio',
    object_path: sourcePath,
    media_type: 'audio/wav',
    byte_size: source.byteLength,
    sha256: sha256(source),
    status: 'pending',
    is_public: false,
  })
  requireNoError(sourceRecordError, 'Approved source record failed')
  const { error: jobRecordError } = await admin.from('media_jobs').insert({
    id: ids.job,
    media_object_id: ids.source,
    processing_profile_version: profile,
  })
  requireNoError(jobRecordError, 'Approved media job failed')

  const firstOutput = runWorker(status)
  assert.match(firstOutput, /"event":"media-job-ready"/)
  const { data: firstJob, error: firstJobError } = await admin
    .from('media_jobs')
    .select('status, attempts, result_metadata')
    .eq('id', ids.job)
    .single()
  requireNoError(firstJobError, 'Ready job verification failed')
  assert.equal(firstJob.status, 'ready')
  assert.equal(firstJob.attempts, 1)

  const { data: derivatives, error: derivativeError } = await admin
    .from('media_objects')
    .select('id, bucket_id, object_path, sha256, metadata, derivative_key')
    .eq('source_media_id', ids.source)
  requireNoError(derivativeError, 'Derivative verification failed')
  assert.equal(derivatives.length, 1)
  const derivative = derivatives[0]
  assert.equal(derivative.object_path, `derived/${sha256(source)}/${profile}/preview.mp3`)
  assert.equal(derivative.derivative_key, `${sha256(source)}:${profile}:preview_audio`)
  assert.equal(derivative.metadata.waveform.length, 120)
  assert.equal(firstJob.result_metadata.waveformPoints, 120)
  const { data: previewBlob, error: previewError } = await admin.storage
    .from(derivative.bucket_id)
    .download(derivative.object_path)
  requireNoError(previewError, 'Generated preview download failed')
  assert.ok((await previewBlob.arrayBuffer()).byteLength > 500)
  const { data: unchangedBlob, error: unchangedError } = await admin.storage
    .from('source-audio')
    .download(sourcePath)
  requireNoError(unchangedError, 'Original source verification failed')
  assert.equal(sha256(Buffer.from(await unchangedBlob.arrayBuffer())), sha256(source))

  const { error: retryJobError } = await admin
    .from('media_jobs')
    .update({
      status: 'pending',
      worker_id: null,
      lease_expires_at: null,
      finished_at: null,
      error_category: null,
    })
    .eq('id', ids.job)
  requireNoError(retryJobError, 'Idempotent retry setup failed')
  const { error: retrySourceError } = await admin
    .from('media_objects')
    .update({ status: 'pending' })
    .eq('id', ids.source)
  requireNoError(retrySourceError, 'Source retry setup failed')
  runWorker(status)
  const { data: retryJob, error: retryReadError } = await admin
    .from('media_jobs')
    .select('status, attempts')
    .eq('id', ids.job)
    .single()
  requireNoError(retryReadError, 'Idempotent retry verification failed')
  assert.equal(retryJob.status, 'ready')
  assert.equal(retryJob.attempts, 2)
  const { data: retryDerivatives, error: retryDerivativeError } = await admin
    .from('media_objects')
    .select('id')
    .eq('source_media_id', ids.source)
  requireNoError(retryDerivativeError, 'Idempotent derivative count failed')
  assert.deepEqual(retryDerivatives, [{ id: derivative.id }])

  const invalidFixturePath = join(workspace, 'invalid-audio.wav')
  await writeFile(invalidFixturePath, invalid)
  const { error: invalidUploadError } = await admin.storage
    .from('source-audio')
    .upload(invalidPath, invalid, { contentType: 'audio/wav', upsert: false })
  requireNoError(invalidUploadError, 'Invalid fixture upload failed')
  const { error: invalidSourceError } = await admin.from('media_objects').insert({
    id: ids.invalidSource,
    track_id: demoFixtureIds.trackThree,
    kind: 'source_audio',
    bucket_id: 'source-audio',
    object_path: invalidPath,
    media_type: 'audio/wav',
    byte_size: invalid.byteLength,
    sha256: sha256(invalid),
    status: 'pending',
    is_public: false,
  })
  requireNoError(invalidSourceError, 'Invalid source record failed')
  const { error: invalidJobError } = await admin.from('media_jobs').insert({
    id: ids.invalidJob,
    media_object_id: ids.invalidSource,
    processing_profile_version: profile,
  })
  requireNoError(invalidJobError, 'Invalid media job failed')
  const failedOutput = runWorker(status)
  assert.match(failedOutput, /"event":"media-job-failed"/)
  const { data: failedJob, error: failedJobError } = await admin
    .from('media_jobs')
    .select('status, error_category')
    .eq('id', ids.invalidJob)
    .single()
  requireNoError(failedJobError, 'Failed-job verification failed')
  assert.deepEqual(failedJob, { status: 'failed', error_category: 'unsupported-audio' })

  console.log(
    'Media worker: PASS (ffprobe, ffmpeg, immutable source, waveform, retry, safe failure)',
  )
} catch (error) {
  console.error(`Media worker: FAIL\n${safeSupabaseError(error)}`)
  process.exitCode = 1
} finally {
  await rm(workspace, { recursive: true, force: true })
}
