import { learningPathInputSchema } from '#shared/schemas/learning'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const input = await readValidatedBody(event, (body) => learningPathInputSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data, error } = await admin
    .from('learning_path_drafts')
    .upsert({
      id: input.id,
      slug: input.slug,
      payload: input,
      updated_by: identity.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('id, updated_at')
    .single()
  if (error || !data) {
    throw createError({ statusCode: 400, statusMessage: 'Learning draft could not be saved.' })
  }
  await admin.from('audit_records').insert({
    actor_id: identity.user.id,
    event_type: 'learning.draft_saved',
    target_type: 'learning_path',
    target_id: input.id,
    detail: { slug: input.slug },
  })
  return { id: data.id, updatedAt: data.updated_at }
})
