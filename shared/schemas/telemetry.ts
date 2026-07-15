import { z } from 'zod'

export const telemetryEventNameSchema = z.enum([
  'page_view',
  'media_start',
  'meaningful_listen',
  'catalog_search',
  'product_interest',
  'checkout_start',
  'checkout_complete',
  'download',
  'license_interest',
  'license_complete',
  'course_progress',
  'contact_conversion',
])

export const telemetryResourceTypeSchema = z.enum([
  'page',
  'track',
  'release',
  'collection',
  'product',
  'license_offer',
  'lesson',
  'contact',
])

const internalPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .startsWith('/')
  .refine((value) => !value.startsWith('//'), 'Use an internal path.')
  .refine(
    (value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0)
        return code > 31 && code !== 127
      }),
    'Control characters are not allowed.',
  )

const resourceKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use a lowercase slug.')

export const telemetryEventInputSchema = z
  .object({
    id: z.uuid(),
    eventName: telemetryEventNameSchema,
    sessionId: z.uuid(),
    path: internalPathSchema,
    resourceType: telemetryResourceTypeSchema.nullable().default(null),
    resourceKey: resourceKeySchema.nullable().default(null),
    value: z.number().int().min(0).max(1_000_000).nullable().default(null),
    consentState: z.enum(['granted', 'implied']),
  })
  .strict()
  .superRefine((input, context) => {
    if (Boolean(input.resourceType) !== Boolean(input.resourceKey)) {
      context.addIssue({
        code: 'custom',
        path: ['resourceKey'],
        message: 'Resource type and key must be supplied together.',
      })
    }
  })

export const telemetrySettingsInputSchema = z
  .object({
    optionalEnabled: z.boolean(),
    consentMode: z.enum(['opt_in', 'implied']),
    retentionDays: z.number().int().min(7).max(730),
    meaningfulListenSeconds: z.number().int().min(5).max(120),
  })
  .strict()

export type TelemetryEventInput = z.infer<typeof telemetryEventInputSchema>
export type TelemetrySettingsInput = z.infer<typeof telemetrySettingsInputSchema>
