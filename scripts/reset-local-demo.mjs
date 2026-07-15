import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, runSupabase } from './lib/command.mjs'
import {
  getLocalStatus,
  safeSupabaseError,
  seedAuthorizationDemonstration,
  seedDemonstrationArtist,
  verifyAuthorizationDemonstration,
  verifyPublicDemonstration,
} from './lib/local-supabase.mjs'

try {
  const before = getLocalStatus({ allowFailure: true })
  if (!before || !/^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/)/.test(before.apiUrl)) {
    throw new Error('Refusing to reset because the active Supabase project is not local.')
  }

  runSupabase(['db', 'reset', '--local'], { capture: true })
  const status = getLocalStatus()
  await seedDemonstrationArtist(status)
  await seedAuthorizationDemonstration(status)
  await verifyPublicDemonstration(status)
  await verifyAuthorizationDemonstration(status)

  const generated = runSupabase(['gen', 'types', '--local', '--schema', 'public'], {
    capture: true,
  })
  writeFileSync(
    resolve(projectRoot, 'shared/types/database.ts'),
    `${generated.stdout.trimEnd()}\n`,
    'utf8',
  )
  console.log('Local demonstration reset: PASS')
} catch (error) {
  console.error(`Local demonstration reset: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
