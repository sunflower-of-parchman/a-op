import { getRouterParam } from 'h3'
import { getAdminSupabase, requireAnyRole } from '../../../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'A release identifier is required.' })
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('apply_release_draft', {
    p_release_id: id,
    p_actor_id: identity.user.id,
  })
  if (error) {
    throw createError({ statusCode: 400, statusMessage: 'The release could not be published.' })
  }
  return { releaseId: data, publishedAt: new Date().toISOString() }
})
