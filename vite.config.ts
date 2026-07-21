import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const runtimeLabEnabled =
    command === "serve" && process.env.AOP_ENABLE_RUNTIME_LAB === "1";
  const localAccountPreviewEnabled =
    command === "serve" && process.env.AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW === "1";
  const localStripeTestConfiguration: Record<string, string> =
    command === "serve" &&
    process.env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") &&
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
    process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")
      ? {
          STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY!,
          STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
          STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
        }
      : {};
  const runtimeConfiguration = {
    ...(runtimeLabEnabled
      ? {
          AOP_RUNTIME_ENV: "test",
          AOP_SIMULATION_MODE: "runtime-lab",
          AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW: "0",
          AOP_LOCAL_ACCOUNT_PREVIEW_PERSONA: "customer",
        }
      : {
          AOP_RUNTIME_ENV: command === "build" ? "production" : "development",
          AOP_SIMULATION_MODE: "off",
          AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW: localAccountPreviewEnabled
            ? "1"
            : "0",
          AOP_LOCAL_ACCOUNT_PREVIEW_PERSONA:
            process.env.AOP_LOCAL_ACCOUNT_PREVIEW_PERSONA === "owner"
              ? "owner"
              : "customer",
        }),
    ...localStripeTestConfiguration,
  };

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        configPath: "./wrangler.local.jsonc",
        config: { vars: runtimeConfiguration },
        persistState: { path: ".wrangler/state" },
      }),
    ],
  };
});
