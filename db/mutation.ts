import { RuntimeError } from "@/lib/runtime/index.ts";
import type { TelemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import {
  createMutationFingerprint,
  namespacedIdempotencyKey,
  readMutationReceipt,
} from "@/lib/runtime/idempotency.ts";

export interface MutationContext {
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly telemetry?: TelemetryMutationRequestContext;
}

export interface MutationResult<T> {
  readonly value: T;
  readonly replayed: boolean;
}

export interface PreparedMutation<T> {
  readonly fingerprint: string;
  readonly namespacedKey: string;
  readonly replayValue: T | null;
}

export async function prepareMutation<T>(
  binding: D1Database,
  operation: string,
  context: MutationContext,
  input: unknown,
): Promise<PreparedMutation<T>> {
  const fingerprint = await createMutationFingerprint({ operation, input });
  const namespacedKey = namespacedIdempotencyKey(
    operation,
    context.actorUserId,
    context.idempotencyKey,
  );
  const receipt = await readMutationReceipt<T>(
    binding,
    namespacedKey,
    fingerprint,
  );

  return {
    fingerprint,
    namespacedKey,
    replayValue: receipt?.result ?? null,
  };
}

export async function replayAfterMutationFailure<T>(
  binding: D1Database,
  mutation: PreparedMutation<T>,
  error: unknown,
): Promise<MutationResult<T>> {
  const receipt = await readMutationReceipt<T>(
    binding,
    mutation.namespacedKey,
    mutation.fingerprint,
  );
  if (receipt) return { value: receipt.result, replayed: true };
  throw error;
}

export function staleMutation(subject: string): RuntimeError {
  return new RuntimeError(
    "STALE_STATE",
    `The ${subject} changed before the operation could finish.`,
    {
      status: 409,
      publicMessage: `The ${subject} changed. Reload it before trying again.`,
    },
  );
}
