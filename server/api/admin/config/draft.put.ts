import { createError, readValidatedBody } from 'h3'
import { artistConfigSchema } from '#shared/schemas/artistConfig'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner'])
  const config = await readValidatedBody(event, (body) => artistConfigSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data: existing, error: existingError } = await admin
    .from('site_config_versions')
    .select('id')
    .eq('installation_key', 'primary')
    .eq('status', 'draft')
    .maybeSingle()
  if (existingError) throw createError({ statusCode: 503, statusMessage: 'Draft lookup failed.' })

  const mutation = existing
    ? admin
        .from('site_config_versions')
        .update({ config, updated_by: identity.user.id })
        .eq('id', existing.id)
        .select('id, created_at')
        .single()
    : admin
        .from('site_config_versions')
        .insert({
          installation_key: 'primary',
          status: 'draft',
          config_schema_version: config.schemaVersion,
          config,
          updated_by: identity.user.id,
        })
        .select('id, created_at')
        .single()

  const { data, error } = await mutation
  if (error || !data)
    throw createError({ statusCode: 400, statusMessage: 'Draft could not be saved.' })

  await admin.from('audit_records').insert({
    actor_id: identity.user.id,
    event_type: 'site_config.draft_saved',
    target_type: 'site_config_version',
    target_id: data.id,
  })

  return { draft: data }
})
