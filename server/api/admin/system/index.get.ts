import { requireAnyRole } from '../../../utils/supabase'
import { loadOperationalStatus } from '../../../utils/telemetry'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner'])
  return loadOperationalStatus(event)
})
