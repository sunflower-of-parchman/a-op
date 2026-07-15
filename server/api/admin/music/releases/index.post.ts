import { readValidatedBody } from 'h3'
import { releaseDraftSchema } from '#shared/schemas/catalog'
import { saveReleaseDraft } from '../../../../utils/catalogAdmin'
import { getAdminSupabase, requireAnyRole } from '../../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const input = await readValidatedBody(event, (body) => releaseDraftSchema.parse(body))
  try {
    return { release: await saveReleaseDraft(getAdminSupabase(event), identity, input) }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Release draft could not be saved.',
    })
  }
})
