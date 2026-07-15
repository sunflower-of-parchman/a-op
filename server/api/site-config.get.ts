import { createError, setResponseHeader } from 'h3'
import { artistConfigSchema } from '#shared/schemas/artistConfig'
import { getPublicSupabase } from '../utils/supabase'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const supabase = getPublicSupabase(event)
  const { data, error } = await supabase
    .from('published_site_config')
    .select('id, config_schema_version, config, published_at')
    .eq('installation_key', 'primary')
    .maybeSingle()

  if (error || !data) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Published site configuration is unavailable.',
    })
  }

  const parsed = artistConfigSchema.safeParse(data.config)
  if (!parsed.success) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Published site configuration is invalid.',
    })
  }

  return { id: data.id, config: parsed.data, publishedAt: data.published_at }
})
