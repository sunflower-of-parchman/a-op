import { createError, getRouterParam } from 'h3'
import { getPublicSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'A release slug is required.' })

  const supabase = getPublicSupabase(event)
  const { data: release, error: releaseError } = await supabase
    .from('releases')
    .select('id, slug, title, description, release_date')
    .eq('slug', slug)
    .eq('state', 'published')
    .maybeSingle()

  if (releaseError || !release) {
    throw createError({ statusCode: 404, statusMessage: 'The release was not found.' })
  }

  const { data: preview, error: previewError } = await supabase
    .from('media_objects')
    .select('id, bucket_id, object_path, media_type')
    .eq('release_id', release.id)
    .eq('kind', 'preview_audio')
    .eq('is_public', true)
    .eq('status', 'ready')
    .maybeSingle()

  if (previewError) {
    throw createError({ statusCode: 503, statusMessage: 'Release media could not be loaded.' })
  }

  const publicUrl = preview
    ? supabase.storage.from(preview.bucket_id).getPublicUrl(preview.object_path).data.publicUrl
    : undefined

  return { release, preview: preview ? { ...preview, url: publicUrl } : null }
})
