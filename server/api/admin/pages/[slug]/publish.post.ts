import { createError, getRouterParam, readValidatedBody } from 'h3'
import { z } from 'zod'
import { getAdminSupabase, requireAnyRole } from '../../../../utils/supabase'

const publishSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const slug = getRouterParam(event, 'slug')
  const { id } = await readValidatedBody(event, (body) => publishSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data: draft } = await admin
    .from('pages')
    .select('slug')
    .eq('id', id)
    .eq('status', 'draft')
    .maybeSingle()
  if (!slug || draft?.slug !== slug) {
    throw createError({ statusCode: 400, statusMessage: 'The page draft does not match.' })
  }

  const { data, error } = await admin.rpc('publish_page', {
    p_page_id: id,
    p_actor_id: identity.user.id,
  })
  if (error)
    throw createError({ statusCode: 400, statusMessage: 'The page could not be published.' })
  return { published: data }
})
