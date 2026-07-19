interface ApiErrorEnvelope {
  readonly error?: {
    readonly message?: unknown;
  };
}

interface ApiMutationEnvelope<T> {
  readonly result: T;
}

function responseMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const message = (payload as ApiErrorEnvelope).error?.message;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : null;
}

export async function customerLibraryMutation<T>(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      responseMessage(payload) ??
        "The change could not be saved. Review the current state and try again.",
    );
  }
  if (!payload || typeof payload !== "object" || !("result" in payload)) {
    throw new Error("The server returned an incomplete result.");
  }

  return (payload as ApiMutationEnvelope<T>).result;
}
