import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { artistConfigSchema, type ArtistConfig } from '../../shared/schemas/artistConfig.ts'
import {
  projectStateSchema,
  setupProposalSchema,
  type ProjectState,
  type SetupProposal,
} from '../../shared/schemas/setup.ts'
import type { Database, Json } from '../../shared/types/database.ts'
import { projectRoot, readJson } from './command.mjs'
import { createAdminClient, getLocalStatus } from './local-supabase.mjs'

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function contentHash(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function stableUuid(value: string) {
  const hash = createHash('sha256').update(value).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export function readBootstrapConfig(): ArtistConfig {
  return artistConfigSchema.parse(
    readJson(resolve(projectRoot, 'content/demo/bootstrap-config.json')),
  )
}

export async function readSetupProposal(path: string): Promise<SetupProposal> {
  return setupProposalSchema.parse(JSON.parse(await readFile(resolve(path), 'utf8')))
}

export function resolveManifestPath(proposalPath: string, manifestPath: string) {
  return isAbsolute(manifestPath)
    ? resolve(manifestPath)
    : resolve(dirname(resolve(proposalPath)), manifestPath)
}

export function safeManifestLabel(path: string | null) {
  return path ? basename(path) : null
}

export function localSetupAuthority() {
  const status = getLocalStatus({ allowFailure: true })
  if (!status) return null
  const url = new URL(status.apiUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return null
  return { status, admin: createAdminClient(status) }
}

export async function readPublishedConfig(
  admin: SupabaseClient<Database>,
): Promise<{ id: string; config: ArtistConfig }> {
  const { data, error } = await admin
    .from('site_config_versions')
    .select('id, config')
    .eq('installation_key', 'primary')
    .eq('status', 'published')
    .single()
  if (error || !data) throw new Error('The current published artist configuration is unavailable.')
  return { id: data.id, config: artistConfigSchema.parse(data.config) }
}

export function readProjectState(): ProjectState {
  return projectStateSchema.parse(readJson(resolve(projectRoot, 'setup/project-state.json')))
}

type DiffEntry = { path: string; before: Json | undefined; after: Json | undefined }

export function configurationDiff(before: unknown, after: unknown, path = ''): DiffEntry[] {
  if (canonicalJson(before) === canonicalJson(after)) return []
  if (
    !before ||
    !after ||
    typeof before !== 'object' ||
    typeof after !== 'object' ||
    Array.isArray(before) ||
    Array.isArray(after)
  ) {
    return [{ path: path || '$', before: before as Json, after: after as Json }]
  }

  const left = before as Record<string, unknown>
  const right = after as Record<string, unknown>
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .flatMap((key) => configurationDiff(left[key], right[key], path ? `${path}.${key}` : key))
}

export function externalSteps(proposal: SetupProposal) {
  const steps: ProjectState['remainingExternalSteps'] = []
  if (proposal.services.supabase === 'hosted-later') {
    steps.push({
      id: 'supabase-hosted',
      status: 'approval-required',
      runbook: 'docs/agent/supabase.md',
    })
  }
  if (proposal.services.authentication.oauthProviders.length) {
    steps.push({
      id: 'authentication-oauth',
      status: 'approval-required',
      runbook: 'docs/agent/authentication-oauth.md',
    })
  }
  if (proposal.services.stripe !== 'simulation') {
    steps.push({
      id: 'stripe-account',
      status: 'approval-required',
      runbook: 'docs/agent/stripe.md',
    })
  }
  if (proposal.services.hosting !== 'local' || proposal.services.domain !== 'local') {
    steps.push({
      id: 'hosting-domain',
      status: 'approval-required',
      runbook: 'docs/agent/vercel-domain.md',
    })
  }
  if (proposal.services.email === 'provider-later') {
    steps.push({
      id: 'email-provider',
      status: 'approval-required',
      runbook: 'docs/agent/email.md',
    })
  }
  return steps
}

export function enabledModules(config: ArtistConfig): ProjectState['enabledModules'] {
  return (Object.entries(config.features) as Array<[keyof ArtistConfig['features'], boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
}
