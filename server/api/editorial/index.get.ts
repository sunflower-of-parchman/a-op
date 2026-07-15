import type { EditorialRecord } from '#shared/types/learning'
import { editorialInputSchema } from '#shared/schemas/learning'
import { getAdminSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const admin = getAdminSupabase(event)
  const { data, error } = await admin
    .from('editorial_posts')
    .select('*')
    .eq('state', 'published')
    .order('published_on', { ascending: false })
  if (error) {
    throw createError({ statusCode: 503, statusMessage: 'Editorial work could not be loaded.' })
  }
  return {
    posts: data.map((post): EditorialRecord => {
      const parsed = editorialInputSchema.parse({
        id: post.id,
        kind: post.kind,
        slug: post.slug,
        title: post.title,
        summary: post.summary,
        publishedOn: post.published_on,
        sections: post.sections,
      })
      return { ...parsed, publishedAt: post.published_at }
    }),
  }
})
