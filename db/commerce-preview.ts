import { RuntimeError } from "@/lib/runtime/index.ts";

export interface PublicCommerceIntentPreview {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly billingInterval: "one_time" | "month" | "year";
  readonly intervalCount: number;
}

interface IntentRow {
  id: unknown;
  name: unknown;
  description: unknown;
  amount_minor: unknown;
  currency: unknown;
  billing_interval: unknown;
  interval_count: unknown;
}

function integrity(message: string): never {
  throw new RuntimeError("COMMERCE_INTEGRITY", message, {
    status: 500,
    publicMessage: "Licensing is temporarily unavailable.",
  });
}

function parse(row: IntentRow): PublicCommerceIntentPreview {
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.description !== "string" ||
    !Number.isSafeInteger(row.amount_minor) ||
    (row.amount_minor as number) <= 0 ||
    typeof row.currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    (row.billing_interval !== "one_time" &&
      row.billing_interval !== "month" &&
      row.billing_interval !== "year") ||
    !Number.isSafeInteger(row.interval_count) ||
    (row.interval_count as number) <= 0
  ) {
    integrity("D1 returned an invalid public commerce preview.");
  }
  return Object.freeze({
    id: row.id,
    name: row.name,
    description: row.description,
    amountMinor: row.amount_minor as number,
    currency: row.currency,
    billingInterval: row.billing_interval,
    intervalCount: row.interval_count as number,
  });
}

export async function listPublicCommerceIntentPreviews(
  binding: D1Database,
  kind: "subscription" | "license",
): Promise<readonly PublicCommerceIntentPreview[]> {
  const result = await binding
    .prepare(
      kind === "license"
        ? `SELECT MIN(id) AS id, name, description, amount_minor, currency,
                  billing_interval, interval_count
           FROM commerce_binding_intents
           WHERE intent_kind = 'license'
             AND binding_state = 'pending'
             AND stripe_environment = 'test'
             AND livemode = 0
           GROUP BY name, description, amount_minor, currency,
                    billing_interval, interval_count
           ORDER BY amount_minor ASC`
        : `SELECT id, name, description, amount_minor, currency,
                  billing_interval, interval_count
           FROM commerce_binding_intents
           WHERE intent_kind = 'subscription'
             AND binding_state = 'pending'
             AND stripe_environment = 'test'
             AND livemode = 0
           ORDER BY amount_minor ASC, name ASC`,
    )
    .all<IntentRow>();
  return Object.freeze(result.results.map(parse));
}
