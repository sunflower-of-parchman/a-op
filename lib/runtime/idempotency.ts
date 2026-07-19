import { RuntimeError } from "./index.ts";

export interface MutationReceipt<T> {
  readonly replayed: true;
  readonly result: T;
}

interface ReceiptRow {
  request_fingerprint: string | null;
  result_json: string;
}

function canonicalize(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Mutation fingerprints require finite numbers.");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Mutation fingerprints require plain JSON objects.");
    }

    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }

  throw new TypeError("Mutation fingerprints require JSON values.");
}

export async function createMutationFingerprint(
  value: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function namespacedIdempotencyKey(
  operation: string,
  actorUserId: string,
  clientKey: string,
): string {
  return `${operation}:${actorUserId}:${clientKey}`;
}

export async function readMutationReceipt<T>(
  binding: D1Database,
  namespacedKey: string,
  fingerprint: string,
): Promise<MutationReceipt<T> | null> {
  const row = await binding
    .prepare(
      `SELECT request_fingerprint, result_json
       FROM audit_events
       WHERE idempotency_key = ?1
       LIMIT 1`,
    )
    .bind(namespacedKey)
    .first<ReceiptRow>();

  if (!row) return null;

  if (row.request_fingerprint !== fingerprint) {
    throw new RuntimeError(
      "IDEMPOTENCY_CONFLICT",
      "An idempotency key was reused with different input.",
      {
        status: 409,
        publicMessage:
          "That operation key was already used for a different change.",
      },
    );
  }

  try {
    return { replayed: true, result: JSON.parse(row.result_json) as T };
  } catch {
    throw new RuntimeError(
      "RECEIPT_INVALID",
      "A stored mutation receipt could not be read.",
      {
        status: 500,
        publicMessage: "The saved operation receipt could not be read.",
      },
    );
  }
}
