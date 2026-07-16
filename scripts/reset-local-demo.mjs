import { runSupabase } from './lib/command.mjs'
import { generateLocalDatabaseTypes } from './lib/database-types.mjs'
import {
  getLocalStatus,
  isLocalSupabaseUrl,
  recoverLocalAuthGateway,
  safeSupabaseError,
  seedAuthorizationDemonstration,
  seedDemonstrationArtist,
  verifyAuthorizationDemonstration,
  verifyPublicDemonstration,
} from './lib/local-supabase.mjs'

try {
  const before = getLocalStatus({ allowFailure: true })
  if (!before || !isLocalSupabaseUrl(before.apiUrl)) {
    throw new Error('Refusing to reset because the active Supabase project is not local.')
  }

  runSupabase(['db', 'reset', '--local'], { capture: true })
  const status = getLocalStatus()
  await recoverLocalAuthGateway(status)
  await seedDemonstrationArtist(status)
  await seedAuthorizationDemonstration(status)
  await verifyPublicDemonstration(status)
  await verifyAuthorizationDemonstration(status)

  generateLocalDatabaseTypes()
  console.log('Local demonstration reset: PASS')
} catch (error) {
  console.error(`Local demonstration reset: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
