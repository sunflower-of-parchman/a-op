"use client";

import { useCallback, useRef } from "react";

export interface AccessMutationResult<T = unknown> {
  readonly result?: T;
  readonly replayed?: boolean;
  readonly error?: { readonly message?: string };
}

interface PendingOperation {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}

export function useAccessMutation() {
  const pendingOperation = useRef<PendingOperation | null>(null);

  return useCallback(
    async <T>(
      url: string,
      method: "DELETE" | "POST" | "PUT",
      body: unknown,
    ): Promise<AccessMutationResult<T>> => {
      const serializedBody = JSON.stringify(body);
      const fingerprint = `${method}:${url}:${serializedBody}`;
      const pending = pendingOperation.current;
      const operation =
        pending?.fingerprint === fingerprint
          ? pending
          : { fingerprint, idempotencyKey: crypto.randomUUID() };
      pendingOperation.current = operation;

      const response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": operation.idempotencyKey,
        },
        body: serializedBody,
      });
      let result: AccessMutationResult<T>;
      try {
        result = (await response.json()) as AccessMutationResult<T>;
      } catch {
        throw new Error(
          "The access response could not be confirmed. Retry the same change.",
        );
      }

      if (!response.ok) {
        if (response.status < 500) pendingOperation.current = null;
        throw new Error(
          result.error?.message ?? "The access change did not finish.",
        );
      }

      pendingOperation.current = null;
      return result;
    },
    [],
  );
}
