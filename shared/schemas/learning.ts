import { z } from 'zod'
import { pageSectionSchema } from './page'

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const markupPattern = /<\s*\/?\s*[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html/i
const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g

function safeText(max: number, min = 1) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !markupPattern.test(value), 'Use plain text instead of HTML or scripts.')
}

function safeRichText(max: number) {
  return safeText(max).superRefine((value, context) => {
    for (const match of value.matchAll(markdownLinkPattern)) {
      const href = match[1]?.trim() ?? ''
      if ((!href.startsWith('/') || href.startsWith('//')) && !href.startsWith('https://')) {
        context.addIssue({
          code: 'custom',
          message: 'Rich-text links must use an internal path or HTTPS URL.',
        })
      }
    }
  })
}

const sectionBase = z.object({ id: z.uuid() })

export const lessonSectionSchema = z.discriminatedUnion('type', [
  sectionBase.extend({
    type: z.literal('prose'),
    eyebrow: safeText(80, 0).optional(),
    heading: safeText(180),
    body: safeRichText(8000),
  }),
  sectionBase.extend({
    type: z.literal('image'),
    heading: safeText(180),
    mediaId: z.uuid(),
    alt: safeText(240),
    caption: safeText(500, 0).optional(),
  }),
  sectionBase.extend({
    type: z.literal('audio'),
    heading: safeText(180),
    mediaId: z.uuid(),
    prompt: safeText(1500),
    transcript: safeText(10000, 0).optional(),
  }),
  sectionBase.extend({
    type: z.literal('video'),
    heading: safeText(180),
    videoId: z.uuid(),
  }),
  sectionBase.extend({
    type: z.literal('download'),
    heading: safeText(180),
    mediaId: z.uuid(),
    label: safeText(100),
    description: safeText(1500),
  }),
  sectionBase.extend({
    type: z.literal('prompt'),
    heading: safeText(180),
    body: safeText(3000),
  }),
])

const lessonInputSchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema,
    title: safeText(200),
    summary: safeText(1200),
    estimatedMinutes: z.number().int().min(1).max(600),
    accessMode: z.enum(['public', 'account', 'entitlement', 'membership']),
    accessExplanation: safeText(600),
    membershipTierId: z.uuid().nullable(),
    price: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        amountMinor: z.number().int().positive().max(10_000_000),
      })
      .nullable(),
    sections: z.array(lessonSectionSchema).min(1).max(40),
  })
  .superRefine((lesson, context) => {
    if (lesson.accessMode === 'membership' && !lesson.membershipTierId) {
      context.addIssue({
        code: 'custom',
        path: ['membershipTierId'],
        message: 'Membership lessons require a membership tier.',
      })
    }
    if (lesson.accessMode === 'entitlement' && !lesson.price) {
      context.addIssue({
        code: 'custom',
        path: ['price'],
        message: 'Individually entitled lessons require a price.',
      })
    }
  })

export const learningPathInputSchema = z.object({
  area: z.object({
    id: z.uuid(),
    slug: slugSchema,
    name: safeText(120),
    description: safeText(1200),
  }),
  id: z.uuid(),
  slug: slugSchema,
  title: safeText(200),
  summary: safeText(1600),
  introduction: safeText(5000),
  courses: z
    .array(
      z.object({
        id: z.uuid(),
        slug: slugSchema,
        title: safeText(200),
        summary: safeText(1200),
        lessons: z.array(lessonInputSchema).min(1).max(40),
      }),
    )
    .min(1)
    .max(12),
})

export const learningProgressInputSchema = z.object({
  lessonId: z.uuid(),
  sectionPosition: z.number().int().min(0).max(1000),
  completed: z.boolean(),
})

export const videoInputSchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema,
    title: safeText(200),
    summary: safeText(1600),
    provider: z.enum(['youtube', 'vimeo', 'hosted']),
    externalId: z.preprocess(
      (value) => (value === '' ? null : value),
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{6,24}$/)
        .nullable(),
    ),
    hostedMediaId: z.uuid().nullable(),
    posterUrl: z.preprocess(
      (value) => (value === '' ? null : value),
      z
        .string()
        .trim()
        .max(500)
        .refine(
          (value) =>
            (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) ||
            /^https:\/\//.test(value),
          'Poster URL must be an internal path or HTTPS URL.',
        )
        .nullable(),
    ),
    transcript: safeText(30000),
    credits: z
      .array(z.object({ role: safeText(100), name: safeText(160) }))
      .min(1)
      .max(30),
  })
  .superRefine((video, context) => {
    if (video.provider === 'hosted' && !video.hostedMediaId) {
      context.addIssue({
        code: 'custom',
        path: ['hostedMediaId'],
        message: 'Hosted video requires an uploaded media object.',
      })
    }
    if (video.provider !== 'hosted' && !video.externalId) {
      context.addIssue({
        code: 'custom',
        path: ['externalId'],
        message: 'External video requires a provider identifier.',
      })
    }
  })

export const editorialInputSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['essay', 'announcement', 'learning_note', 'information']),
  slug: slugSchema,
  title: safeText(200),
  summary: safeText(1600),
  publishedOn: z.iso.date(),
  sections: z
    .array(
      pageSectionSchema.superRefine((section, context) => {
        const inspect = (value: unknown, path: Array<string | number>) => {
          if (typeof value === 'string' && markupPattern.test(value)) {
            context.addIssue({
              code: 'custom',
              path,
              message: 'Use structured plain text instead of raw HTML or scripts.',
            })
          } else if (Array.isArray(value)) {
            value.forEach((entry, index) => inspect(entry, [...path, index]))
          } else if (value && typeof value === 'object') {
            Object.entries(value).forEach(([key, entry]) => inspect(entry, [...path, key]))
          }
        }
        inspect(section, [])
      }),
    )
    .min(1)
    .max(40),
})

export const draftIdSchema = z.object({ id: z.uuid() })

export type LearningPathInput = z.infer<typeof learningPathInputSchema>
export type LessonInput = LearningPathInput['courses'][number]['lessons'][number]
export type LessonSectionInput = z.infer<typeof lessonSectionSchema>
export type VideoInput = z.infer<typeof videoInputSchema>
export type EditorialInput = z.infer<typeof editorialInputSchema>
