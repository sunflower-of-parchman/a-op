import { createError, getRouterParam, setResponseHeader } from 'h3'
import { pageInputSchema } from '#shared/schemas/page'
import { getPublicSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'A page slug is required.' })

  const supabase = getPublicSupabase(event)
  const { data, error } = await supabase
    .from('pages')
    .select('id, slug, title, navigation_label, seo, sections, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error || !data)
    throw createError({ statusCode: 404, statusMessage: 'The page was not found.' })

  const parsed = pageInputSchema.parse({
    slug: data.slug,
    title: data.title,
    navigationLabel: data.navigation_label,
    seo: data.seo,
    sections: data.sections,
  })
  return { id: data.id, ...parsed, publishedAt: data.published_at }
})
