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
  const runtimeConfiguration = runtimeLabEnabled
    ? {
        AOP_RUNTIME_ENV: "test",
        AOP_SIMULATION_MODE: "runtime-lab",
      }
    : {
        AOP_RUNTIME_ENV: command === "build" ? "production" : "development",
        AOP_SIMULATION_MODE: "off",
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
