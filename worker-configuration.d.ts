declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    MEDIA: R2Bucket;
    IMAGES: ImagesBinding;
    AOP_RUNTIME_ENV?: string;
    AOP_SIMULATION_MODE?: string;
    AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW?: string;
    AOP_OWNER_BOOTSTRAP_EMAIL?: string;
    STRIPE_PUBLISHABLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    MEDIA_PUBLICATION_MAX_BYTES?: string;
  }
}
