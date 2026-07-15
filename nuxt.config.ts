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
      oauthProviders: '',
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
    strict: true,
    headers: {
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: 'same-origin',
      crossOriginOpenerPolicy: 'same-origin',
      referrerPolicy: 'strict-origin-when-cross-origin',
      xFrameOptions: 'DENY',
      contentSecurityPolicy: {
        'base-uri': ["'none'"],
        'default-src': ["'none'"],
        'connect-src': [
          "'self'",
          'https:',
          'wss:',
          'http://127.0.0.1:*',
          'http://localhost:*',
          'ws://127.0.0.1:*',
          'ws://localhost:*',
        ],
        'font-src': ["'self'", 'data:'],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'frame-src': ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'manifest-src': ["'self'"],
        'media-src': ["'self'", 'blob:', 'https:', 'http://127.0.0.1:*', 'http://localhost:*'],
        'object-src': ["'none'"],
        'script-src': ["'self'", "'strict-dynamic'", "'nonce-{{nonce}}'"],
        'script-src-attr': ["'none'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'worker-src': ["'self'", 'blob:'],
        'upgrade-insecure-requests': process.env.NODE_ENV === 'production',
      },
      permissionsPolicy: {
        accelerometer: [],
        autoplay: ['self', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
        camera: [],
        'display-capture': [],
        'encrypted-media': ['self', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
        fullscreen: ['self', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
        geolocation: [],
        microphone: [],
        payment: ['self', 'https://checkout.stripe.com'],
        'picture-in-picture': [
          'self',
          'https://www.youtube-nocookie.com',
          'https://player.vimeo.com',
        ],
        'publickey-credentials-get': [],
        'screen-wake-lock': [],
        'web-share': [],
      },
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
    // The browser application and API share one origin. Cross-origin browser access is not part of
    // the product contract; server-to-server Stripe webhooks do not require CORS.
    corsHandler: false,
  },
  routeRules: {
    '/api/admin/**': { headers: { 'cache-control': 'private, no-store' } },
    '/api/auth/**': {
      headers: { 'cache-control': 'private, no-store' },
      security: { rateLimiter: { tokensPerInterval: 30, interval: 60_000, headers: true } },
    },
    '/api/auth/sign-in': {
      security: { rateLimiter: { tokensPerInterval: 10, interval: 60_000, headers: true } },
    },
    '/api/auth/sign-up': {
      security: { rateLimiter: { tokensPerInterval: 5, interval: 60_000, headers: true } },
    },
    '/api/commerce/account': { headers: { 'cache-control': 'private, no-store' } },
    '/api/commerce/checkout': {
      security: { rateLimiter: { tokensPerInterval: 20, interval: 60_000, headers: true } },
    },
    '/api/contact': {
      security: { rateLimiter: { tokensPerInterval: 5, interval: 600_000, headers: true } },
    },
    '/api/downloads/**': { headers: { 'cache-control': 'private, no-store' } },
    '/api/learning/account': { headers: { 'cache-control': 'private, no-store' } },
    '/api/library': { headers: { 'cache-control': 'private, no-store' } },
    '/api/licenses/**': { headers: { 'cache-control': 'private, no-store' } },
    '/api/licensing/checkout': {
      security: { rateLimiter: { tokensPerInterval: 20, interval: 60_000, headers: true } },
    },
    '/api/telemetry/event': {
      security: { rateLimiter: { tokensPerInterval: 120, interval: 60_000, headers: true } },
    },
    '/api/webhooks/stripe': {
      security: { rateLimiter: { tokensPerInterval: 300, interval: 60_000, headers: true } },
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
