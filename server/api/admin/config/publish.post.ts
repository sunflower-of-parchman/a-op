import { readValidatedBody } from 'h3'
import { z } from 'zod'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

const publishSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner'])
  const { id } = await readValidatedBody(event, (body) => publishSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('publish_site_config', {
    p_version_id: id,
    p_actor_id: identity.user.id,
  })

  if (error)
    throw createError({ statusCode: 400, statusMessage: 'The draft could not be published.' })
  return { published: data }
})
