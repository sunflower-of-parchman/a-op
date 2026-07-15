import type { LearningCatalogResponse } from '#shared/types/learning'
import { getAuthIdentity } from '../../utils/supabase'
import { loadLearningCatalog } from '../../utils/learning'

export default defineEventHandler(async (event): Promise<LearningCatalogResponse> => {
  const identity = await getAuthIdentity(event)
  return loadLearningCatalog(event, identity?.user.id ?? null)
})
