import { extname } from 'node:path'
import { createError, readValidatedBody } from 'h3'
import { mediaUploadTargetSchema } from '#shared/schemas/mediaUpload'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

function resumableEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl)
  if (url.hostname.endsWith('.supabase.co')) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')
  }
  url.pathname = '/storage/v1/upload/resumable/sign'
  url.search = ''
  return url.toString()
}

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const input = await readValidatedBody(event, (body) => mediaUploadTargetSchema.parse(body))
  const admin = getAdminSupabase(event)

  if (input.kind === 'source_audio') {
    const { data: track, error } = await admin
      .from('tracks')
      .select('id')
      .eq('id', input.trackId)
      .maybeSingle()
    if (error || !track) throw createError({ statusCode: 404, statusMessage: 'Track not found.' })
  } else {
    const { data: release, error } = await admin
      .from('releases')
      .select('id')
      .eq('id', input.releaseId)
      .maybeSingle()
    if (error || !release) {
      throw createError({ statusCode: 404, statusMessage: 'Release not found.' })
    }
  }

  const { data: existingMedia, error: existingMediaError } = await admin
    .from('media_objects')
    .select('id, track_id, release_id, status')
    .eq('sha256', input.sha256)
    .eq('kind', input.kind)
    .maybeSingle()
  if (existingMediaError) {
    throw createError({ statusCode: 503, statusMessage: 'Existing media could not be checked.' })
  }
  if (existingMedia) {
    if (input.kind === 'source_audio' && existingMedia.track_id !== input.trackId) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This source is already attached to another track.',
      })
    }
    if (input.kind === 'artwork') {
      const { data: draft } = await admin
        .from('release_drafts')
        .select('payload')
        .eq('release_id', input.releaseId)
        .maybeSingle()
      if (draft?.payload && typeof draft.payload === 'object' && !Array.isArray(draft.payload)) {
        await admin
          .from('release_drafts')
          .update({ payload: { ...draft.payload, artwork_media_id: existingMedia.id } })
          .eq('release_id', input.releaseId)
      }
    }
    return { reused: true, mediaId: existingMedia.id, status: existingMedia.status }
  }

  const bucket = input.kind === 'source_audio' ? 'source-audio' : 'artwork'
  const extension = input.kind === 'artwork' ? '.webp' : extname(input.filename).toLowerCase()
  const objectPath = `uploads/${input.sha256}/${input.kind === 'artwork' ? 'artwork' : 'source'}${extension}`
  const now = new Date()
  const { data: existingIntent, error: intentLookupError } = await admin
    .from('upload_intents')
    .select('id, object_path, bucket_id, expires_at')
    .eq('actor_id', identity.user.id)
    .eq('kind', input.kind)
    .eq('sha256', input.sha256)
    .eq('status', 'authorized')
    .gt('expires_at', now.toISOString())
    .maybeSingle()
  if (intentLookupError) {
    throw createError({ statusCode: 503, statusMessage: 'Upload intent lookup failed.' })
  }

  let intent = existingIntent
  if (!intent) {
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
    const { data, error } = await admin
      .from('upload_intents')
      .insert({
        actor_id: identity.user.id,
        kind: input.kind,
        release_id: input.kind === 'artwork' ? input.releaseId : null,
        track_id: input.kind === 'source_audio' ? input.trackId : null,
        bucket_id: bucket,
        object_path: objectPath,
        media_type: input.mediaType,
        byte_size: input.byteSize,
        sha256: input.sha256,
        expires_at: expiresAt,
      })
      .select('id, object_path, bucket_id, expires_at')
      .single()
    if (error || !data) {
      throw createError({ statusCode: 503, statusMessage: 'Upload intent could not be created.' })
    }
    intent = data
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(intent.bucket_id)
    .createSignedUploadUrl(intent.object_path, { upsert: false })
  if (signedError || !signed?.token) {
    throw createError({ statusCode: 503, statusMessage: 'Upload authorization failed.' })
  }

  const config = useRuntimeConfig(event)
  return {
    reused: false,
    intentId: intent.id,
    bucket: intent.bucket_id,
    path: intent.object_path,
    token: signed.token,
    endpoint: resumableEndpoint(config.public.supabaseUrl),
    expiresAt: intent.expires_at,
    chunkSize: 6 * 1024 * 1024,
  }
})
