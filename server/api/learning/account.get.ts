import type { LearningAccountResponse } from '#shared/types/learning'
import { getAuthIdentity } from '../../utils/supabase'
import { loadLearningCatalog } from '../../utils/learning'

export default defineEventHandler(async (event): Promise<LearningAccountResponse> => {
  const identity = await getAuthIdentity(event)
  if (!identity) return { authenticated: false }
  const catalog = await loadLearningCatalog(event, identity.user.id)
  return { authenticated: true, paths: catalog.paths }
})
