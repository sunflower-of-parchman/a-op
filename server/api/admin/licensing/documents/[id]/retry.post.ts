import { getRouterParam } from 'h3'
import { getAdminSupabase, requireAnyRole } from '../../../../../utils/supabase'
import { requestWorkerRun } from '../../../../../utils/workerServices'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner'])
  const licenseId = getRouterParam(event, 'id')
  if (!licenseId) {
    throw createError({ statusCode: 400, statusMessage: 'A license identifier is required.' })
  }
  const { error } = await getAdminSupabase(event).rpc('retry_license_document_job', {
    p_actor_id: identity.user.id,
    p_license_id: licenseId,
  })
  if (error) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The license document could not be retried.',
    })
  }
  await requestWorkerRun(event, 'documents')
  return { queued: true }
})
