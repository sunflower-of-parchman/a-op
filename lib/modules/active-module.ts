import { RuntimeError } from "@/lib/runtime/index.ts";
import type { ModuleKey } from "./registry.ts";

interface ActiveModuleRow {
  readonly active: number;
}

interface PublicModuleAvailabilityRow extends ActiveModuleRow {
  readonly setup_status: string | null;
}

/** Requires one artist-activated optional module at the server boundary. */
export async function requireActiveModule(
  binding: D1Database,
  moduleKey: ModuleKey,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT active
       FROM artist_modules
       WHERE module_key = ?1
       LIMIT 1`,
    )
    .bind(moduleKey)
    .first<ActiveModuleRow>();

  if (row?.active === 1) return;

  throw new RuntimeError(
    "MODULE_INACTIVE",
    `Optional module "${moduleKey}" is not active.`,
    {
      status: 404,
      publicMessage: "This capability is not active.",
    },
  );
}

/**
 * Keeps an optional public index route visible in the neutral framework while
 * preserving the normal module gate after setup has been applied.
 */
export async function requirePublicModulePresentation(
  binding: D1Database,
  moduleKey: ModuleKey,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT
         COALESCE((
           SELECT active
           FROM artist_modules
           WHERE module_key = ?1
           LIMIT 1
         ), 0) AS active,
         (
           SELECT status
           FROM setup_state
           WHERE id = 'setup'
           LIMIT 1
         ) AS setup_status`,
    )
    .bind(moduleKey)
    .first<PublicModuleAvailabilityRow>();

  if (row?.active === 1 || row?.setup_status === "unconfigured") return;

  throw new RuntimeError(
    "MODULE_INACTIVE",
    `Optional public module "${moduleKey}" is not available.`,
    {
      status: 404,
      publicMessage: "This capability is not active.",
    },
  );
}
