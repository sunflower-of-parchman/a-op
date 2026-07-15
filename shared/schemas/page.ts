import { z } from 'zod'

const internalPathSchema = z
  .string()
  .trim()
  .startsWith('/')
  .max(500)
  .refine(
    (value) =>
      !value.startsWith('//') &&
      !value.includes('\\') &&
      [...value].every((character) => character.charCodeAt(0) >= 32),
    'Use a safe internal path.',
  )

const publicResourceSchema = z.union([internalPathSchema, z.url({ protocol: /^https$/ })])

const sectionBase = z.object({
  id: z.uuid(),
})

const proseSection = sectionBase.extend({
  type: z.literal('prose'),
  eyebrow: z.string().trim().max(80).optional(),
  heading: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(5000),
})

const imageSection = sectionBase.extend({
  type: z.literal('image'),
  src: publicResourceSchema,
  alt: z.string().trim().min(1).max(240),
  caption: z.string().trim().max(500).optional(),
})

const callToActionSection = sectionBase.extend({
  type: z.literal('call_to_action'),
  heading: z.string().trim().min(1).max(180),
  body: z.string().trim().max(1000).optional(),
  label: z.string().trim().min(1).max(80),
  href: internalPathSchema,
})

const creditsSection = sectionBase.extend({
  type: z.literal('credits'),
  heading: z.string().trim().min(1).max(180),
  items: z
    .array(
      z.object({
        role: z.string().trim().min(1).max(100),
        name: z.string().trim().min(1).max(160),
      }),
    )
    .min(1)
    .max(30),
})

const linksSection = sectionBase.extend({
  type: z.literal('links'),
  heading: z.string().trim().min(1).max(180),
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(100),
        href: z.url({ protocol: /^https$/ }),
      }),
    )
    .min(1)
    .max(20),
})

const featuredReleaseSection = sectionBase.extend({
  type: z.literal('featured_release'),
  heading: z.string().trim().min(1).max(180),
  releaseSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

const featuredLearningSection = sectionBase.extend({
  type: z.literal('featured_learning'),
  heading: z.string().trim().min(1).max(180),
  pathSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

const videoSection = sectionBase.extend({
  type: z.literal('video'),
  heading: z.string().trim().min(1).max(180),
  url: z.url({ protocol: /^https$/ }),
  transcript: z.string().trim().min(1).max(10000),
})

const contactSection = sectionBase.extend({
  type: z.literal('contact'),
  heading: z.string().trim().min(1).max(180),
  introduction: z.string().trim().min(1).max(1000),
  consentLabel: z.string().trim().min(1).max(240),
})

export const pageSectionSchema = z.discriminatedUnion('type', [
  proseSection,
  imageSection,
  callToActionSection,
  creditsSection,
  linksSection,
  featuredReleaseSection,
  featuredLearningSection,
  videoSection,
  contactSection,
])

export const pageInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  navigationLabel: z.string().trim().min(1).max(60).nullable(),
  seo: z.object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(320),
  }),
  sections: z.array(pageSectionSchema).max(40),
})

export type PageInput = z.infer<typeof pageInputSchema>
export type PageSection = z.infer<typeof pageSectionSchema>
