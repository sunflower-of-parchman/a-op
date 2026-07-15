import { getAdminSupabase, getAuthIdentity } from '../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await getAuthIdentity(event)
  if (!identity) return { authenticated: false as const }
  const admin = getAdminSupabase(event)
  const [
    { data: favorites, error: favoritesError },
    { data: playlists, error: playlistsError },
    { data: history, error: historyError },
  ] = await Promise.all([
    admin
      .from('favorites')
      .select('resource_id, created_at')
      .eq('owner_id', identity.user.id)
      .eq('resource_type', 'track')
      .order('created_at', { ascending: false }),
    admin
      .from('playlists')
      .select('id, title, description, updated_at')
      .eq('owner_id', identity.user.id)
      .order('updated_at', { ascending: false }),
    admin
      .from('listening_history')
      .select('id, track_id, listened_at, progress_ms, completed')
      .eq('owner_id', identity.user.id)
      .order('listened_at', { ascending: false })
      .limit(20),
  ])
  if (favoritesError || playlistsError || historyError) {
    throw createError({ statusCode: 503, statusMessage: 'The customer library could not load.' })
  }

  const playlistIds = playlists.map(({ id }) => id)
  const { data: playlistTracks, error: playlistTracksError } = playlistIds.length
    ? await admin
        .from('playlist_tracks')
        .select('playlist_id, track_id, position')
        .in('playlist_id', playlistIds)
        .order('position')
    : { data: [], error: null }
  if (playlistTracksError) {
    throw createError({ statusCode: 503, statusMessage: 'Playlist order could not load.' })
  }

  const trackIds = [
    ...new Set([
      ...favorites.map(({ resource_id }) => resource_id),
      ...playlistTracks.map(({ track_id }) => track_id),
      ...history.map(({ track_id }) => track_id),
    ]),
  ]
  const { data: tracks, error: tracksError } = trackIds.length
    ? await admin
        .from('tracks')
        .select('id, slug, title, state')
        .in('id', trackIds)
        .eq('state', 'published')
    : { data: [], error: null }
  if (tracksError) throw createError({ statusCode: 503, statusMessage: 'Library tracks failed.' })
  const trackById = new Map(tracks.map((track) => [track.id, track]))

  return {
    authenticated: true as const,
    favoriteTrackIds: favorites.map(({ resource_id }) => resource_id),
    favorites: favorites.flatMap(({ resource_id, created_at }) => {
      const track = trackById.get(resource_id)
      return track ? [{ ...track, favoritedAt: created_at }] : []
    }),
    playlists: playlists.map((playlist) => ({
      ...playlist,
      tracks: playlistTracks
        .filter(({ playlist_id }) => playlist_id === playlist.id)
        .flatMap(({ track_id, position }) => {
          const track = trackById.get(track_id)
          return track ? [{ ...track, position }] : []
        }),
    })),
    history: history.flatMap((entry) => {
      const track = trackById.get(entry.track_id)
      return track ? [{ ...entry, track }] : []
    }),
  }
})
