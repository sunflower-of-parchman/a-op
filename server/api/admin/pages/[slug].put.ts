import { createError, getRouterParam, readValidatedBody } from 'h3'
import { pageInputSchema } from '#shared/schemas/page'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const slug = getRouterParam(event, 'slug')
  const page = await readValidatedBody(event, (body) => pageInputSchema.parse(body))
  if (!slug || page.slug !== slug) {
    throw createError({ statusCode: 400, statusMessage: 'The page slug does not match.' })
  }

  const admin = getAdminSupabase(event)
  const { data: existing, error: existingError } = await admin
    .from('pages')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'draft')
    .maybeSingle()
  if (existingError) throw createError({ statusCode: 503, statusMessage: 'Draft lookup failed.' })

  const values = {
    slug: page.slug,
    title: page.title,
    navigation_label: page.navigationLabel,
    seo: page.seo,
    sections: page.sections,
    updated_by: identity.user.id,
    updated_at: new Date().toISOString(),
  }
  const mutation = existing
    ? admin.from('pages').update(values).eq('id', existing.id).select('id, updated_at').single()
    : admin
        .from('pages')
        .insert({ ...values, status: 'draft', created_by: identity.user.id })
        .select('id, updated_at')
        .single()
  const { data, error } = await mutation
  if (error || !data)
    throw createError({ statusCode: 400, statusMessage: 'The page draft could not be saved.' })

  await admin.from('audit_records').insert({
    actor_id: identity.user.id,
    event_type: 'page.draft_saved',
    target_type: 'page',
    target_id: data.id,
    detail: { slug },
  })
  return { draft: { id: data.id, updatedAt: data.updated_at } }
})
