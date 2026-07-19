import assert from "node:assert/strict";
import test from "node:test";

import {
  createMediaResponse,
  createMediaResponsePlan,
  parseByteRange,
} from "../lib/media/range.ts";

test("absent and unsupported range units use the complete representation", () => {
  assert.deepEqual(parseByteRange(null, 1_000), {
    kind: "full",
    reason: "range-absent",
    totalSize: 1_000,
    length: 1_000,
  });

  assert.deepEqual(parseByteRange("items=0-9", 1_000), {
    kind: "full",
    reason: "range-unit-unsupported",
    totalSize: 1_000,
    length: 1_000,
  });
});

test("bounded, open-ended, and suffix ranges resolve to one exact object read", () => {
  assert.deepEqual(parseByteRange("bytes=100-199", 1_000), {
    kind: "partial",
    totalSize: 1_000,
    start: 100,
    end: 199,
    length: 100,
    readRange: { offset: 100, length: 100 },
  });

  assert.deepEqual(parseByteRange("bytes=900-2000", 1_000), {
    kind: "partial",
    totalSize: 1_000,
    start: 900,
    end: 999,
    length: 100,
    readRange: { offset: 900, length: 100 },
  });

  assert.deepEqual(parseByteRange("bytes=250-", 1_000), {
    kind: "partial",
    totalSize: 1_000,
    start: 250,
    end: 999,
    length: 750,
    readRange: { offset: 250, length: 750 },
  });

  assert.deepEqual(parseByteRange("bytes=-125", 1_000), {
    kind: "partial",
    totalSize: 1_000,
    start: 875,
    end: 999,
    length: 125,
    readRange: { offset: 875, length: 125 },
  });

  assert.deepEqual(parseByteRange("bytes=-2000", 1_000), {
    kind: "partial",
    totalSize: 1_000,
    start: 0,
    end: 999,
    length: 1_000,
    readRange: { offset: 0, length: 1_000 },
  });
});

test("valid ranges that cannot select bytes remain unsatisfiable", () => {
  assert.deepEqual(parseByteRange("bytes=1000-", 1_000), {
    kind: "unsatisfiable",
    reason: "start-beyond-representation",
    totalSize: 1_000,
  });
  assert.deepEqual(parseByteRange("bytes=-0", 1_000), {
    kind: "unsatisfiable",
    reason: "empty-suffix",
    totalSize: 1_000,
  });
  assert.deepEqual(parseByteRange("bytes=0-0", 0), {
    kind: "unsatisfiable",
    reason: "empty-representation",
    totalSize: 0,
  });
});

test("invalid syntax and rejected multi-ranges remain distinguishable", () => {
  const cases = [
    ["", "empty-header"],
    ["bytes", "missing-separator"],
    ["bytes=", "empty-range"],
    ["bytes=-", "empty-range"],
    ["bytes=20-10", "reversed-range"],
    ["bytes=one-two", "invalid-range-syntax"],
    ["bytes=0-1,4-5", "multiple-ranges-not-supported"],
    [`bytes=${Number.MAX_SAFE_INTEGER}0-`, "numeric-overflow"],
  ];

  for (const [header, reason] of cases) {
    assert.deepEqual(parseByteRange(header, 1_000), {
      kind: "malformed",
      reason,
      totalSize: 1_000,
    });
  }
});

test("representation size rejects unsafe adapter facts", () => {
  assert.throws(() => parseByteRange(null, -1), RangeError);
  assert.throws(() => parseByteRange(null, Number.NaN), RangeError);
  assert.throws(
    () => parseByteRange(null, Number.MAX_SAFE_INTEGER + 1),
    RangeError,
  );
});

test("response plans construct exact 200, 206, and 416 headers", () => {
  const full = createMediaResponsePlan(parseByteRange(null, 1_000), {
    contentType: "audio/mpeg",
  });
  assert.equal(full.status, 200);
  assert.equal(full.readRange, null);
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("content-length"), "1000");
  assert.equal(full.headers.get("content-type"), "audio/mpeg");
  assert.equal(full.headers.get("content-range"), null);

  const partial = createMediaResponsePlan(
    parseByteRange("bytes=400-499", 1_000),
    { contentType: "audio/ogg" },
  );
  assert.equal(partial.status, 206);
  assert.deepEqual(partial.readRange, { offset: 400, length: 100 });
  assert.equal(partial.headers.get("content-length"), "100");
  assert.equal(partial.headers.get("content-range"), "bytes 400-499/1000");
  assert.equal(partial.headers.get("content-type"), "audio/ogg");

  for (const decision of [
    parseByteRange("bytes=1000-", 1_000),
    parseByteRange("bytes=0-1,4-5", 1_000),
  ]) {
    const rejected = createMediaResponsePlan(decision, {
      contentType: "audio/mpeg",
    });
    assert.equal(rejected.status, 416);
    assert.equal(rejected.readRange, null);
    assert.equal(rejected.headers.get("accept-ranges"), "bytes");
    assert.equal(rejected.headers.get("content-length"), "0");
    assert.equal(rejected.headers.get("content-range"), "bytes */1000");
    assert.equal(rejected.headers.get("content-type"), null);
  }
});

test("the safe response allowlist cannot forward storage-specific headers", () => {
  const plan = createMediaResponsePlan(parseByteRange(null, 4), {
    contentType: "application/octet-stream",
    etag: "private-r2-etag",
    objectKey: "private/catalog/audio-key",
  });

  assert.deepEqual([...plan.headers.keys()].sort(), [
    "accept-ranges",
    "content-length",
    "content-type",
  ]);
  assert.equal(plan.headers.get("etag"), null);
  assert.equal(plan.headers.get("x-r2-object-key"), null);
});

test("unsafe content-type metadata falls back without breaking delivery", () => {
  const plan = createMediaResponsePlan(parseByteRange(null, 4), {
    contentType: "audio/mpeg\r\nx-private: leaked",
  });

  assert.equal(plan.headers.get("content-type"), "application/octet-stream");
  assert.equal(plan.headers.get("x-private"), null);
});

test("response construction drops any supplied body for a 416", async () => {
  const fullPlan = createMediaResponsePlan(parseByteRange(null, 4));
  const fullResponse = createMediaResponse(
    fullPlan,
    new Uint8Array([1, 2, 3, 4]),
  );
  assert.equal(fullResponse.status, 200);
  assert.deepEqual(
    new Uint8Array(await fullResponse.arrayBuffer()),
    new Uint8Array([1, 2, 3, 4]),
  );

  const rejectedPlan = createMediaResponsePlan(parseByteRange("bytes=4-", 4));
  const rejectedResponse = createMediaResponse(
    rejectedPlan,
    new Uint8Array([1, 2, 3, 4]),
  );
  assert.equal(rejectedResponse.status, 416);
  assert.equal((await rejectedResponse.arrayBuffer()).byteLength, 0);
});
