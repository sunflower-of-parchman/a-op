import { videoInputSchema } from '#shared/schemas/learning'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const input = await readValidatedBody(event, (body) => videoInputSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { error } = await admin.from('video_drafts').upsert({
    id: input.id,
    slug: input.slug,
    payload: input,
    updated_by: identity.user.id,
    updated_at: new Date().toISOString(),
  })
  if (error)
    throw createError({ statusCode: 400, statusMessage: 'Video draft could not be saved.' })
  return { id: input.id }
})
