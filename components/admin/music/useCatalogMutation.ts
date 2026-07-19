"use client";

import { useCallback, useRef } from "react";

export interface CatalogMutationResult {
  readonly result?: {
    readonly slug?: string;
    readonly version?: number;
    readonly revision?: number;
    readonly created?: boolean;
    readonly publicationState?: "draft" | "published";
    readonly publishedRevisionId?: string;
  };
  readonly replayed?: boolean;
  readonly error?: { readonly message?: string };
}

interface PendingOperation {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}

export function useCatalogMutation() {
  const pendingOperation = useRef<PendingOperation | null>(null);

  return useCallback(
    async (
      url: string,
      method: "POST" | "PUT",
      body: unknown,
    ): Promise<CatalogMutationResult> => {
      const serializedBody = JSON.stringify(body);
      const fingerprint = `${method}:${url}:${serializedBody}`;
      const pending = pendingOperation.current;
      const operation =
        pending?.fingerprint === fingerprint
          ? pending
          : {
              fingerprint,
              idempotencyKey: crypto.randomUUID(),
            };
      pendingOperation.current = operation;

      const response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": operation.idempotencyKey,
        },
        body: serializedBody,
      });
      let result: CatalogMutationResult;
      try {
        result = (await response.json()) as CatalogMutationResult;
      } catch {
        throw new Error(
          "The catalog response could not be confirmed. Retry the same change.",
        );
      }

      if (!response.ok) {
        if (response.status < 500) pendingOperation.current = null;
        throw new Error(
          result.error?.message ?? "The catalog change could not be saved.",
        );
      }

      pendingOperation.current = null;
      return result;
    },
    [],
  );
}

export function parseCatalogTags(value: string): readonly string[] {
  const result: string[] = [];
  for (const candidate of value.split(",")) {
    const tag = candidate.trim();
    if (
      tag.length > 0 &&
      !result.some((existing) => existing.toLowerCase() === tag.toLowerCase())
    ) {
      result.push(tag);
    }
  }
  return result;
}
