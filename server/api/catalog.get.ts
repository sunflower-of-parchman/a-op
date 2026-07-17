import { setResponseHeader } from 'h3'
import type {
  PublicCatalogCollection,
  PublicCatalogResponse,
  PublicCatalogTrack,
} from '#shared/types/catalog'
import { getPublicSupabase } from '../utils/supabase'

function publicWaveform(metadata: unknown): number[] {
  if (!metadata || typeof metadata !== 'object' || !('waveform' in metadata)) return []
  const waveform = (metadata as { waveform?: unknown }).waveform
  if (!Array.isArray(waveform)) return []
  return waveform
    .filter((point): point is number => typeof point === 'number' && Number.isFinite(point))
    .slice(0, 120)
    .map((point) => Math.min(1, Math.max(0, point)))
}

export default defineEventHandler(async (event): Promise<PublicCatalogResponse> => {
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
  const collectionIds = collections.map(({ id }) => id)
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

  const trackIds = [...new Set(releaseTracks.map(({ track_id }) => track_id))]
  const [
    { data: tracks, error: publicTracksError },
    { data: previews, error: previewsError },
    { data: collectionTracks, error: collectionTracksError },
  ] = await Promise.all([
    trackIds.length
      ? supabase
          .from('tracks')
          .select(
            'id, slug, title, description, duration_ms, musical_key, meter, tempo_bpm, mood, instruments, explicit',
          )
          .in('id', trackIds)
          .eq('state', 'published')
      : Promise.resolve({ data: [], error: null }),
    trackIds.length
      ? supabase
          .from('media_objects')
          .select('id, track_id, bucket_id, object_path, media_type, metadata')
          .in('track_id', trackIds)
          .eq('kind', 'preview_audio')
          .eq('is_public', true)
          .eq('status', 'ready')
      : Promise.resolve({ data: [], error: null }),
    collectionIds.length
      ? supabase
          .from('collection_tracks')
          .select('collection_id, track_id')
          .in('collection_id', collectionIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (publicTracksError || previewsError || collectionTracksError) {
    throw createError({ statusCode: 503, statusMessage: 'Catalog tracks could not be loaded.' })
  }

  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const previewByTrack = new Map(
    previews.map((preview) => [
      preview.track_id,
      {
        id: preview.id,
        track_id: preview.track_id,
        media_type: preview.media_type,
        waveform: publicWaveform(preview.metadata),
        url: supabase.storage.from(preview.bucket_id).getPublicUrl(preview.object_path).data
          .publicUrl,
      },
    ]),
  )
  return {
    releases: releases.map((release) => ({
      ...release,
      tracks: releaseTracks
        .filter(({ release_id }) => release_id === release.id)
        .flatMap(({ track_id, position }): PublicCatalogTrack[] => {
          const track = trackById.get(track_id)
          return track
            ? [
                {
                  ...track,
                  position,
                  preview: previewByTrack.get(track_id) ?? null,
                },
              ]
            : []
        }),
    })),
    collections: collections.map((collection): PublicCatalogCollection => ({
      ...collection,
      trackCount: collectionTracks.filter(({ collection_id }) => collection_id === collection.id)
        .length,
    })),
  }
})
