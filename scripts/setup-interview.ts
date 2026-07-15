import { writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { setupInterviewQuestions, setupProposalSchema } from '../shared/schemas/setup.ts'
import { contentHash, readBootstrapConfig } from './lib/setup.ts'
import { projectRoot } from './lib/command.mjs'

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const config = readBootstrapConfig()
const proposalId = argument('--proposal-id') ?? 'artist-setup-draft'
const createdAt = new Date().toISOString()
const placeholder = 'Discuss this with the artist before completing the proposal.'
const proposalTemplate = setupProposalSchema.parse({
  schemaVersion: 1,
  proposalId,
  createdAt,
  baseConfigHash: contentHash(config),
  answers: Object.fromEntries(setupInterviewQuestions.map(({ id }) => [id, placeholder])),
  siteConfig: config,
  media: { importManifest: null, processAfterApply: true },
  services: {
    supabase: 'local',
    authentication: { email: true, oauthProviders: [] },
    stripe: 'simulation',
    hosting: 'local',
    domain: 'local',
    email: 'local-capture',
  },
  approval: {
    status: 'draft',
    approvedBy: null,
    approvedAt: null,
    localApplyConfirmation: false,
  },
})

const contract = {
  lifecycle: [
    'interview',
    'structured proposal',
    'validated preview and diff',
    'explicit human approval',
    'deterministic application',
    'verification',
    'project-state update',
  ],
  boundaries: {
    human: ['identity', 'rights', 'prices', 'accounts', 'costs', 'publication'],
    codex: ['proposal', 'local implementation', 'validation', 'verification', 'documentation'],
    externalActions: 'Separate action-specific approval is always required.',
    secrets: 'Never place credentials or tokens in a proposal.',
  },
  questions: setupInterviewQuestions,
  proposalTemplate,
}

const output = argument('--out')
if (output) {
  const path = resolve(output)
  const proposalDirectory = resolve(projectRoot, 'setup/proposals')
  if (!path.startsWith(`${proposalDirectory}${sep}`) || !path.endsWith('.json')) {
    throw new Error('Interview proposals must be new JSON files inside setup/proposals/.')
  }
  await writeFile(path, `${JSON.stringify(proposalTemplate, null, 2)}\n`, { flag: 'wx' })
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(contract, null, 2))
} else {
  console.log('Artist-Owned Platform setup interview')
  for (const [index, question] of setupInterviewQuestions.entries()) {
    console.log(`${index + 1}. ${question.prompt}`)
  }
  console.log('')
  console.log(`Proposal template: ${output ? 'CREATED' : 'use --out setup/proposals/<id>.json'}`)
  console.log('External actions: APPROVAL REQUIRED')
}
