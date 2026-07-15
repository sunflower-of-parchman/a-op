import { describe, expect, it } from 'vitest'
import { redactServiceConfig, serviceConfigSchema } from '../../shared/schemas/serviceConfig'

describe('service configuration', () => {
  it('validates the required public Supabase connection fields', () => {
    const result = serviceConfigSchema.parse({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'local-public-key',
    })

    expect(result.supabaseUrl).toBe('http://127.0.0.1:54321')
  })

  it('reports configuration state without returning values', () => {
    const redacted = redactServiceConfig({
      supabaseUrl: 'https://project.example.test',
      supabasePublishableKey: 'public-key',
      stripeSecretKey: 'secret-value',
    })

    expect(redacted).toEqual({
      supabaseUrl: 'configured',
      supabasePublishableKey: 'configured',
      supabaseSecretKey: 'missing',
      stripeSecretKey: 'configured',
      stripeWebhookSecret: 'missing',
      mediaWorkerSecret: 'missing',
    })
    expect(JSON.stringify(redacted)).not.toContain('secret-value')
  })
})
