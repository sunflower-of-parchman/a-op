import { readValidatedBody } from 'h3'
import { listeningHistorySchema } from '#shared/schemas/library'
import { getAdminSupabase, requireAuthIdentity } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const input = await readValidatedBody(event, (body) => listeningHistorySchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data: track, error: trackError } = await admin
    .from('tracks')
    .select('id')
    .eq('id', input.trackId)
    .eq('state', 'published')
    .maybeSingle()
  if (trackError || !track)
    throw createError({ statusCode: 404, statusMessage: 'Track not found.' })
  const { data, error } = await admin
    .from('listening_history')
    .insert({
      owner_id: identity.user.id,
      track_id: input.trackId,
      progress_ms: input.progressMs,
      completed: input.completed,
    })
    .select('id')
    .single()
  if (error || !data) {
    throw createError({ statusCode: 503, statusMessage: 'Listening history could not be stored.' })
  }
  return { historyId: data.id }
})
