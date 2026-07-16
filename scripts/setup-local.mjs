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
  writeLocalEnvironment,
} from './lib/local-supabase.mjs'

function startLocalSupabase() {
  const attempts = process.env.CI === 'true' ? 3 : 2
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      runSupabase(['start', '--exclude', 'studio'], { capture: true })
      return
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        console.warn(
          `Local Supabase: startup attempt ${attempt} failed; retrying with retained image layers`,
        )
      }
    }
  }

  throw lastError
}

try {
  console.log('Local setup: starting Supabase')
  startLocalSupabase()
  console.log('Local Supabase: running')

  const resetTarget = getLocalStatus()
  if (!isLocalSupabaseUrl(resetTarget.apiUrl)) {
    throw new Error('Refusing to reset because the active Supabase project is not local.')
  }

  runSupabase(['db', 'reset', '--local'], { capture: true })
  console.log('Migrations: current')

  const status = getLocalStatus()
  writeLocalEnvironment(status)
  await recoverLocalAuthGateway(status)
  await seedDemonstrationArtist(status)
  await seedAuthorizationDemonstration(status)
  await verifyPublicDemonstration(status)
  await verifyAuthorizationDemonstration(status)
  console.log('Demo seed and authorization fixtures: applied')

  await generateLocalDatabaseTypes()

  console.log(`Supabase API: ${status.apiUrl}`)
  if (status.studioUrl) console.log(`Supabase Studio: ${status.studioUrl}`)
  if (status.mailUrl) console.log(`Local mail viewer: ${status.mailUrl}`)
  console.log('Nuxt: http://127.0.0.1:3000')
  console.log('Local setup: PASS')
} catch (error) {
  console.error(`Local setup: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
