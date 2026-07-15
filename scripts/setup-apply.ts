import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Json } from '../shared/types/database.ts'
import { applyApprovedImport, validateImportProposal, type ImportResult } from './import-media.ts'
import { projectRoot, readJson, run, writeJsonIfChanged } from './lib/command.mjs'
import {
  contentHash,
  enabledModules,
  externalSteps,
  localSetupAuthority,
  readPublishedConfig,
  readSetupProposal,
  resolveManifestPath,
  stableUuid,
} from './lib/setup.ts'

const proposalPath = process.argv[2]
if (!proposalPath || !process.argv.includes('--confirm-approved-proposal')) {
  throw new Error(
    'Applying setup requires a proposal path and --confirm-approved-proposal after human approval.',
  )
}

const proposal = await readSetupProposal(proposalPath)
if (proposal.approval.status !== 'approved' || !proposal.approval.localApplyConfirmation) {
  throw new Error('The proposal does not contain the required explicit local-application approval.')
}

const authority = localSetupAuthority()
if (!authority) {
  throw new Error('Setup application supports the local Supabase installation only.')
}
const { admin } = authority
const current = await readPublishedConfig(admin)
const currentHash = contentHash(current.config)
const targetHash = contentHash(proposal.siteConfig)
const proposalHash = contentHash(proposal)
if (currentHash !== targetHash && currentHash !== proposal.baseConfigHash) {
  throw new Error(
    'The published configuration changed after this proposal was created. Preview a new proposal.',
  )
}

const statePath = resolve(projectRoot, 'setup/project-state.json')
const previousState = readJson(statePath)
const previousApplication = previousState.personalization?.proposalHash === proposalHash
let configuration = 'unchanged'

if (currentHash !== targetHash) {
  const { data: ownerRole, error: ownerError } = await admin
    .from('app_roles')
    .select('user_id, granted_at')
    .eq('role', 'owner')
    .order('granted_at')
    .limit(1)
    .single()
  if (ownerError || !ownerRole) throw new Error('A verified owner is required before setup apply.')

  const versionId = stableUuid(`setup-config:${proposalHash}:${proposal.baseConfigHash}`)
  const { data: otherDraft, error: draftError } = await admin
    .from('site_config_versions')
    .select('id')
    .eq('installation_key', 'primary')
    .eq('status', 'draft')
    .neq('id', versionId)
    .maybeSingle()
  if (draftError) throw new Error('The existing configuration draft could not be checked.')
  if (otherDraft) {
    throw new Error(
      'A separate artist configuration draft already exists. Review it before setup apply.',
    )
  }

  const { data: existingVersion, error: existingError } = await admin
    .from('site_config_versions')
    .select('id')
    .eq('id', versionId)
    .maybeSingle()
  if (existingError)
    throw new Error('The deterministic configuration version could not be checked.')

  const version = {
    installation_key: 'primary',
    status: 'draft',
    config_schema_version: proposal.siteConfig.schemaVersion,
    config: proposal.siteConfig as unknown as Json,
    updated_by: ownerRole.user_id,
  }
  const versionError = existingVersion
    ? (await admin.from('site_config_versions').update(version).eq('id', versionId)).error
    : (await admin.from('site_config_versions').insert({ id: versionId, ...version })).error
  if (versionError) throw new Error('The approved configuration could not be staged.')

  const { error: publishError } = await admin.rpc('publish_site_config', {
    p_version_id: versionId,
    p_actor_id: ownerRole.user_id,
  })
  if (publishError) throw new Error('The approved configuration could not be published locally.')
  configuration = 'published'
}

let mediaResult: ImportResult = {
  releaseId: '',
  tracksApplied: 0,
  sourcesCreated: 0,
  sourcesReused: 0,
  jobsCreated: 0,
}
if (proposal.media.importManifest) {
  const manifestPath = resolveManifestPath(proposalPath, proposal.media.importManifest)
  const manifest = validateImportProposal(JSON.parse(await readFile(manifestPath, 'utf8')))
  const { data: existingRelease } = await admin
    .from('releases')
    .select('id')
    .eq('id', manifest.release.stableId)
    .maybeSingle()
  if (!previousApplication || !existingRelease) {
    mediaResult = await applyApprovedImport(manifest)
    if (proposal.media.processAfterApply) {
      run(process.execPath, ['--experimental-strip-types', 'workers/media/index.ts', '--once'], {
        capture: true,
        env: { ...process.env, MEDIA_WORKER_ID: 'codex-setup-worker' },
      })
    }
  } else {
    mediaResult = {
      releaseId: manifest.release.stableId,
      tracksApplied: manifest.tracks.length,
      sourcesCreated: 0,
      sourcesReused: manifest.tracks.length,
      jobsCreated: 0,
    }
  }
}

const verification = run(
  process.execPath,
  ['--experimental-strip-types', 'scripts/setup-check.mjs', '--json'],
  { capture: true },
)
const verificationResult = JSON.parse(verification.stdout)
if (verificationResult.overall !== 'pass')
  throw new Error('Post-application setup verification failed.')

const state = readJson(statePath)
const appliedAt = previousApplication
  ? previousState.personalization.appliedAt
  : new Date().toISOString()
state.schemaVersion = 3
state.installationMode = 'local'
state.artistConfigVersion = proposal.siteConfig.schemaVersion
state.enabledModules = enabledModules(proposal.siteConfig)
state.checks.setupLifecycle = 'pass'
state.checks.personalization = 'pass'
state.externalActions = {
  repositoryPublication: 'approval-required',
  hostedDeployment: proposal.services.hosting === 'local' ? 'not-requested' : 'approval-required',
  domain: proposal.services.domain === 'local' ? 'not-requested' : 'approval-required',
  stripeTestConnection:
    proposal.services.stripe === 'simulation' ? 'not-requested' : 'approval-required',
  stripeLiveMode: proposal.services.stripe === 'live-later' ? 'approval-required' : 'not-requested',
  oauth: proposal.services.authentication.oauthProviders.length
    ? 'approval-required'
    : 'not-requested',
  emailProvider:
    proposal.services.email === 'local-capture' ? 'not-requested' : 'approval-required',
  mediaWorkerDeployment:
    proposal.services.hosting === 'local' ? 'not-requested' : 'approval-required',
}
state.personalization = {
  proposalId: proposal.proposalId,
  proposalHash,
  configHash: targetHash,
  appliedAt,
  media: {
    releaseId: mediaResult.releaseId || null,
    tracksApplied: mediaResult.tracksApplied,
  },
}
state.remainingExternalSteps = externalSteps(proposal)
writeJsonIfChanged(statePath, state)

console.log(
  JSON.stringify({
    event: 'setup-proposal-applied',
    proposalId: proposal.proposalId,
    configuration,
    media: {
      releaseId: mediaResult.releaseId || null,
      tracksApplied: mediaResult.tracksApplied,
      sourcesCreated: mediaResult.sourcesCreated,
      sourcesReused: mediaResult.sourcesReused,
      jobsCreated: mediaResult.jobsCreated,
    },
    verification: 'pass',
    projectState: 'updated',
    externalActions: state.remainingExternalSteps.map(({ id }: { id: string }) => id),
  }),
)
