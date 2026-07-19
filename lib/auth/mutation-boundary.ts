import { RuntimeError } from "../runtime/index.ts";

const MAXIMUM_MUTATION_BYTES = 65_536;

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new RuntimeError(
      "ORIGIN_REQUIRED",
      "A same-origin mutation request is required.",
      {
        status: 403,
        publicMessage: "This change must be submitted from the application.",
      },
    );
  }
}

function payloadTooLarge(): RuntimeError {
  return new RuntimeError("PAYLOAD_TOO_LARGE", "Mutation input is too large.", {
    status: 413,
    publicMessage: "That change is too large to submit.",
  });
}

async function readBoundedUtf8Body(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw payloadTooLarge();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("INVALID_INPUT", "Mutation JSON is invalid UTF-8.", {
      status: 400,
      publicMessage: "Provide valid information for this change.",
    });
  }
}

export async function readJsonMutation(request: Request): Promise<unknown> {
  requireSameOrigin(request);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new RuntimeError(
      "CONTENT_TYPE_REQUIRED",
      "Mutation requests require application/json.",
      {
        status: 415,
        publicMessage: "Submit this change as application JSON.",
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAXIMUM_MUTATION_BYTES
  ) {
    throw payloadTooLarge();
  }

  try {
    return JSON.parse(
      await readBoundedUtf8Body(request, MAXIMUM_MUTATION_BYTES),
    );
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("INVALID_INPUT", "Mutation JSON is invalid.", {
      status: 400,
      publicMessage: "Provide valid information for this change.",
    });
  }
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) {
    throw new RuntimeError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid idempotency key is required.",
      {
        status: 400,
        publicMessage: "This change requires a valid operation key.",
      },
    );
  }
  return value;
}
