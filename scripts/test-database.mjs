import {
  getLocalStatus,
  safeSupabaseError,
  verifyAuthorizationDemonstration,
  verifyPublicDemonstration,
} from './lib/local-supabase.mjs'

try {
  const status = getLocalStatus()
  await verifyPublicDemonstration(status)
  await verifyAuthorizationDemonstration(status)
  console.log('Database foundation: PASS')
} catch (error) {
  console.error(`Database foundation: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
