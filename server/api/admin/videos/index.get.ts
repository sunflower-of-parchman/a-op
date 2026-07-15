import { videoInputSchema } from '#shared/schemas/learning'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner', 'editor'])
  const admin = getAdminSupabase(event)
  const [
    { data: drafts, error: draftError },
    { data: videos, error: videoError },
    { data: media },
  ] = await Promise.all([
    admin.from('video_drafts').select('*').order('updated_at', { ascending: false }),
    admin.from('videos').select('id, published_at'),
    admin
      .from('media_objects')
      .select('id, object_path, media_type')
      .eq('kind', 'lesson_media')
      .eq('status', 'ready')
      .in('media_type', ['video/mp4', 'video/webm']),
  ])
  if (draftError || videoError) {
    throw createError({ statusCode: 503, statusMessage: 'Video administration could not load.' })
  }
  return {
    drafts: drafts.map((draft) => ({
      ...videoInputSchema.parse(draft.payload),
      updatedAt: draft.updated_at,
      publishedAt: videos.find(({ id }) => id === draft.id)?.published_at ?? null,
    })),
    media: media ?? [],
  }
})
