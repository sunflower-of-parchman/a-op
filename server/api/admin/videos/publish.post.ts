import { draftIdSchema } from '#shared/schemas/learning'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const { id } = await readValidatedBody(event, (body) => draftIdSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('publish_video_draft', {
    p_actor_id: identity.user.id,
    p_draft_id: id,
  })
  if (error || !data)
    throw createError({ statusCode: 400, statusMessage: 'Video could not be published.' })
  return { id: data }
})
