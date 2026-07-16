import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, runSupabase } from './command.mjs'

const registryPullFailure = /toomanyrequests|rate exceeded|error running container/i

export async function generateLocalDatabaseTypes() {
  if (process.env.CI === 'true' && process.env.AOP_GENERATE_DATABASE_TYPES !== '1') {
    console.log('Generated database types: tracked CI artifact retained')
    return false
  }

  const attempts = process.env.CI === 'true' ? 3 : 1
  let generated

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      generated = runSupabase(['gen', 'types', '--local', '--schema', 'public'], {
        capture: true,
      })
      break
    } catch (error) {
      if (attempt >= attempts || !registryPullFailure.test(String(error))) throw error
      console.warn(
        `Generated database types: registry pull attempt ${attempt} was rate-limited; cooling down before retry`,
      )
      await new Promise((resolve) => setTimeout(resolve, attempt * 30_000))
    }
  }

  if (!generated) throw new Error('Database type generation did not return a result.')
  writeFileSync(
    resolve(projectRoot, 'shared/types/database.ts'),
    `${generated.stdout.trimEnd()}\n`,
    'utf8',
  )
  console.log('Generated database types: current')
  return true
}
