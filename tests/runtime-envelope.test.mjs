import assert from "node:assert/strict";
import test from "node:test";

import {
  REDACTED_VALUE,
  RuntimeError,
  createErrorEnvelope,
  createErrorResponse,
  createLogRecord,
  createRequestId,
  createStructuredLogger,
  normalizeUnknownError,
  redactForJson,
  resolveSimulationMode,
  serializeLogRecord,
} from "../lib/runtime/index.ts";

const REQUEST_ID = "req_runtime-lab-0001";
const FIXED_TIME = new Date("2026-07-18T12:00:00.000Z");

test("unknown errors produce a stable public envelope and a correlated response", async () => {
  const thrown = new Error(
    "upload failed for /Users/artist/private/master.wav token=do-not-log-me",
  );
  const normalized = normalizeUnknownError(thrown);
  const envelope = createErrorEnvelope(thrown, REQUEST_ID);
  const response = createErrorResponse(thrown, REQUEST_ID);

  assert.deepEqual(envelope, {
    error: {
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
      requestId: REQUEST_ID,
    },
  });
  assert.equal(normalized.log.message, REDACTED_VALUE);
  assert.equal(response.status, 500);
  assert.equal(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(response.headers.get("x-request-id"), REQUEST_ID);
  assert.deepEqual(await response.json(), envelope);

  const serialized = JSON.stringify({ envelope, normalized });
  assert.doesNotMatch(serialized, /master\.wav|do-not-log-me|\/Users\/artist/);
});

test("deliberate runtime errors preserve only their explicitly safe public contract", () => {
  const error = new RuntimeError("NOT_FOUND", "catalog record 42 is absent", {
    status: 404,
    publicMessage: "That resource was not found.",
    details: {
      recordId: "release_42",
      signedUrl: "https://media.example.test/audio?X-Amz-Signature=secret",
    },
  });

  assert.deepEqual(createErrorEnvelope(error, REQUEST_ID), {
    error: {
      code: "NOT_FOUND",
      message: "That resource was not found.",
      requestId: REQUEST_ID,
    },
  });

  const normalized = normalizeUnknownError(error);
  assert.equal(normalized.status, 404);
  assert.deepEqual(normalized.log.details, {
    recordId: "release_42",
    signedUrl: REDACTED_VALUE,
  });
});

test("structured records redact sensitive fields and sensitive string values recursively", () => {
  const context = {
    artistId: "artist_fictional",
    authorization: "Bearer header-secret-value",
    contact: {
      email: "listener@example.test",
      note: "send to listener@example.test",
    },
    media: {
      localPath: "/Users/artist/private/master.wav",
      publicPath: "/music/releases/fictional-release",
      url: "https://media.example.test/audio?X-Amz-Signature=query-secret",
    },
    tokens: ["eyJabcdefghij.abcdefghij.abcdefghij", "safe-label"],
  };

  const record = createLogRecord(
    {
      level: "error",
      event: "Media Upload Failed",
      requestId: REQUEST_ID,
      message: "The fictional upload could not complete.",
      context,
      error: new Error("Bearer error-secret-value"),
    },
    () => FIXED_TIME,
  );
  const serialized = serializeLogRecord(record);

  assert.equal(record.timestamp, "2026-07-18T12:00:00.000Z");
  assert.equal(record.event, "media_upload_failed");
  assert.equal(record.requestId, REQUEST_ID);
  assert.equal(record.context.artistId, "artist_fictional");
  assert.equal(record.context.authorization, REDACTED_VALUE);
  assert.equal(
    record.context.media.publicPath,
    "/music/releases/fictional-release",
  );
  assert.equal(record.context.media.localPath, REDACTED_VALUE);
  assert.equal(record.context.media.url, REDACTED_VALUE);
  assert.equal(record.context.contact.note, REDACTED_VALUE);
  assert.equal(record.context.tokens[0], REDACTED_VALUE);
  assert.equal(record.error.message, REDACTED_VALUE);
  assert.doesNotMatch(
    serialized,
    /header-secret|error-secret|query-secret|listener@example|master\.wav|\/Users\/artist/,
  );
});

test("runtime redaction removes test and live payment credentials, provider objects, checkout links, and PAN-shaped values", () => {
  const redacted = redactForJson({
    safeStatus: "test-mode-active",
    safeProgress: "in_progress",
    opaqueCredential: "sk_test_FictionalBoundaryValue0001",
    opaqueLiveCredential: "pk_live_FictionalBoundaryValue0002",
    opaqueWebhook: "whsec_FictionalBoundaryValue0003",
    opaqueProviderObject: "cs_test_FictionalCheckoutSession0004",
    opaqueSignature: "t=1784448000,v1=0123456789abcdef0123456789abcdef",
    opaqueCheckoutUrl:
      "https://checkout.stripe.com/c/pay/cs_test_FictionalCheckoutSession0004",
    opaquePan: "4242 4242 4242 4242",
    customerUserId: "user_private_customer",
    checkoutSessionId: "session_private_checkout",
    paymentMethod: "method_private_payment",
    providerObjectId: "object_private_provider",
  });

  assert.equal(redacted.safeStatus, "test-mode-active");
  assert.equal(redacted.safeProgress, "in_progress");
  for (const [key, value] of Object.entries(redacted)) {
    if (key === "safeStatus" || key === "safeProgress") continue;
    assert.equal(value, REDACTED_VALUE, `${key} must be redacted`);
  }
  assert.doesNotMatch(
    JSON.stringify(redacted),
    /FictionalBoundary|4242|private_customer|private_checkout|private_payment|private_provider/,
  );
});

test("redaction remains JSON-safe for circular and unusual unknown values", () => {
  const input = { safe: "value", count: 4n };
  input.self = input;
  Object.defineProperty(input, "unsafeGetter", {
    enumerable: true,
    get() {
      throw new Error("the getter must not execute");
    },
  });

  const redacted = redactForJson(input);
  const serialized = JSON.stringify(redacted);

  assert.deepEqual(redacted, {
    count: "4",
    safe: "value",
    self: "[CIRCULAR]",
    unsafeGetter: "[UNSERIALIZABLE]",
  });
  assert.doesNotThrow(() => JSON.parse(serialized));

  const unreadable = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error("proxy trap must stay private");
      },
    },
  );
  assert.equal(redactForJson(unreadable), "[UNSERIALIZABLE]");
  assert.deepEqual(normalizeUnknownError(unreadable), {
    code: "INTERNAL_ERROR",
    status: 500,
    publicMessage: "The request could not be completed.",
    log: {
      name: "UnreadableThrownValue",
      message: "The thrown value could not be inspected safely.",
    },
  });
});

