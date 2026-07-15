import {
  getLocalStatus,
  safeSupabaseError,
  verifyPublicDemonstration,
} from './lib/local-supabase.mjs'

try {
  const status = getLocalStatus()
  await verifyPublicDemonstration(status)
  console.log('Database foundation: PASS')
} catch (error) {
  console.error(`Database foundation: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
