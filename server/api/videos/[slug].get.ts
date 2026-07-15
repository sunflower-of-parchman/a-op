import { getAdminSupabase } from '../../utils/supabase'
import { presentVideo } from '../../utils/learning'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const admin = getAdminSupabase(event)
  const { data: video, error } = await admin
    .from('videos')
    .select('*')
    .eq('slug', slug ?? '')
    .eq('state', 'published')
    .maybeSingle()
  if (error || !video) throw createError({ statusCode: 404, statusMessage: 'Video not found.' })
  return {
    video: presentVideo(video, video.hosted_media_id ? `/api/videos/${video.id}/media` : null),
  }
})
