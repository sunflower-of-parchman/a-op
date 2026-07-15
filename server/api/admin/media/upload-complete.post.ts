import { basename, dirname } from 'node:path'
import { createError, readValidatedBody } from 'h3'
import { mediaUploadCompleteSchema } from '#shared/schemas/mediaUpload'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const { intentId } = await readValidatedBody(event, (body) =>
    mediaUploadCompleteSchema.parse(body),
  )
  const admin = getAdminSupabase(event)
  const { data: intent, error: intentError } = await admin
    .from('upload_intents')
    .select('*')
    .eq('id', intentId)
    .eq('actor_id', identity.user.id)
    .maybeSingle()
  if (intentError || !intent) {
    throw createError({ statusCode: 404, statusMessage: 'Upload intent not found.' })
  }
  if (intent.expires_at <= new Date().toISOString() && intent.status !== 'completed') {
    await admin.from('upload_intents').update({ status: 'expired' }).eq('id', intent.id)
    throw createError({ statusCode: 410, statusMessage: 'Upload authorization expired.' })
  }
  const uploadIntent = intent

  async function ensureDependentRecords() {
    if (uploadIntent.kind === 'source_audio') {
      const { error: jobError } = await admin.from('media_jobs').upsert(
        {
          media_object_id: uploadIntent.id,
          processing_profile_version: 'preview-v1',
        },
        {
          onConflict: 'media_object_id,processing_profile_version',
          ignoreDuplicates: true,
        },
      )
      if (jobError) {
        throw createError({
          statusCode: 503,
          statusMessage: 'The processing job could not be created.',
        })
      }
      return
    }

    if (uploadIntent.kind === 'lesson_media') return

    if (!uploadIntent.release_id) return
    const { data: draft, error: draftReadError } = await admin
      .from('release_drafts')
      .select('payload')
      .eq('release_id', uploadIntent.release_id)
      .maybeSingle()
    const payload = draft?.payload
    if (draftReadError || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw createError({ statusCode: 409, statusMessage: 'Save the release draft first.' })
    }
    const { error: draftError } = await admin
      .from('release_drafts')
      .update({ payload: { ...payload, artwork_media_id: uploadIntent.id } })
      .eq('release_id', uploadIntent.release_id)
    if (draftError) {
      throw createError({ statusCode: 503, statusMessage: 'Artwork could not be attached.' })
    }
  }

  const { data: existingMedia } = await admin
    .from('media_objects')
    .select('id, status')
    .eq('id', intent.id)
    .maybeSingle()
  if (intent.status === 'completed' || existingMedia) {
    if (existingMedia) await ensureDependentRecords()
    if (intent.status !== 'completed') {
      await admin
        .from('upload_intents')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', intent.id)
    }
    return { mediaId: existingMedia?.id ?? intent.id, status: existingMedia?.status ?? 'pending' }
  }

  const folder = dirname(intent.object_path)
  const filename = basename(intent.object_path)
  const { data: objects, error: listError } = await admin.storage
    .from(intent.bucket_id)
    .list(folder, { search: filename, limit: 10 })
  const stored = objects?.find(({ name }) => name === filename)
  const storedSize = Number(stored?.metadata?.size ?? 0)
  if (listError || !stored || storedSize !== intent.byte_size) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The uploaded object is missing or does not match the authorized size.',
    })
  }

  if (intent.kind === 'artwork' || intent.kind === 'lesson_media') {
    const { data: signed, error: signedError } = await admin.storage
      .from(intent.bucket_id)
      .createSignedUrl(intent.object_path, 60)
    if (signedError || !signed?.signedUrl) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Uploaded media could not be inspected.',
      })
    }
    const response = await fetch(signed.signedUrl, { headers: { range: 'bytes=0-511' } })
    if (!response.ok) {
      throw createError({ statusCode: 409, statusMessage: 'Uploaded media could not be read.' })
    }
    const signature = Buffer.from(await response.arrayBuffer())
    const ascii = signature.toString('ascii')
    const valid =
      intent.media_type === 'text/plain' ||
      (intent.media_type === 'image/webp' &&
        ascii.startsWith('RIFF') &&
        ascii.slice(8, 12) === 'WEBP') ||
      (intent.media_type === 'image/png' &&
        signature.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') ||
      (intent.media_type === 'image/jpeg' &&
        signature.subarray(0, 3).toString('hex') === 'ffd8ff') ||
      (intent.media_type === 'audio/wav' &&
        ascii.startsWith('RIFF') &&
        ascii.slice(8, 12) === 'WAVE') ||
      (intent.media_type === 'audio/mpeg' &&
        (ascii.startsWith('ID3') || (signature[0] === 0xff && (signature[1]! & 0xe0) === 0xe0))) ||
      (intent.media_type === 'video/mp4' && ascii.slice(4, 8) === 'ftyp') ||
      (intent.media_type === 'video/webm' &&
        signature.subarray(0, 4).toString('hex') === '1a45dfa3') ||
      (intent.media_type === 'application/pdf' && ascii.startsWith('%PDF-'))
    if (!valid) {
      throw createError({ statusCode: 415, statusMessage: 'Uploaded media signature is invalid.' })
    }
  }

  const ready = intent.kind === 'artwork' || intent.kind === 'lesson_media'
  const { error: mediaError } = await admin.from('media_objects').insert({
    id: intent.id,
    release_id: intent.release_id,
    track_id: intent.track_id,
    lesson_id: intent.lesson_id,
    kind: intent.kind,
    bucket_id: intent.bucket_id,
    object_path: intent.object_path,
    media_type: intent.media_type,
    byte_size: intent.byte_size,
    sha256: intent.sha256,
    status: ready ? 'ready' : 'pending',
    is_public: ready,
    created_by: identity.user.id,
    metadata: { uploadedDirectly: true },
  })
  if (mediaError) {
    throw createError({ statusCode: 503, statusMessage: 'The media record could not be created.' })
  }

  await ensureDependentRecords()

  await admin
    .from('upload_intents')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', intent.id)
  await admin.from('audit_records').insert({
    actor_id: identity.user.id,
    event_type: 'media.upload_completed',
    target_type: 'media_object',
    target_id: intent.id,
    detail: { kind: intent.kind, byteSize: intent.byte_size },
  })

  return { mediaId: intent.id, status: ready ? 'ready' : 'pending' }
})
