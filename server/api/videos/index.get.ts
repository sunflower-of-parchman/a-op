import { getAdminSupabase } from '../../utils/supabase'
import { presentVideo } from '../../utils/learning'

export default defineEventHandler(async (event) => {
  const admin = getAdminSupabase(event)
  const { data, error } = await admin
    .from('videos')
    .select('*')
    .eq('state', 'published')
    .order('published_at', { ascending: false })
  if (error) throw createError({ statusCode: 503, statusMessage: 'Videos could not be loaded.' })
  return { videos: data.map((video) => presentVideo(video)) }
})
