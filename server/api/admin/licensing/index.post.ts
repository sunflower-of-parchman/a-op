import { readValidatedBody } from 'h3'
import { publishLicenseTemplateSchema } from '#shared/schemas/licensing'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner'])
  const input = await readValidatedBody(event, (body) => publishLicenseTemplateSchema.parse(body))
  const { data, error } = await getAdminSupabase(event).rpc('publish_license_template_version', {
    p_actor_id: identity.user.id,
    p_template_id: input.templateId as string,
    p_track_id: input.trackId,
    p_slug: input.slug,
    p_name: input.name,
    p_summary: input.summary,
    p_title: input.title,
    p_introduction: input.introduction,
    p_general_terms: input.generalTerms,
    p_disclaimer: input.disclaimer,
    p_options: input.options,
  })
  if (error || !data?.[0]) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The licensing version was not published.',
    })
  }
  return data[0]
})
