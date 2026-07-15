import { z } from 'zod'

const optionalSecretSchema = z.string().trim().min(1).optional()

export const serviceConfigSchema = z
  .object({
    supabaseUrl: z.url({ protocol: /^https?$/ }),
    supabasePublishableKey: z.string().trim().min(1),
    supabaseSecretKey: optionalSecretSchema,
    stripeSecretKey: optionalSecretSchema,
    stripeWebhookSecret: optionalSecretSchema,
    mediaWorkerSecret: optionalSecretSchema,
  })
  .strict()

export type ServiceConfig = z.infer<typeof serviceConfigSchema>

export type RedactedServiceConfig = Record<keyof ServiceConfig, 'configured' | 'missing'>

export function redactServiceConfig(config: Partial<ServiceConfig>): RedactedServiceConfig {
  return {
    supabaseUrl: config.supabaseUrl ? 'configured' : 'missing',
    supabasePublishableKey: config.supabasePublishableKey ? 'configured' : 'missing',
    supabaseSecretKey: config.supabaseSecretKey ? 'configured' : 'missing',
    stripeSecretKey: config.stripeSecretKey ? 'configured' : 'missing',
    stripeWebhookSecret: config.stripeWebhookSecret ? 'configured' : 'missing',
    mediaWorkerSecret: config.mediaWorkerSecret ? 'configured' : 'missing',
  }
}
