import { readValidatedBody } from 'h3'
import { createPlaylistSchema } from '#shared/schemas/library'
import { getAdminSupabase, requireAuthIdentity } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const input = await readValidatedBody(event, (body) => createPlaylistSchema.parse(body))
  const { data, error } = await getAdminSupabase(event)
    .from('playlists')
    .insert({ owner_id: identity.user.id, title: input.title, description: input.description })
    .select('id, title, description')
    .single()
  if (error || !data) {
    throw createError({ statusCode: 503, statusMessage: 'Playlist could not be created.' })
  }
  return { playlist: { ...data, tracks: [] } }
})
