import assert from "node:assert/strict";
import test from "node:test";

import {
  readJsonMutation,
  requireIdempotencyKey,
  requireSameOrigin,
} from "../lib/auth/mutation-boundary.ts";

function jsonRequest(body, headers = {}) {
  return new Request("https://artist.example/api/change", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://artist.example",
      ...headers,
    },
    body,
  });
}

function hasRuntimeError(code, status) {
  return (error) => error?.code === code && error?.status === status;
}

test("same-origin JSON mutations read bounded valid input", async () => {
  const request = jsonRequest(JSON.stringify({ title: "Draft" }), {
    "idempotency-key": "draft-save-0001",
  });

  assert.deepEqual(await readJsonMutation(request), { title: "Draft" });
  assert.equal(requireIdempotencyKey(request), "draft-save-0001");
});

test("mutation boundary rejects cross-origin and malformed operation keys", () => {
  const crossOrigin = jsonRequest("{}", {
    origin: "https://outside.example",
  });
  assert.throws(
    () => requireSameOrigin(crossOrigin),
    hasRuntimeError("ORIGIN_REQUIRED", 403),
  );
  assert.throws(
    () => requireIdempotencyKey(jsonRequest("{}")),
    hasRuntimeError("IDEMPOTENCY_KEY_REQUIRED", 400),
  );
});

test("streamed JSON cannot bypass the 64 KiB mutation limit", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(65_537).fill(0x20));
      controller.close();
    },
  });
  const request = new Request("https://artist.example/api/change", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://artist.example",
    },
    body: stream,
    duplex: "half",
  });

  await assert.rejects(
    readJsonMutation(request),
    hasRuntimeError("PAYLOAD_TOO_LARGE", 413),
  );
});
