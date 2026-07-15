import type { ArtistConfig } from '../shared/schemas/artistConfig'

declare module 'nuxt/schema' {
  interface RuntimeConfig {
    supabaseSecretKey: string
    stripeSecretKey: string
    stripeWebhookSecret: string
    mediaWorkerSecret: string
  }

  interface PublicRuntimeConfig {
    artist: ArtistConfig
    demoMode: boolean
    supabaseUrl: string
    supabasePublishableKey: string
    siteUrl: string
  }
}

export {}
