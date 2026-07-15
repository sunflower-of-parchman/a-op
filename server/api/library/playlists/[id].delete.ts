import { getRouterParam } from 'h3'
import { getAdminSupabase, requireAuthIdentity } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'A playlist identifier is required.' })
  const { data, error } = await getAdminSupabase(event)
    .from('playlists')
    .delete()
    .eq('id', id)
    .eq('owner_id', identity.user.id)
    .select('id')
    .maybeSingle()
  if (error || !data) throw createError({ statusCode: 404, statusMessage: 'Playlist not found.' })
  return { playlistId: id, deleted: true }
})
