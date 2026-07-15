import { editorialInputSchema } from '#shared/schemas/learning'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner', 'editor'])
  const admin = getAdminSupabase(event)
  const [{ data: drafts, error: draftError }, { data: posts, error: postError }] =
    await Promise.all([
      admin.from('editorial_drafts').select('*').order('updated_at', { ascending: false }),
      admin.from('editorial_posts').select('id, published_at'),
    ])
  if (draftError || postError) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Editorial administration could not load.',
    })
  }
  return {
    drafts: drafts.map((draft) => ({
      ...editorialInputSchema.parse(draft.payload),
      updatedAt: draft.updated_at,
      publishedAt: posts.find(({ id }) => id === draft.id)?.published_at ?? null,
    })),
  }
})