test("request IDs and structured logger output can be deterministic without console emission", () => {
  assert.equal(
    createRequestId(() => REQUEST_ID),
    REQUEST_ID,
  );
  assert.throws(
    () => createRequestId(() => "unsafe id with spaces"),
    /invalid identifier/,
  );

  const writes = [];
  const logger = createStructuredLogger({
    now: () => FIXED_TIME,
    sink(serialized, record) {
      writes.push({ serialized, record });
    },
  });

  const written = logger.write({
    level: "info",
    event: "runtime.ready",
    requestId: REQUEST_ID,
    context: { mode: "off" },
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].serialized, JSON.stringify(written));
  assert.deepEqual(writes[0].record, written);
});

test("simulation mode is strict, deterministic, server-selected, and test-only", () => {
  const cases = [
    [
      {},
      {
        mode: "off",
        enabled: false,
        environment: "unknown",
        reason: "disabled",
      },
    ],
    [
      { AOP_RUNTIME_ENV: "test", AOP_SIMULATION_MODE: "runtime-lab" },
      {
        mode: "runtime-lab",
        enabled: true,
        environment: "test",
        reason: "enabled-for-test",
      },
    ],
    [
      { AOP_RUNTIME_ENV: "production", AOP_SIMULATION_MODE: "runtime-lab" },
      {
        mode: "off",
        enabled: false,
        environment: "production",
        reason: "non-test-environment",
      },
    ],
    [
      { AOP_RUNTIME_ENV: "development", AOP_SIMULATION_MODE: "runtime-lab" },
      {
        mode: "off",
        enabled: false,
        environment: "development",
        reason: "non-test-environment",
      },
    ],
    [
      { AOP_RUNTIME_ENV: "test", AOP_SIMULATION_MODE: "runtime-lab " },
      {
        mode: "off",
        enabled: false,
        environment: "test",
        reason: "invalid-mode",
      },
    ],
    [
      { AOP_RUNTIME_ENV: "test", AOP_SIMULATION_MODE: true },
      {
        mode: "off",
        enabled: false,
        environment: "test",
        reason: "invalid-mode",
      },
    ],
  ];

  for (const [configuration, expected] of cases) {
    const first = resolveSimulationMode(configuration);
    const second = resolveSimulationMode(configuration);
    assert.deepEqual(first, expected);
    assert.deepEqual(second, expected);
  }
});
