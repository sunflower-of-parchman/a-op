import { editorialInputSchema } from '#shared/schemas/learning'
import { getAdminSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const admin = getAdminSupabase(event)
  const { data: post, error } = await admin
    .from('editorial_posts')
    .select('*')
    .eq('slug', slug ?? '')
    .eq('state', 'published')
    .maybeSingle()
  if (error || !post) {
    throw createError({ statusCode: 404, statusMessage: 'Editorial work not found.' })
  }
  const parsed = editorialInputSchema.parse({
    id: post.id,
    kind: post.kind,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    publishedOn: post.published_on,
    sections: post.sections,
  })
  return { post: { ...parsed, publishedAt: post.published_at } }
})
