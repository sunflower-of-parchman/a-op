import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { getLocalStatus, safeSupabaseError } from './lib/local-supabase.mjs'
import { projectRoot } from './lib/command.mjs'

function filesBelow(path) {
  const results = []
  for (const entry of readdirSync(path)) {
    const candidate = resolve(path, entry)
    if (statSync(candidate).isDirectory()) results.push(...filesBelow(candidate))
    else results.push(candidate)
  }
  return results
}

try {
  const status = getLocalStatus()
  const publicOutput = resolve(projectRoot, '.output/public')
  const secretValues = [
    status.secretKey,
    process.env.NUXT_STRIPE_SECRET_KEY,
    process.env.NUXT_STRIPE_WEBHOOK_SECRET,
    process.env.NUXT_MEDIA_WORKER_SECRET,
  ].filter((value) => typeof value === 'string' && value.length > 0)

  for (const path of filesBelow(publicOutput)) {
    const content = readFileSync(path)
    for (const secret of secretValues) {
      if (content.includes(Buffer.from(secret))) {
        throw new Error(`A server-only value was found in browser output: ${path}`)
      }
    }
  }

  console.log('Browser secret scan: PASS')
} catch (error) {
  console.error(`Browser secret scan: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
