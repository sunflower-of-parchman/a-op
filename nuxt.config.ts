import artistConfig from './artist.config'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-14',
  devtools: { enabled: false },
  modules: [
    '@nuxt/image',
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    'nuxt-security',
    '@nuxt/eslint',
  ],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    supabaseSecretKey: '',
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    mediaWorkerSecret: '',
    public: {
      artist: artistConfig,
      demoMode: true,
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: '',
      siteUrl: 'http://127.0.0.1:3000',
    },
  },
  typescript: {
    strict: true,
    // `npm run typecheck` is a required verification step. Keeping it separate avoids
    // an upstream in-build launcher bug that splits repository paths containing spaces.
    typeCheck: false,
  },
  image: {
    format: ['avif', 'webp'],
    quality: 82,
  },
  security: {
    headers: {
      crossOriginEmbedderPolicy: false,
    },
    rateLimiter: {
      // The application is request-rich by design: SSR, account authority, media,
      // and administration can share one public IP. Keep a short burst boundary
      // without letting the package's 150-requests-per-five-minutes default block
      // an artist completing a normal publishing session.
      tokensPerInterval: 600,
      interval: 60_000,
      headers: true,
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'theme-color', content: artistConfig.design.colors.background },
        { name: 'color-scheme', content: 'light' },
      ],
    },
  },
})
