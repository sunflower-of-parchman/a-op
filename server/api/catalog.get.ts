import { setResponseHeader } from 'h3'
import { getPublicSupabase } from '../utils/supabase'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const supabase = getPublicSupabase(event)
  const [{ data: releases, error: releasesError }, { data: collections, error: collectionsError }] =
    await Promise.all([
      supabase
        .from('releases')
        .select('id, slug, title, subtitle, description, release_date, release_type, genre, mood')
        .eq('state', 'published')
        .order('sort_order')
        .order('release_date', { ascending: false }),
      supabase
        .from('collections')
        .select('id, slug, title, description')
        .eq('state', 'published')
        .order('sort_order'),
    ])

  if (releasesError || collectionsError) {
    throw createError({ statusCode: 503, statusMessage: 'The public catalog could not be loaded.' })
  }

  const releaseIds = releases.map(({ id }) => id)
  const { data: releaseTracks, error: tracksError } = releaseIds.length
    ? await supabase
        .from('release_tracks')
        .select('release_id, track_id, position')
        .in('release_id', releaseIds)
        .order('position')
    : { data: [], error: null }
  if (tracksError) {
    throw createError({ statusCode: 503, statusMessage: 'Catalog ordering could not be loaded.' })
  }

  const trackIds = releaseTracks.map(({ track_id }) => track_id)
  const { data: tracks, error: publicTracksError } = trackIds.length
    ? await supabase
        .from('tracks')
        .select('id, slug, title, duration_ms')
        .in('id', trackIds)
        .eq('state', 'published')
    : { data: [], error: null }
  if (publicTracksError) {
    throw createError({ statusCode: 503, statusMessage: 'Catalog tracks could not be loaded.' })
  }

  const trackById = new Map(tracks.map((track) => [track.id, track]))
  return {
    releases: releases.map((release) => ({
      ...release,
      tracks: releaseTracks
        .filter(({ release_id }) => release_id === release.id)
        .map(({ track_id, position }) => ({ ...trackById.get(track_id), position }))
        .filter(({ id }) => id),
    })),
    collections,
  }
})
