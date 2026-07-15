import { getRouterParam, readValidatedBody } from 'h3'
import { collectionDraftSchema } from '#shared/schemas/catalog'
import { saveCollectionDraft } from '../../../utils/catalogAdmin'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner', 'editor'])
  const id = getRouterParam(event, 'id')
  const input = await readValidatedBody(event, (body) => collectionDraftSchema.parse(body))
  if (!id || input.id !== id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'The collection identifier does not match.',
    })
  }
  try {
    return {
      collection: await saveCollectionDraft(getAdminSupabase(event), identity, input, id),
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error instanceof Error ? error.message : 'Collection draft could not be saved.',
    })
  }
})
