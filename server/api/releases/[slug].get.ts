import { createError, getRouterParam, setResponseHeader } from 'h3'
import { getPublicSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'A release slug is required.' })

  const supabase = getPublicSupabase(event)
  const { data: release, error: releaseError } = await supabase
    .from('releases')
    .select(
      'id, slug, title, subtitle, description, release_date, release_type, label, catalog_number, genre, mood',
    )
    .eq('slug', slug)
    .eq('state', 'published')
    .maybeSingle()

  if (releaseError || !release) {
    throw createError({ statusCode: 404, statusMessage: 'The release was not found.' })
  }

  const [{ data: order, error: orderError }, { data: credits, error: creditsError }] =
    await Promise.all([
      supabase
        .from('release_tracks')
        .select('track_id, disc_number, position')
        .eq('release_id', release.id)
        .order('disc_number')
        .order('position'),
      supabase
        .from('catalog_credits')
        .select('role, name, position')
        .eq('resource_type', 'release')
        .eq('resource_id', release.id)
        .order('position'),
    ])
  if (orderError || creditsError) {
    throw createError({ statusCode: 503, statusMessage: 'Release details could not be loaded.' })
  }

  const trackIds = order.map(({ track_id }) => track_id)
  const [{ data: tracks, error: tracksError }, { data: previews, error: previewsError }] =
    trackIds.length
      ? await Promise.all([
          supabase
            .from('tracks')
            .select(
              'id, slug, title, description, duration_ms, musical_key, meter, tempo_bpm, mood, instruments, explicit',
            )
            .in('id', trackIds)
            .eq('state', 'published'),
          supabase
            .from('media_objects')
            .select('id, track_id, bucket_id, object_path, media_type, metadata')
            .in('track_id', trackIds)
            .eq('kind', 'preview_audio')
            .eq('is_public', true)
            .eq('status', 'ready'),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ]
  if (tracksError || previewsError) {
    throw createError({ statusCode: 503, statusMessage: 'Release media could not be loaded.' })
  }

  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const previewByTrack = new Map(
    previews.map((preview) => [
      preview.track_id,
      {
        ...preview,
        url: supabase.storage.from(preview.bucket_id).getPublicUrl(preview.object_path).data
          .publicUrl,
      },
    ]),
  )
  return {
    release,
    credits,
    tracks: order.flatMap((position) => {
      const track = trackById.get(position.track_id)
      return track
        ? [
            {
              ...track,
              discNumber: position.disc_number,
              position: position.position,
              preview: previewByTrack.get(track.id) ?? null,
            },
          ]
        : []
    }),
  }
})
