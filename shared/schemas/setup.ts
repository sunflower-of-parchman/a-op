import { z } from 'zod'
import { artistConfigSchema } from '#artist-config-schema'

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const answerSchema = z.string().trim().min(1).max(1200)

export const setupInterviewQuestions = [
  {
    id: 'identity',
    authority: 'artist',
    prompt:
      'What name, practice, location, biography, and public contact should this site present?',
  },
  {
    id: 'audience',
    authority: 'artist',
    prompt: 'Who is the site for, and what should they understand or do first?',
  },
  {
    id: 'siteGoals',
    authority: 'artist',
    prompt:
      'Which relationships should the site support: listening, direct support, licensing, membership, teaching, or contact?',
  },
  {
    id: 'visualDirection',
    authority: 'artist',
    prompt:
      'Which colors, type character, imagery, spacing, and overall feeling belong to the work?',
  },
  {
    id: 'pages',
    authority: 'artist',
    prompt: 'Which public pages and navigation labels should be present?',
  },
  {
    id: 'catalog',
    authority: 'artist-rights',
    prompt:
      'Where are the approved audio and artwork files, and who controls their publication rights?',
  },
  {
    id: 'commerce',
    authority: 'artist-business',
    prompt: 'What may be free, sold once, linked externally, or offered through membership?',
  },
  {
    id: 'licensing',
    authority: 'artist-rights-business',
    prompt: 'Which music uses, terms, prices, and inquiry boundaries may be offered?',
  },
  {
    id: 'memberships',
    authority: 'artist-business',
    prompt: 'Should memberships exist, and which benefits and renewal periods belong to them?',
  },
  {
    id: 'learning',
    authority: 'artist',
    prompt: 'What paths, lessons, media, and access modes should organize teaching?',
  },
  {
    id: 'video',
    authority: 'artist-rights',
    prompt: 'Which hosted or external videos, posters, transcripts, and credits are approved?',
  },
  {
    id: 'contact',
    authority: 'artist',
    prompt: 'How should messages be stored or delivered, and what consent language is appropriate?',
  },
  {
    id: 'privacy',
    authority: 'artist',
    prompt:
      'Should optional first-party analytics be enabled, which consent mode should apply, and how long should events remain?',
  },
  {
    id: 'deployment',
    authority: 'artist-account-cost',
    prompt:
      'Should this remain local or later connect to hosted Supabase, OAuth, Stripe, email, Vercel, and a custom domain?',
  },
] as const

const setupAnswersSchema = z
  .object({
    identity: answerSchema,
    audience: answerSchema,
    siteGoals: answerSchema,
    visualDirection: answerSchema,
    pages: answerSchema,
    catalog: answerSchema,
    commerce: answerSchema,
    licensing: answerSchema,
    memberships: answerSchema,
    learning: answerSchema,
    video: answerSchema,
    contact: answerSchema,
    privacy: answerSchema,
    deployment: answerSchema,
  })
  .strict()

const setupServicesSchema = z
  .object({
    supabase: z.enum(['local', 'hosted-later']),
    authentication: z
      .object({
        email: z.literal(true),
        oauthProviders: z.array(z.enum(['google', 'apple', 'github', 'spotify'])).max(4),
      })
      .strict(),
    stripe: z.enum(['simulation', 'test-later', 'live-later']),
    hosting: z.enum(['local', 'vercel-later', 'node-host-later']),
    domain: z.enum(['local', 'custom-later']),
    email: z.enum(['local-capture', 'provider-later']),
  })
  .strict()

const draftApprovalSchema = z
  .object({
    status: z.literal('draft'),
    approvedBy: z.null(),
    approvedAt: z.null(),
    localApplyConfirmation: z.literal(false),
  })
  .strict()

const approvedApprovalSchema = z
  .object({
    status: z.literal('approved'),
    approvedBy: z.string().trim().min(1).max(160),
    approvedAt: z.iso.datetime({ offset: true }),
    localApplyConfirmation: z.literal(true),
  })
  .strict()

export const setupProposalSchema = z
  .object({
    schemaVersion: z.literal(1),
    proposalId: slugSchema,
    createdAt: z.iso.datetime({ offset: true }),
    baseConfigHash: hashSchema,
    answers: setupAnswersSchema,
    siteConfig: artistConfigSchema,
    media: z
      .object({
        importManifest: z.string().trim().min(1).max(1000).nullable(),
        processAfterApply: z.boolean(),
      })
      .strict(),
    services: setupServicesSchema,
    approval: z.discriminatedUnion('status', [draftApprovalSchema, approvedApprovalSchema]),
  })
  .strict()

const checkStatusSchema = z.enum(['pass', 'action-required', 'fail', 'not-run'])
const externalActionStatusSchema = z.enum([
  'local',
  'not-requested',
  'approval-required',
  'verified',
])

export const projectStateSchema = z
  .object({
    schemaVersion: z.literal(3),
    installationMode: z.enum(['local', 'hosted']),
    artistConfigVersion: z.literal(1),
    enabledModules: z.array(
      z.enum([
        'music',
        'commerce',
        'licensing',
        'memberships',
        'learning',
        'video',
        'editorial',
        'telemetry',
      ]),
    ),
    checks: z.record(z.string(), checkStatusSchema),
    externalActions: z.record(z.string(), externalActionStatusSchema),
    personalization: z
      .object({
        proposalId: slugSchema,
        proposalHash: hashSchema,
        configHash: hashSchema,
        appliedAt: z.iso.datetime({ offset: true }),
        media: z
          .object({
            releaseId: z.uuid().nullable(),
            tracksApplied: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    remainingExternalSteps: z.array(
      z
        .object({
          id: slugSchema,
          status: z.literal('approval-required'),
          runbook: z.string().regex(/^docs\/agent\/[a-z0-9-]+\.md$/),
        })
        .strict(),
    ),
  })
  .strict()

export type SetupProposal = z.infer<typeof setupProposalSchema>
export type ProjectState = z.infer<typeof projectStateSchema>
