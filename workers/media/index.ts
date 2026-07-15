import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { resolve } from 'node:path'
import { createMediaWorker } from './processor.ts'

function loadLocalEnvironment() {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
    }
  } catch {
    // Hosted workers receive variables from their runtime environment.
  }
}

function requireEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Required worker environment variable ${name} is missing.`)
  return value
}

loadLocalEnvironment()
const watch = process.argv.includes('--watch')
const workerId = process.env.MEDIA_WORKER_ID ?? `${hostname()}-${process.pid}`
const worker = createMediaWorker({
  supabaseUrl: requireEnvironment('NUXT_PUBLIC_SUPABASE_URL'),
  supabaseSecretKey: requireEnvironment('NUXT_SUPABASE_SECRET_KEY'),
  workerId,
  previewSeconds: Number(process.env.MEDIA_PREVIEW_SECONDS ?? 30),
  previewBitrate: process.env.MEDIA_PREVIEW_BITRATE ?? '192k',
})

let processed = 0
let failed = 0

while (true) {
  const claim = await worker.claimMediaJob()
  if (!claim) {
    if (!watch) break
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000))
    continue
  }

  try {
    const result = await worker.processMediaJob(claim)
    processed += 1
    console.log(
      JSON.stringify({
        event: 'media-job-ready',
        jobId: claim.jobId,
        mediaId: claim.mediaId,
        ...result,
      }),
    )
  } catch (error) {
    failed += 1
    console.error(
      JSON.stringify({
        event: 'media-job-failed',
        jobId: claim.jobId,
        mediaId: claim.mediaId,
        category: error instanceof Error ? error.message : 'media-processing-failed',
      }),
    )
  }
}

console.log(JSON.stringify({ event: 'media-worker-complete', processed, failed }))
