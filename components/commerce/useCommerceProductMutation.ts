"use client";

import { useCallback, useRef } from "react";

export interface CommerceProductMutationEnvelope<T = unknown> {
  readonly result?: T;
  readonly replayed?: boolean;
  readonly error?: { readonly message?: string };
}

interface PendingOperation {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}

export function useCommerceProductMutation() {
  const pendingOperation = useRef<PendingOperation | null>(null);

  return useCallback(
    async <T>(
      url: string,
      body: unknown,
    ): Promise<CommerceProductMutationEnvelope<T>> => {
      const serializedBody = JSON.stringify(body);
      const fingerprint = `POST:${url}:${serializedBody}`;
      const pending = pendingOperation.current;
      const operation =
        pending?.fingerprint === fingerprint
          ? pending
          : { fingerprint, idempotencyKey: crypto.randomUUID() };
      pendingOperation.current = operation;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operation.idempotencyKey,
        },
        body: serializedBody,
      });
      let result: CommerceProductMutationEnvelope<T>;
      try {
        result = (await response.json()) as CommerceProductMutationEnvelope<T>;
      } catch {
        throw new Error(
          "The test product response could not be confirmed. Retry the same change.",
        );
      }
      if (!response.ok) {
        if (response.status < 500) pendingOperation.current = null;
        throw new Error(
          result.error?.message ?? "The test product change did not finish.",
        );
      }
      pendingOperation.current = null;
      return result;
    },
    [],
  );
}
