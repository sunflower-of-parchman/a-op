import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { artistConfigSchema } from '../shared/schemas/artistConfig.ts'
import { setupProposalSchema } from '../shared/schemas/setup.ts'
import { inspectMedia } from './import-media.ts'
import { projectRoot, run } from './lib/command.mjs'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { contentHash } from './lib/setup.ts'
import { safeSupabaseError } from './lib/local-supabase.mjs'

const statePath = resolve(projectRoot, 'setup/project-state.json')
const workspace = await mkdtemp(join(tmpdir(), 'artist-setup-test-'))
const originalState = await readFile(statePath, 'utf8')

function execute(script: string, args: string[] = [], allowFailure = false) {
  return run(process.execPath, ['--experimental-strip-types', script, ...args], {
    cwd: projectRoot,
    capture: true,
    allowFailure,
  })
}

function makeTone(path: string, frequency: number) {
  run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${frequency}:duration=2`,
      '-codec:a',
      'pcm_s16le',
      path,
    ],
    { capture: true },
  )
}

try {
  execute('scripts/reset-local-demo.mjs')
  const { admin, status } = await getAuthorityTestContext()
  const interview = JSON.parse(execute('scripts/setup-interview.ts', ['--json']).stdout)
  assert.equal(interview.lifecycle.length, 7)
  assert.equal(interview.questions.length, 14)
  assert.equal(
    interview.boundaries.externalActions,
    'Separate action-specific approval is always required.',
  )

  const sourceDirectory = join(workspace, 'approved-two-track-study')
  const mediaPath = join(workspace, 'approved-media.json')
  const proposalPath = join(workspace, 'fictional-artist-setup.json')
  await mkdir(sourceDirectory)
  makeTone(join(sourceDirectory, '01 opening.wav'), 330)
  makeTone(join(sourceDirectory, '02 returning.wav'), 440)
  const media = await inspectMedia(sourceDirectory)
  media.release.slug = 'north-window-studies'
  media.release.title = 'North Window Studies'
  media.release.description = 'Two fictional tones created only for the setup lifecycle proof.'
  media.release.releaseDate = '2026-07-15'
  media.tracks[0]!.proposed.description = 'A fictional opening tone.'
  media.tracks[1]!.proposed.description = 'A fictional returning tone.'
  media.confirmations = {
    rightsConfirmed: true,
    metadataApproved: true,
    publicationApproved: true,
    approvedBy: 'Fictional setup integration artist',
  }
  await writeFile(mediaPath, `${JSON.stringify(media, null, 2)}\n`)

  const { data: publishedBefore, error: publishedBeforeError } = await admin
    .from('site_config_versions')
    .select('config')
    .eq('installation_key', 'primary')
    .eq('status', 'published')
    .single()
  requireNoError(publishedBeforeError, 'Published setup baseline lookup failed')
  const currentConfig = artistConfigSchema.parse(publishedBefore.config)
  const targetConfig = structuredClone(currentConfig)
  targetConfig.identity.name = 'North Window Practice'
  targetConfig.identity.eyebrow = 'Fictional composer · listening guide'
  targetConfig.identity.statement = 'Small studies for close listening and shared movement.'
  targetConfig.identity.biography =
    'North Window Practice is a fictional artist used to verify the complete Codex-guided setup lifecycle.'
  targetConfig.design.logo.wordmark = 'NORTH WINDOW PRACTICE'
  targetConfig.design.colors.accent = '#2f6b62'
  targetConfig.seo.title = 'North Window Practice'
  targetConfig.seo.description =
    'Fictional music, learning, and direct artist relationships in one independent home.'
  targetConfig.footer.statement = targetConfig.identity.statement
  targetConfig.homepage.kicker = 'Fictional studies, directly held'
  targetConfig.homepage.introduction =
    'Listen, learn, and follow the work through a site this fictional artist controls.'
  targetConfig.homepage.release = {
    title: media.release.title,
    year: 2026,
    format: 'Two listening studies',
    description: media.release.description,
    href: `/music/${media.release.slug}`,
  }

  const answers = {
    identity: 'North Window Practice is a fictional composer and listening guide.',
    audience:
      'Dancers, musicians, and attentive listeners should begin by hearing one short study.',
    siteGoals:
      'Listening, teaching, licensing, membership, direct support, and contact remain enabled.',
    visualDirection: 'Warm paper, dark ink, a quiet green accent, open space, and editorial type.',
    pages:
      'Music, support, licensing, learn, about, contact, account, video, and journal remain available.',
    catalog: 'Two generated WAV tones in the temporary test directory are approved for this proof.',
    commerce:
      'Use the local simulation until the artist separately approves a Stripe test account.',
    licensing:
      'Keep the fictional explicit non-exclusive demonstration terms and inquiry boundary.',
    memberships: 'Keep the fictional demonstration membership without connecting billing.',
    learning: 'Keep the fictional three-lesson path and all four access modes.',
    video: 'Keep the approved official sample embed behind visitor consent.',
    contact: 'Store messages locally and send no external email.',
    privacy: 'Use explicit opt-in first-party analytics with the existing retention boundary.',
    deployment:
      'Record hosted Supabase, OAuth, Stripe test, email, Vercel, and DNS as future approval checkpoints.',
  }
  const draft = setupProposalSchema.parse({
    schemaVersion: 1,
    proposalId: 'north-window-practice',
    createdAt: new Date().toISOString(),
    baseConfigHash: contentHash(currentConfig),
    answers,
    siteConfig: targetConfig,
    media: { importManifest: mediaPath, processAfterApply: true },
    services: {
      supabase: 'hosted-later',
      authentication: { email: true, oauthProviders: ['google'] },
      stripe: 'test-later',
      hosting: 'vercel-later',
      domain: 'custom-later',
      email: 'provider-later',
    },
    approval: {
      status: 'draft',
      approvedBy: null,
      approvedAt: null,
      localApplyConfirmation: false,
    },
  })
  await writeFile(proposalPath, `${JSON.stringify(draft, null, 2)}\n`)

  const stateBeforePreview = await readFile(statePath, 'utf8')
  const preview = JSON.parse(execute('scripts/setup-preview.ts', [proposalPath, '--json']).stdout)
  assert.equal(preview.baseState, 'current')
  assert.ok(preview.configuration.changes >= 10)
  assert.equal(preview.media.tracks, 2)
  assert.equal(preview.approval, 'draft')
  assert.equal(preview.readyForApply, false)
  assert.deepEqual(
    preview.externalActions.map(({ id }: { id: string }) => id),
    [
      'supabase-hosted',
      'authentication-oauth',
      'stripe-account',
      'hosting-domain',
      'email-provider',
    ],
  )
  assert.equal(await readFile(statePath, 'utf8'), stateBeforePreview)
  const { data: stillPublished } = await admin
    .from('site_config_versions')
    .select('config')
    .eq('installation_key', 'primary')
    .eq('status', 'published')
    .single()
  assert.equal(artistConfigSchema.parse(stillPublished.config).identity.name, 'Daymark Assembly')

  const unapproved = execute(
    'scripts/setup-apply.ts',
    [proposalPath, '--confirm-approved-proposal'],
    true,
  )
  assert.notEqual(unapproved.status, 0)
  assert.match(unapproved.stderr, /required explicit local-application approval/)

  const approved = setupProposalSchema.parse({
    ...draft,
    approval: {
      status: 'approved',
      approvedBy: 'Fictional setup integration artist',
      approvedAt: new Date().toISOString(),
      localApplyConfirmation: true,
    },
  })
  await writeFile(proposalPath, `${JSON.stringify(approved, null, 2)}\n`)
  const approvedPreview = JSON.parse(
    execute('scripts/setup-preview.ts', [proposalPath, '--json']).stdout,
  )
  assert.equal(approvedPreview.readyForApply, true)

  const firstOutput = execute('scripts/setup-apply.ts', [
    proposalPath,
    '--confirm-approved-proposal',
  ]).stdout
  const first = JSON.parse(firstOutput)
  assert.equal(first.configuration, 'published')
  assert.equal(first.media.tracksApplied, 2)
  assert.equal(first.media.sourcesCreated, 2)
  assert.equal(first.verification, 'pass')
  assert.ok(!firstOutput.includes(status.secretKey))
  assert.ok(!firstOutput.includes(status.apiUrl))

  const { data: publishedAfter, error: publishedAfterError } = await admin
    .from('site_config_versions')
    .select('config')
    .eq('installation_key', 'primary')
    .eq('status', 'published')
    .single()
  requireNoError(publishedAfterError, 'Personalized configuration lookup failed')
  assert.equal(
    artistConfigSchema.parse(publishedAfter.config).identity.name,
    'North Window Practice',
  )
  const { data: importedTracks, error: trackError } = await admin
    .from('tracks')
    .select('id')
    .eq('primary_release_id', media.release.stableId)
  requireNoError(trackError, 'Personalized track lookup failed')
  assert.equal(importedTracks.length, 2)
  const { data: readyPreviews, error: previewError } = await admin
    .from('media_objects')
    .select('id')
    .in(
      'track_id',
      media.tracks.map(({ stableId }) => stableId),
    )
    .eq('kind', 'preview_audio')
    .eq('status', 'ready')
  requireNoError(previewError, 'Personalized media processing lookup failed')
  assert.equal(readyPreviews.length, 2)

  const firstState = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(firstState.personalization.proposalId, 'north-window-practice')
  assert.equal(firstState.personalization.media.tracksApplied, 2)
  assert.equal(firstState.checks.setupLifecycle, 'pass')
  assert.equal(firstState.checks.personalization, 'pass')
  assert.equal(firstState.remainingExternalSteps.length, 5)
  const objectCount = (
    await admin.from('media_objects').select('*', { count: 'exact', head: true })
  ).count

  const second = JSON.parse(
    execute('scripts/setup-apply.ts', [proposalPath, '--confirm-approved-proposal']).stdout,
  )
  assert.equal(second.configuration, 'unchanged')
  assert.equal(second.media.sourcesCreated, 0)
  const secondState = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(secondState.personalization.appliedAt, firstState.personalization.appliedAt)
  assert.equal(
    (await admin.from('media_objects').select('*', { count: 'exact', head: true })).count,
    objectCount,
  )

  console.log(
    'Codex setup lifecycle: PASS (interview, preview, approval, apply, verify, state, idempotency)',
  )
} catch (error) {
  console.error(`Codex setup lifecycle: FAIL\n${safeSupabaseError(error)}`)
  process.exitCode = 1
} finally {
  try {
    execute('scripts/reset-local-demo.mjs')
  } finally {
    await writeFile(statePath, originalState)
    await rm(workspace, { recursive: true, force: true })
  }
}
