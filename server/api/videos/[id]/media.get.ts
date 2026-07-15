import { getAdminSupabase } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const admin = getAdminSupabase(event)
  const { data: video, error: videoError } = await admin
    .from('videos')
    .select('hosted_media_id')
    .eq('id', id ?? '')
    .eq('state', 'published')
    .maybeSingle()
  if (videoError || !video?.hosted_media_id) {
    throw createError({ statusCode: 404, statusMessage: 'Hosted video not found.' })
  }
  const { data: media, error: mediaError } = await admin
    .from('media_objects')
    .select('bucket_id, object_path')
    .eq('id', video.hosted_media_id)
    .eq('status', 'ready')
    .maybeSingle()
  if (mediaError || !media) {
    throw createError({ statusCode: 404, statusMessage: 'Hosted video is not ready.' })
  }
  const { data: signed, error: signedError } = await admin.storage
    .from(media.bucket_id)
    .createSignedUrl(media.object_path, 60)
  if (signedError || !signed?.signedUrl) {
    throw createError({ statusCode: 503, statusMessage: 'Hosted video delivery failed.' })
  }
  return sendRedirect(event, signed.signedUrl, 302)
})
