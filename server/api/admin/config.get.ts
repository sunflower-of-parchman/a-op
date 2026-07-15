import { artistConfigSchema } from '#shared/schemas/artistConfig'
import { getAdminSupabase, requireAnyRole } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner'])
  const admin = getAdminSupabase(event)
  const { data, error } = await admin
    .from('site_config_versions')
    .select('id, status, config, created_at, published_at')
    .eq('installation_key', 'primary')
    .in('status', ['draft', 'published'])
    .order('created_at', { ascending: false })

  if (error)
    throw createError({ statusCode: 503, statusMessage: 'Configuration could not be loaded.' })

  const normalized = data.map((version) => ({
    ...version,
    config: artistConfigSchema.parse(version.config),
  }))

  return {
    published: normalized.find(({ status }) => status === 'published') ?? null,
    draft: normalized.find(({ status }) => status === 'draft') ?? null,
  }
})
