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

  if (intent.kind === 'artwork') {
    const { data: image, error: imageError } = await admin.storage
      .from(intent.bucket_id)
      .download(intent.object_path)
    if (imageError)
      throw createError({ statusCode: 409, statusMessage: 'Artwork could not be read.' })
    const signature = Buffer.from(await image.arrayBuffer()).subarray(0, 12)
    if (
      signature.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      signature.subarray(8).toString('ascii') !== 'WEBP'
    ) {
      throw createError({ statusCode: 415, statusMessage: 'Artwork is not a valid WebP image.' })
    }
  }

  const ready = intent.kind === 'artwork'
  const { error: mediaError } = await admin.from('media_objects').insert({
    id: intent.id,
    release_id: intent.release_id,
    track_id: intent.track_id,
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
