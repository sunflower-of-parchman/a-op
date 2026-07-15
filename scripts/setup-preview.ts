import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateImportProposal } from './import-media.ts'
import {
  configurationDiff,
  contentHash,
  externalSteps,
  localSetupAuthority,
  readBootstrapConfig,
  readPublishedConfig,
  readSetupProposal,
  resolveManifestPath,
  safeManifestLabel,
} from './lib/setup.ts'

const proposalPath = process.argv[2]
if (!proposalPath) throw new Error('Usage: npm run setup:preview -- <proposal.json> [--json]')

const proposal = await readSetupProposal(proposalPath)
const authority = localSetupAuthority()
const current = authority
  ? (await readPublishedConfig(authority.admin)).config
  : readBootstrapConfig()
const currentHash = contentHash(current)
const targetHash = contentHash(proposal.siteConfig)
const baseMatches = proposal.baseConfigHash === currentHash || targetHash === currentHash
const diff = configurationDiff(current, proposal.siteConfig)

let media = {
  manifest: null as string | null,
  tracks: 0,
  release: null as string | null,
  approvalsComplete: true,
}
if (proposal.media.importManifest) {
  const manifestPath = resolveManifestPath(proposalPath, proposal.media.importManifest)
  const manifest = validateImportProposal(JSON.parse(await readFile(resolve(manifestPath), 'utf8')))
  media = {
    manifest: safeManifestLabel(manifestPath),
    tracks: manifest.tracks.length,
    release: manifest.release.title,
    approvalsComplete:
      manifest.confirmations.rightsConfirmed &&
      manifest.confirmations.metadataApproved &&
      manifest.confirmations.publicationApproved &&
      manifest.confirmations.approvedBy !== 'pending',
  }
}

const checkpoints = externalSteps(proposal)
const approvalRecorded = proposal.approval.status === 'approved'
const result = {
  proposalId: proposal.proposalId,
  authority: authority ? 'local-supabase' : 'bootstrap-default',
  baseState: baseMatches ? 'current' : 'stale',
  configuration: {
    changes: diff.length,
    unchanged: diff.length === 0,
    diff,
  },
  media,
  externalActions: checkpoints,
  approval: proposal.approval.status,
  readyForApply: baseMatches && media.approvalsComplete && approvalRecorded,
  applyCommand: `npm run setup:apply -- ${safeManifestLabel(proposalPath) ?? '<proposal.json>'} --confirm-approved-proposal`,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`Setup proposal: ${result.proposalId}`)
  console.log(`Configuration authority: ${result.authority}`)
  console.log(`Base state: ${result.baseState.toUpperCase()}`)
  console.log(`Configuration changes: ${result.configuration.changes}`)
  for (const item of diff) console.log(`  ${item.path}`)
  console.log(`Media manifest: ${media.manifest ?? 'none'}`)
  console.log(`Media tracks: ${media.tracks}`)
  console.log(`Media approvals: ${media.approvalsComplete ? 'COMPLETE' : 'ACTION REQUIRED'}`)
  console.log(`Human approval: ${approvalRecorded ? 'RECORDED' : 'ACTION REQUIRED'}`)
  for (const step of checkpoints) console.log(`External checkpoint: ${step.id} — APPROVAL REQUIRED`)
  console.log(`Ready for local apply: ${result.readyForApply ? 'YES' : 'NO'}`)
}
