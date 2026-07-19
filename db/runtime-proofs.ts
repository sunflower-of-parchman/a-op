export interface RuntimeProof {
  readonly key: string;
  readonly value: string;
  readonly revision: number;
  readonly updatedAt: string;
}

interface RuntimeProofRow {
  key: string;
  value: string;
  revision: number;
  updated_at: string;
}

const RUNTIME_PROOF_KEY = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const MAX_RUNTIME_PROOF_VALUE_LENGTH = 512;

function requireRuntimeProofKey(key: string): string {
  if (!RUNTIME_PROOF_KEY.test(key)) {
    throw new TypeError(
      "A runtime proof key must be a safe non-empty identifier.",
    );
  }

  return key;
}

function requireRuntimeProofValue(value: string): string {
  if (value.length === 0 || value.length > MAX_RUNTIME_PROOF_VALUE_LENGTH) {
    throw new TypeError(
      "A runtime proof value must contain 1 to 512 characters.",
    );
  }

  return value;
}

function mapRuntimeProof(row: RuntimeProofRow): RuntimeProof {
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new RangeError("D1 returned an invalid runtime proof revision.");
  }

  return {
    key: row.key,
    value: row.value,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export async function readRuntimeProof(
  binding: D1Database,
  key: string,
): Promise<RuntimeProof | null> {
  const row = await binding
    .prepare(
      `SELECT key, value, revision, updated_at
       FROM runtime_proofs
       WHERE key = ?1`,
    )
    .bind(requireRuntimeProofKey(key))
    .first<RuntimeProofRow>();

  return row ? mapRuntimeProof(row) : null;
}

/**
 * Writes and returns a proof in one prepared statement. The monotonic revision
 * makes restart persistence visible without a client-supplied transaction.
 */
export async function writeRuntimeProof(
  binding: D1Database,
  key: string,
  value: string,
): Promise<RuntimeProof> {
  const row = await binding
    .prepare(
      `INSERT INTO runtime_proofs (key, value)
       VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         revision = runtime_proofs.revision + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING key, value, revision, updated_at`,
    )
    .bind(requireRuntimeProofKey(key), requireRuntimeProofValue(value))
    .first<RuntimeProofRow>();

  if (!row) {
    throw new Error("D1 did not return the written runtime proof.");
  }

  return mapRuntimeProof(row);
}
