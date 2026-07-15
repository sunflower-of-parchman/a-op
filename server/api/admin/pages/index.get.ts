import { pageInputSchema } from '#shared/schemas/page'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner', 'editor'])
  const admin = getAdminSupabase(event)
  const { data, error } = await admin
    .from('pages')
    .select('id, slug, title, navigation_label, status, seo, sections, updated_at, published_at')
    .in('status', ['draft', 'published'])
    .order('slug')
    .order('status')
  if (error) throw createError({ statusCode: 503, statusMessage: 'Pages could not be loaded.' })

  return {
    pages: data.map((page) => ({
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
    })),
  }
})
