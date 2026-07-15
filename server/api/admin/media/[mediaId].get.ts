import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner', 'editor'])
  const mediaId = getRouterParam(event, 'mediaId')
  const admin = getAdminSupabase(event)
  const { data: media, error } = await admin
    .from('media_objects')
    .select('bucket_id, object_path, status, is_public')
    .eq('id', mediaId ?? '')
    .eq('status', 'ready')
    .maybeSingle()
  if (error || !media) {
    throw createError({ statusCode: 404, statusMessage: 'Preview media is not ready.' })
  }

  let url: string
  if (media.is_public) {
    url = admin.storage.from(media.bucket_id).getPublicUrl(media.object_path).data.publicUrl
  } else {
    const { data: signed, error: signedError } = await admin.storage
      .from(media.bucket_id)
      .createSignedUrl(media.object_path, 60)
    if (signedError || !signed?.signedUrl) {
      throw createError({ statusCode: 503, statusMessage: 'Preview media could not be signed.' })
    }
    url = signed.signedUrl
  }
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return sendRedirect(event, url, 302)
})
