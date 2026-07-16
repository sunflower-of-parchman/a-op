import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, runSupabase } from './command.mjs'

export function generateLocalDatabaseTypes() {
  if (process.env.CI === 'true' && process.env.AOP_GENERATE_DATABASE_TYPES !== '1') {
    console.log('Generated database types: tracked CI artifact retained')
    return false
  }

  const generated = runSupabase(['gen', 'types', '--local', '--schema', 'public'], {
    capture: true,
  })
  writeFileSync(
    resolve(projectRoot, 'shared/types/database.ts'),
    `${generated.stdout.trimEnd()}\n`,
    'utf8',
  )
  console.log('Generated database types: current')
  return true
}
