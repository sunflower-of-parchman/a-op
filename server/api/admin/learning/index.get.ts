import { learningPathInputSchema } from '#shared/schemas/learning'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner', 'editor'])
  const admin = getAdminSupabase(event)
  const [
    { data: drafts, error: draftError },
    { data: paths, error: pathError },
    { data: tiers, error: tierError },
    { data: media, error: mediaError },
    { data: videos, error: videoError },
  ] = await Promise.all([
    admin.from('learning_path_drafts').select('*').order('updated_at', { ascending: false }),
    admin.from('learning_paths').select('id, slug, title, published_at'),
    admin.from('membership_tiers').select('id, name, state').order('sort_order'),
    admin
      .from('media_objects')
      .select('id, lesson_id, kind, media_type, object_path, status')
      .in('kind', ['lesson_media', 'preview_audio'])
      .eq('status', 'ready')
      .order('created_at'),
    admin.from('videos').select('id, slug, title, state').order('title'),
  ])
  if (draftError || pathError || tierError || mediaError || videoError) {
    throw createError({ statusCode: 503, statusMessage: 'Learning administration could not load.' })
  }
  return {
    drafts: drafts.map((draft) => ({
      ...learningPathInputSchema.parse(draft.payload),
      updatedAt: draft.updated_at,
      publishedAt: paths.find(({ id }) => id === draft.id)?.published_at ?? null,
    })),
    membershipTiers: tiers,
    media,
    videos,
  }
})
