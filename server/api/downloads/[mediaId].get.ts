import { createError, getRouterParam } from 'h3'
import { getAdminSupabase, requireAuthIdentity } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const mediaId = getRouterParam(event, 'mediaId')
  if (!mediaId)
    throw createError({ statusCode: 400, statusMessage: 'A media identifier is required.' })

  const admin = getAdminSupabase(event)
  const { data: media, error: mediaError } = await admin
    .from('media_objects')
    .select('id, release_id, bucket_id, object_path, kind, status')
    .eq('id', mediaId)
    .eq('kind', 'download')
    .eq('status', 'ready')
    .maybeSingle()

  if (mediaError || !media?.release_id) {
    throw createError({ statusCode: 404, statusMessage: 'The protected file was not found.' })
  }

  const { data: decision, error: decisionError } = await admin.rpc('decide_access', {
    target_subject_id: identity.user.id,
    target_resource_type: 'release',
    target_resource_id: media.release_id,
  })

  if (decisionError) {
    throw createError({ statusCode: 503, statusMessage: 'Access could not be verified.' })
  }

  const access = decision as {
    allowed: boolean
    reason: string
    entitlementId: string | null
  }
  if (!access.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This account does not own this download.',
    })
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(media.bucket_id)
    .createSignedUrl(media.object_path, 60)
  if (signedError || !signed?.signedUrl) {
    throw createError({ statusCode: 503, statusMessage: 'A protected link could not be created.' })
  }

  if (access.entitlementId) {
    const { error: recordError } = await admin.from('download_records').insert({
      subject_id: identity.user.id,
      media_object_id: media.id,
      entitlement_id: access.entitlementId,
    })
    if (recordError) {
      throw createError({ statusCode: 503, statusMessage: 'Delivery could not be recorded.' })
    }
  }

  return { url: signed.signedUrl, expiresIn: 60, reason: access.reason }
})
