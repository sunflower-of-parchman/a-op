import { getRouterParam, readValidatedBody } from 'h3'
import { releaseDraftSchema } from '#shared/schemas/catalog'
import { saveReleaseDraft } from '../../../../utils/catalogAdmin'
import { getAdminSupabase, requireAnyRole } from '../../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const id = getRouterParam(event, 'id')
  const input = await readValidatedBody(event, (body) => releaseDraftSchema.parse(body))
  if (!id || input.id !== id) {
    throw createError({ statusCode: 400, statusMessage: 'The release identifier does not match.' })
  }
  try {
    return { release: await saveReleaseDraft(getAdminSupabase(event), identity, input, id) }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Release draft could not be saved.',
    })
  }
})
