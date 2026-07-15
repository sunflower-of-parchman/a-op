import type { LearningCatalogResponse } from '#shared/types/learning'
import { getAuthIdentity } from '../../../utils/supabase'
import { loadLearningCatalog } from '../../../utils/learning'

export default defineEventHandler(async (event) => {
  const pathSlug = getRouterParam(event, 'pathSlug')
  const identity = await getAuthIdentity(event)
  const catalog: LearningCatalogResponse = await loadLearningCatalog(
    event,
    identity?.user.id ?? null,
  )
  const path = catalog.paths.find(({ slug }) => slug === pathSlug)
  if (!path) throw createError({ statusCode: 404, statusMessage: 'Learning path not found.' })
  return { path }
})
