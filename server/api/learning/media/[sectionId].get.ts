import { getAdminSupabase, getAuthIdentity } from '../../../utils/supabase'
import { decideLessonAccess } from '../../../utils/learning'

export default defineEventHandler(async (event) => {
  const sectionId = getRouterParam(event, 'sectionId')
  const identity = await getAuthIdentity(event)
  const admin = getAdminSupabase(event)
  const { data: section, error: sectionError } = await admin
    .from('lesson_sections')
    .select('lesson_id, media_object_id, section_type')
    .eq('id', sectionId ?? '')
    .maybeSingle()
  if (sectionError || !section?.media_object_id) {
    throw createError({ statusCode: 404, statusMessage: 'Lesson media not found.' })
  }
  const access = await decideLessonAccess(event, identity?.user.id ?? null, section.lesson_id)
  if (!access.allowed) {
    throw createError({ statusCode: 403, statusMessage: 'This lesson media is protected.' })
  }
  const { data: media, error: mediaError } = await admin
    .from('media_objects')
    .select('bucket_id, object_path, status, is_public')
    .eq('id', section.media_object_id)
    .eq('status', 'ready')
    .maybeSingle()
  if (mediaError || !media) {
    throw createError({ statusCode: 404, statusMessage: 'Lesson media is not ready.' })
  }
  let url: string
  if (media.is_public) {
    url = admin.storage.from(media.bucket_id).getPublicUrl(media.object_path).data.publicUrl
  } else {
    const { data: signed, error: signedError } = await admin.storage
      .from(media.bucket_id)
      .createSignedUrl(media.object_path, 60, {
        download: section.section_type === 'download' ? true : undefined,
      })
    if (signedError || !signed?.signedUrl) {
      throw createError({ statusCode: 503, statusMessage: 'Lesson media delivery failed.' })
    }
    url = signed.signedUrl
  }
  return sendRedirect(event, url, 302)
})
