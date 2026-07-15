import { learningProgressInputSchema } from '#shared/schemas/learning'
import { getAdminSupabase, requireAuthIdentity } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const input = await readValidatedBody(event, (body) => learningProgressInputSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('record_lesson_progress', {
    p_subject_id: identity.user.id,
    p_lesson_id: input.lessonId,
    p_section_position: input.sectionPosition,
    p_completed: input.completed,
  })
  if (error || !data?.[0]) {
    throw createError({ statusCode: 403, statusMessage: 'Learning progress could not be saved.' })
  }
  return {
    sectionPosition: data[0].section_position,
    completed: data[0].completed,
    completedAt: data[0].completed_at,
  }
})
