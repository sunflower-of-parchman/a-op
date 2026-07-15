import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '../../shared/types/database.ts'

function loadLocalEnvironment() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
    }
  } catch {
    // Hosted workers receive variables from their runtime environment.
  }
}

function requireEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Required document-worker environment variable ${name} is missing.`)
  return value
}

loadLocalEnvironment()
const watch = process.argv.includes('--watch')
const workerId = process.env.LICENSE_DOCUMENT_WORKER_ID ?? `${hostname()}-${process.pid}`
const python = process.env.LICENSE_DOCUMENT_PYTHON ?? 'python3'
const admin = createClient<Database>(
  requireEnvironment('NUXT_PUBLIC_SUPABASE_URL'),
  requireEnvironment('NUXT_SUPABASE_SECRET_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
)

let processed = 0
let failed = 0

while (true) {
  const { data, error } = await admin.rpc('claim_license_document_job', {
    p_worker_id: workerId,
    p_lease_seconds: 300,
  })
  if (error) throw new Error('A license document job could not be claimed.')
  const claim = data?.[0]
  if (!claim) {
    if (!watch) break
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000))
    continue
  }

  const workspace = await mkdtemp(join(tmpdir(), 'artist-license-'))
  const inputPath = join(workspace, 'license.json')
  const outputPath = join(workspace, 'license.pdf')
  try {
    await writeFile(inputPath, `${JSON.stringify(claim.document_payload as Json)}\n`, 'utf8')
    const render = spawnSync(
      python,
      ['workers/documents/render_license.py', '--input', inputPath, '--output', outputPath],
      { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
    )
    if (render.status !== 0) throw new Error('renderer_failed')

    const pdf = await readFile(outputPath)
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('invalid_pdf')
    const sha256 = createHash('sha256').update(pdf).digest('hex')
    const { error: uploadError } = await admin.storage
      .from('license-documents')
      .upload(claim.object_path, pdf, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw new Error('storage_failed')

    const { error: completeError } = await admin.rpc('complete_license_document_job', {
      p_job_id: claim.job_id,
      p_lease_token: claim.lease_token,
      p_object_path: claim.object_path,
      p_byte_size: pdf.byteLength,
      p_sha256: sha256,
    })
    if (completeError) throw new Error('completion_failed')
    processed += 1
    console.log(JSON.stringify({ event: 'license-document-ready', licenseId: claim.license_id }))
  } catch (error) {
    failed += 1
    const errorCode = error instanceof Error ? error.message : 'generation_failed'
    await admin.rpc('fail_license_document_job', {
      p_job_id: claim.job_id,
      p_lease_token: claim.lease_token,
      p_error_code: errorCode,
    })
    console.error(
      JSON.stringify({ event: 'license-document-failed', licenseId: claim.license_id, errorCode }),
    )
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

console.log(JSON.stringify({ event: 'license-document-worker-complete', processed, failed }))
