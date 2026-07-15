import { z } from 'zod'

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hexadecimal color.')

const cssLengthSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?(?:px|rem|em|vw|vh|%)$/, 'Use an explicit CSS length.')

const internalPathSchema = z
  .string()
  .startsWith('/')
  .max(500)
  .refine(
    (value) =>
      !value.startsWith('//') &&
      !value.includes('\\') &&
      [...value].every((character) => character.charCodeAt(0) >= 32),
    'Use a safe internal path, not a protocol-relative URL.',
  )

const optionalInternalPathSchema = z.union([z.literal(''), internalPathSchema])

const navigationItemSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    to: internalPathSchema,
    feature: z
      .enum(['music', 'commerce', 'licensing', 'memberships', 'learning', 'video', 'editorial'])
      .optional(),
  })
  .strict()

const socialLinkSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    url: z.url({ protocol: /^https$/ }),
  })
  .strict()

const logoSchema = z
  .object({
    kind: z.enum(['text', 'image']),
    wordmark: z.string().trim().min(1).max(80),
    assetPath: optionalInternalPathSchema,
    alt: z.string().trim().max(120),
  })
  .strict()
  .superRefine((logo, context) => {
    if (logo.kind === 'image' && (!logo.assetPath || !logo.alt)) {
      context.addIssue({
        code: 'custom',
        path: ['assetPath'],
        message: 'An image logo requires an internal asset path and alternative text.',
      })
    }
  })

const optionalImageSchema = z
  .object({
    src: optionalInternalPathSchema,
    alt: z.string().trim().max(240),
  })
  .strict()
  .superRefine((image, context) => {
    if (Boolean(image.src) !== Boolean(image.alt)) {
      context.addIssue({
        code: 'custom',
        path: ['alt'],
        message: 'An image path and alternative text must be supplied together.',
      })
    }
  })

export const artistConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    demo: z
      .object({
        fictional: z.literal(true),
        notice: z.string().trim().min(1).max(140),
      })
      .strict(),
    identity: z
      .object({
        name: z.string().trim().min(1).max(80),
        eyebrow: z.string().trim().min(1).max(100),
        statement: z.string().trim().min(1).max(180),
        biography: z.string().trim().min(1).max(1200),
        location: z.string().trim().min(1).max(100).optional(),
        contact: z
          .object({
            publicEmail: z.union([z.literal(''), z.email()]),
            bookingNote: z.string().trim().max(320),
            mailingAddress: z.string().trim().max(320),
          })
          .strict(),
        socialLinks: z.array(socialLinkSchema).max(8),
        distributionLinks: z.array(socialLinkSchema).max(8),
      })
      .strict(),
    design: z
      .object({
        colors: z
          .object({
            background: hexColorSchema,
            text: hexColorSchema,
            mutedText: hexColorSchema,
            accent: hexColorSchema,
            surface: hexColorSchema,
            border: hexColorSchema,
            focus: hexColorSchema,
          })
          .strict(),
        typography: z
          .object({
            displayFamily: z.string().trim().min(1).max(160),
            bodyFamily: z.string().trim().min(1).max(160),
            baseSize: cssLengthSchema,
            displayWeight: z.number().int().min(300).max(900),
            bodyWeight: z.number().int().min(300).max(700),
          })
          .strict(),
        spacing: z
          .object({
            baseUnit: cssLengthSchema,
            contentMax: cssLengthSchema,
            readingMax: cssLengthSchema,
          })
          .strict(),
        corners: z
          .object({
            control: cssLengthSchema,
            media: cssLengthSchema,
          })
          .strict(),
        surface: z
          .object({
            treatment: z.enum(['open', 'outlined', 'soft']),
            borderWidth: cssLengthSchema,
          })
          .strict(),
        logo: logoSchema,
        motion: z
          .object({
            fastMs: z.number().int().min(0).max(1000),
            baseMs: z.number().int().min(0).max(2000),
            entranceDistance: cssLengthSchema,
          })
          .strict(),
      })
      .strict(),
    navigation: z.array(navigationItemSchema).min(1).max(10),
    features: z
      .object({
        music: z.boolean(),
        commerce: z.boolean(),
        licensing: z.boolean(),
        memberships: z.boolean(),
        learning: z.boolean(),
        video: z.boolean(),
        editorial: z.boolean(),
        telemetry: z.boolean(),
      })
      .strict(),
    seo: z
      .object({
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(320),
        socialImage: optionalImageSchema,
      })
      .strict(),
    footer: z
      .object({
        statement: z.string().trim().min(1).max(240),
        copyright: z.string().trim().min(1).max(160),
      })
      .strict(),
    homepage: z
      .object({
        kicker: z.string().trim().min(1).max(80),
        introduction: z.string().trim().min(1).max(320),
        heroImage: optionalImageSchema,
        release: z
          .object({
            title: z.string().trim().min(1).max(120),
            year: z.number().int().min(1900).max(2200),
            format: z.string().trim().min(1).max(80),
            description: z.string().trim().min(1).max(500),
            href: internalPathSchema,
          })
          .strict(),
        principles: z
          .array(
            z
              .object({
                label: z.string().trim().min(1).max(60),
                text: z.string().trim().min(1).max(240),
              })
              .strict(),
          )
          .min(1)
          .max(6),
      })
      .strict(),
  })
  .strict()

export type ArtistConfig = z.infer<typeof artistConfigSchema>
