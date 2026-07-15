import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, runSupabase } from './lib/command.mjs'
import {
  getLocalStatus,
  safeSupabaseError,
  seedDemonstrationArtist,
  verifyPublicDemonstration,
  writeLocalEnvironment,
} from './lib/local-supabase.mjs'

try {
  console.log('Local setup: starting Supabase')
  runSupabase(['start', '--exclude', 'studio'], { capture: true })
  console.log('Local Supabase: running')

  runSupabase(['db', 'reset', '--local'], { capture: true })
  console.log('Migrations: current')

  const status = getLocalStatus()
  writeLocalEnvironment(status)
  await seedDemonstrationArtist(status)
  await verifyPublicDemonstration(status)
  console.log('Demo seed: applied')

  const generated = runSupabase(['gen', 'types', '--local', '--schema', 'public'], {
    capture: true,
  })
  const databaseTypesPath = resolve(projectRoot, 'shared/types/database.ts')
  writeFileSync(databaseTypesPath, generated.stdout, 'utf8')
  console.log('Generated database types: current')

  console.log(`Supabase API: ${status.apiUrl}`)
  if (status.studioUrl) console.log(`Supabase Studio: ${status.studioUrl}`)
  if (status.mailUrl) console.log(`Local mail viewer: ${status.mailUrl}`)
  console.log('Nuxt: http://127.0.0.1:3000')
  console.log('Local setup: PASS')
} catch (error) {
  console.error(`Local setup: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
