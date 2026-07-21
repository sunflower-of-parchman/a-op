import { RuntimeError } from "@/lib/runtime/index.ts";

export interface AdminCommerceBindingIntentDTO {
  readonly intentKey: string;
  readonly intentKind: "membership" | "subscription" | "license";
  readonly name: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly billingInterval: "one_time" | "month" | "year";
  readonly intervalCount: number;
  readonly revision: number;
}

interface BindingRow {
  readonly intent_key: unknown;
  readonly intent_kind: unknown;
  readonly name: unknown;
  readonly description: unknown;
  readonly amount_minor: unknown;
  readonly currency: unknown;
  readonly billing_interval: unknown;
  readonly interval_count: unknown;
  readonly revision: unknown;
}

function integrity(): never {
  throw new RuntimeError(
    "COMMERCE_BINDING_INTEGRITY",
    "D1 returned an invalid pending commerce binding.",
    {
      status: 500,
      publicMessage: "Pending test products are temporarily unavailable.",
    },
  );
}

function parse(row: BindingRow): AdminCommerceBindingIntentDTO {
  if (
    typeof row.intent_key !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.intent_key) ||
    (row.intent_kind !== "membership" &&
      row.intent_kind !== "subscription" &&
      row.intent_kind !== "license") ||
    typeof row.name !== "string" ||
    row.name.length === 0 ||
    typeof row.description !== "string" ||
    !Number.isSafeInteger(row.amount_minor) ||
    (row.amount_minor as number) <= 0 ||
    typeof row.currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    (row.billing_interval !== "one_time" &&
      row.billing_interval !== "month" &&
      row.billing_interval !== "year") ||
    !Number.isSafeInteger(row.interval_count) ||
    (row.interval_count as number) <= 0 ||
    !Number.isSafeInteger(row.revision) ||
    (row.revision as number) <= 0
  ) {
    return integrity();
  }
  return Object.freeze({
    intentKey: row.intent_key,
    intentKind: row.intent_kind,
    name: row.name,
    description: row.description,
    amountMinor: row.amount_minor as number,
    currency: row.currency,
    billingInterval: row.billing_interval,
    intervalCount: row.interval_count as number,
    revision: row.revision as number,
  });
}

export async function readPendingCommerceBindings(
  binding: D1Database,
): Promise<readonly AdminCommerceBindingIntentDTO[]> {
  const result = await binding
    .prepare(
      `SELECT intent_key, intent_kind, name, description, amount_minor,
              currency, billing_interval, interval_count, revision
       FROM commerce_binding_intents
       WHERE intent_kind IN ('membership', 'subscription', 'license')
         AND binding_state = 'pending'
         AND stripe_environment = 'test'
         AND livemode = 0
       ORDER BY intent_kind, amount_minor, name`,
    )
    .all<BindingRow>();
  return Object.freeze(result.results.map(parse));
}
