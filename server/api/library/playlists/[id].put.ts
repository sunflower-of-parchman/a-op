import { getRouterParam, readValidatedBody } from 'h3'
import { updatePlaylistSchema } from '#shared/schemas/library'
import { getAdminSupabase, requireAuthIdentity } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'A playlist identifier is required.' })
  const input = await readValidatedBody(event, (body) => updatePlaylistSchema.parse(body))
  const { data, error } = await getAdminSupabase(event).rpc('replace_playlist', {
    p_playlist_id: id,
    p_owner_id: identity.user.id,
    p_title: input.title,
    p_description: input.description,
    p_track_ids: input.trackIds,
  })
  if (error) throw createError({ statusCode: 400, statusMessage: 'Playlist could not be updated.' })
  return { playlistId: data }
})
