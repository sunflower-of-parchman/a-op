import { createError, getRouterParam, setResponseHeader } from 'h3'
import { getPublicSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'A track slug is required.' })
  const supabase = getPublicSupabase(event)
  const { data: track, error } = await supabase
    .from('tracks')
    .select(
      'id, slug, title, description, duration_ms, musical_key, meter, tempo_bpm, mood, instruments, explicit, primary_release_id',
    )
    .eq('slug', slug)
    .eq('state', 'published')
    .maybeSingle()
  if (error || !track) throw createError({ statusCode: 404, statusMessage: 'Track not found.' })

  const [{ data: preview }, { data: credits }, { data: release }] = await Promise.all([
    supabase
      .from('media_objects')
      .select('id, bucket_id, object_path, media_type')
      .eq('track_id', track.id)
      .eq('kind', 'preview_audio')
      .eq('is_public', true)
      .eq('status', 'ready')
      .maybeSingle(),
    supabase
      .from('catalog_credits')
      .select('role, name, position')
      .eq('resource_type', 'track')
      .eq('resource_id', track.id)
      .order('position'),
    track.primary_release_id
      ? supabase
          .from('releases')
          .select('slug, title')
          .eq('id', track.primary_release_id)
          .eq('state', 'published')
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  return {
    track,
    release,
    credits,
    preview: preview
      ? {
          ...preview,
          url: supabase.storage.from(preview.bucket_id).getPublicUrl(preview.object_path).data
            .publicUrl,
        }
      : null,
  }
})
