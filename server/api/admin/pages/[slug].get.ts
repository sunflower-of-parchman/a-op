import { createError, getRouterParam } from 'h3'
import { pageInputSchema } from '#shared/schemas/page'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner', 'editor'])
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'A page slug is required.' })

  const admin = getAdminSupabase(event)
  const { data, error } = await admin
    .from('pages')
    .select('id, slug, title, navigation_label, status, seo, sections, updated_at, published_at')
    .eq('slug', slug)
    .in('status', ['draft', 'published'])
    .order('status')
  if (error) throw createError({ statusCode: 503, statusMessage: 'The page could not be loaded.' })

  const normalize = (page: (typeof data)[number]) => ({
    id: page.id,
    status: page.status,
    updatedAt: page.updated_at,
    publishedAt: page.published_at,
    ...pageInputSchema.parse({
      slug: page.slug,
      title: page.title,
      navigationLabel: page.navigation_label,
      seo: page.seo,
      sections: page.sections,
    }),
  })

  return {
    published: data.find(({ status }) => status === 'published')
      ? normalize(data.find(({ status }) => status === 'published')!)
      : null,
    draft: data.find(({ status }) => status === 'draft')
      ? normalize(data.find(({ status }) => status === 'draft')!)
      : null,
  }
})
