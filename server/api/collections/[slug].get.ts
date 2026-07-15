import { createError, getRouterParam, setResponseHeader } from 'h3'
import { getPublicSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'A collection slug is required.' })
  const supabase = getPublicSupabase(event)
  const { data: collection, error } = await supabase
    .from('collections')
    .select('id, slug, title, description')
    .eq('slug', slug)
    .eq('state', 'published')
    .maybeSingle()
  if (error || !collection) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found.' })
  }
  const { data: order, error: orderError } = await supabase
    .from('collection_tracks')
    .select('track_id, position, note')
    .eq('collection_id', collection.id)
    .order('position')
  if (orderError) throw createError({ statusCode: 503, statusMessage: 'Collection order failed.' })
  const trackIds = order.map(({ track_id }) => track_id)
  const [{ data: tracks, error: tracksError }, { data: previews, error: previewsError }] =
    trackIds.length
      ? await Promise.all([
          supabase
            .from('tracks')
            .select('id, slug, title, duration_ms, mood')
            .in('id', trackIds)
            .eq('state', 'published'),
          supabase
            .from('media_objects')
            .select('id, track_id, bucket_id, object_path, media_type')
            .in('track_id', trackIds)
            .eq('kind', 'preview_audio')
            .eq('is_public', true)
            .eq('status', 'ready'),
        ])
      : [{ data: [] }, { data: [] }]
  if (tracksError || previewsError) {
    throw createError({ statusCode: 503, statusMessage: 'Collection media could not be loaded.' })
  }
  const trackById = new Map(tracks?.map((track) => [track.id, track]) ?? [])
  const previewByTrack = new Map(
    previews?.map((preview) => [
      preview.track_id,
      {
        ...preview,
        url: supabase.storage.from(preview.bucket_id).getPublicUrl(preview.object_path).data
          .publicUrl,
      },
    ]) ?? [],
  )
  return {
    collection,
    tracks: order.flatMap((position) => {
      const track = trackById.get(position.track_id)
      return track
        ? [
            {
              ...track,
              position: position.position,
              note: position.note,
              preview: previewByTrack.get(track.id) ?? null,
            },
          ]
        : []
    }),
  }
})
