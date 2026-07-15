import { readValidatedBody } from 'h3'
import { favoriteTrackSchema } from '#shared/schemas/library'
import { getAdminSupabase, requireAuthIdentity } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const input = await readValidatedBody(event, (body) => favoriteTrackSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data: track, error: trackError } = await admin
    .from('tracks')
    .select('id')
    .eq('id', input.trackId)
    .eq('state', 'published')
    .maybeSingle()
  if (trackError || !track)
    throw createError({ statusCode: 404, statusMessage: 'Track not found.' })

  const query = admin.from('favorites')
  const { error } = input.favorite
    ? await query.upsert({
        owner_id: identity.user.id,
        resource_type: 'track',
        resource_id: input.trackId,
      })
    : await query
        .delete()
        .eq('owner_id', identity.user.id)
        .eq('resource_type', 'track')
        .eq('resource_id', input.trackId)
  if (error) throw createError({ statusCode: 503, statusMessage: 'Favorite could not be updated.' })
  return { trackId: input.trackId, favorite: input.favorite }
})
