import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, readJson, redactOutput, runSupabase, writePrivateFile } from './command.mjs'

const bootstrapConfigPath = resolve(projectRoot, 'content/demo/bootstrap-config.json')
const environmentPath = resolve(projectRoot, '.env')

function normalizeKey(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function findStatusValue(input, candidates) {
  const wanted = new Set(candidates.map(normalizeKey))
  const queue = [input]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') continue

    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(normalizeKey(key)) && typeof value === 'string' && value.length > 0) {
        return value
      }
      if (value && typeof value === 'object') queue.push(value)
    }
  }

  return undefined
}

function parseStatusOutput(stdout) {
  const text = String(stdout).trim()
  const jsonStart = text.indexOf('{')
  if (jsonStart < 0) throw new Error('Supabase status did not return JSON.')
  return JSON.parse(text.slice(jsonStart))
}

export function getLocalStatus({ allowFailure = false } = {}) {
  const result = runSupabase(['status', '--output', 'json'], { capture: true, allowFailure })

  if (result.status !== 0) return null

  const raw = parseStatusOutput(result.stdout)
  const status = {
    apiUrl: findStatusValue(raw, ['API_URL', 'api.url']),
    studioUrl: findStatusValue(raw, ['STUDIO_URL', 'studio.url']),
    mailUrl: findStatusValue(raw, ['INBUCKET_URL', 'MAILPIT_URL', 'local_smtp.url']),
    publishableKey: findStatusValue(raw, ['PUBLISHABLE_KEY', 'ANON_KEY']),
    secretKey: findStatusValue(raw, ['SECRET_KEY', 'SERVICE_ROLE_KEY']),
  }

  if (!status.apiUrl || !status.publishableKey || !status.secretKey) {
    throw new Error('Supabase status omitted one or more required local connection fields.')
  }

  return status
}

function parseEnvironmentFile() {
  try {
    return readFileSync(environmentPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .reduce((result, line) => {
        const index = line.indexOf('=')
        if (index > 0 && !line.trimStart().startsWith('#')) {
          result[line.slice(0, index)] = line.slice(index + 1)
        }
        return result
      }, {})
  } catch {
    return {}
  }
}

export function writeLocalEnvironment(status) {
  const current = parseEnvironmentFile()
  const currentUrl = current.NUXT_PUBLIC_SUPABASE_URL

  if (currentUrl && !/^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/)/.test(currentUrl)) {
    throw new Error('Refusing to replace a non-local Supabase environment in .env.')
  }

  const values = {
    ...current,
    NUXT_PUBLIC_SUPABASE_URL: status.apiUrl,
    NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.publishableKey,
    NUXT_PUBLIC_DEMO_MODE: 'true',
    NUXT_SUPABASE_SECRET_KEY: status.secretKey,
    NUXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
  }

  const order = [
    'NUXT_PUBLIC_SUPABASE_URL',
    'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NUXT_PUBLIC_DEMO_MODE',
    'NUXT_SUPABASE_SECRET_KEY',
    'NUXT_PUBLIC_SITE_URL',
    ...Object.keys(values).filter(
      (key) =>
        ![
          'NUXT_PUBLIC_SUPABASE_URL',
          'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
          'NUXT_PUBLIC_DEMO_MODE',
          'NUXT_SUPABASE_SECRET_KEY',
          'NUXT_PUBLIC_SITE_URL',
        ].includes(key),
    ),
  ]

  writePrivateFile(environmentPath, `${order.map((key) => `${key}=${values[key]}`).join('\n')}\n`)
}

export async function seedDemonstrationArtist(status) {
  const config = readJson(bootstrapConfigPath)
  const response = await fetch(`${status.apiUrl}/rest/v1/site_config_versions?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: status.secretKey,
      Authorization: `Bearer ${status.secretKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      id: '00000000-0000-4000-8000-000000000001',
      installation_key: 'primary',
      status: 'published',
      config_schema_version: config.schemaVersion,
      config,
      published_at: '2026-07-14T00:00:00.000Z',
    }),
  })

  if (!response.ok) {
    throw new Error(`Demonstration seed failed with HTTP ${response.status}.`)
  }
}

export async function verifyPublicDemonstration(status) {
  const response = await fetch(
    `${status.apiUrl}/rest/v1/published_site_config?installation_key=eq.primary&select=config_schema_version`,
    {
      headers: {
        apikey: status.publishableKey,
        Authorization: `Bearer ${status.publishableKey}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Public demonstration check failed with HTTP ${response.status}.`)
  }

  const records = await response.json()
  if (!Array.isArray(records) || records.length !== 1 || records[0].config_schema_version !== 1) {
    throw new Error('Public demonstration configuration is missing or duplicated.')
  }
}

export function safeSupabaseError(error) {
  return redactOutput(error instanceof Error ? error.message : String(error))
}
