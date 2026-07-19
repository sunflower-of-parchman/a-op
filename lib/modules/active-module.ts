import { RuntimeError } from "@/lib/runtime/index.ts";
import type { ModuleKey } from "./registry.ts";

interface ActiveModuleRow {
  readonly active: number;
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
