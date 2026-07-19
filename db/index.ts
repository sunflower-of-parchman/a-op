import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function requireD1Binding(): D1Database {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let Sites inject the binding before using the database.",
    );
  }

  return env.DB;
}

export function createDb(binding: D1Database) {
  return drizzle(binding, { schema });
}

export function getDb() {
  return createDb(requireD1Binding());
}

export type AopDatabase = ReturnType<typeof createDb>;
