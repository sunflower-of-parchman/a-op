import assert from "node:assert/strict";
import test from "node:test";

import { createR2MediaStore } from "../lib/media/r2-store.ts";

function streamFrom(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from(bytes));
      controller.close();
    },
  });
}

function storedObject(overrides = {}) {
  return {
    key: "private/media/never-return-this-key",
    version: "private-version",
    size: 4,
    etag: "private-etag",
    httpEtag: '"private-etag"',
    checksums: {},
    uploaded: new Date("2026-07-18T00:00:00Z"),
    httpMetadata: { contentType: "audio/mpeg" },
    customMetadata: { customer: "private-customer-data" },
    storageClass: "Standard",
    ...overrides,
  };
}

class FakeR2Bucket {
  calls = [];
  headResult = null;
  getResult = null;
  putResult = storedObject();

  async put(key, value, options) {
    this.calls.push({ method: "put", key, value, options });
    return this.putResult;
  }

  async head(key) {
    this.calls.push({ method: "head", key });
    return this.headResult;
  }

  async get(key, options) {
    this.calls.push({ method: "get", key, options });
    return this.getResult;
  }

  async delete(key) {
    this.calls.push({ method: "delete", key });
  }
}

test("put supplies only safe HTTP metadata and returns no private R2 facts", async () => {
  const bucket = new FakeR2Bucket();
  bucket.putResult = storedObject({
    size: 3,
    httpMetadata: { contentType: "audio/ogg" },
  });
  const store = createR2MediaStore(bucket);

  const result = await store.put("private/media/track-v1", "abc", {
    contentType: "audio/ogg",
  });

  assert.deepEqual(bucket.calls, [
    {
      method: "put",
      key: "private/media/track-v1",
      value: "abc",
      options: { httpMetadata: { contentType: "audio/ogg" } },
    },
  ]);
  assert.deepEqual(result, { byteLength: 3, contentType: "audio/ogg" });
  assert.deepEqual(Object.keys(result).sort(), ["byteLength", "contentType"]);
  assert.equal(result.key, undefined);
  assert.equal(result.customMetadata, undefined);
  assert.equal(result.etag, undefined);
});

test("head maps byte length and public content type, or returns null", async () => {
  const bucket = new FakeR2Bucket();
  const store = createR2MediaStore(bucket);

  assert.equal(await store.head("private/media/missing"), null);

  bucket.headResult = storedObject({
    size: 8,
    httpMetadata: { contentType: "  audio/wav  " },
  });
  assert.deepEqual(await store.head("private/media/present"), {
    byteLength: 8,
    contentType: "audio/wav",
  });
});

test("full and ranged gets return a safe body projection", async () => {
  const bucket = new FakeR2Bucket();
  const body = streamFrom([1, 2, 3, 4]);
  bucket.getResult = storedObject({ body });
  const store = createR2MediaStore(bucket);

  const full = await store.get("private/media/track");
  assert.deepEqual(Object.keys(full).sort(), [
    "body",
    "byteLength",
    "contentType",
  ]);
  assert.equal(full.body, body);
  assert.equal(full.byteLength, 4);
  assert.equal(full.contentType, "audio/mpeg");
  assert.equal(full.key, undefined);
  assert.equal(full.customMetadata, undefined);

  const partial = await store.getRange("private/media/track", {
    offset: 1,
    length: 2,
  });
  assert.equal(partial.body, body);
  assert.deepEqual(bucket.calls, [
    { method: "get", key: "private/media/track", options: undefined },
    {
      method: "get",
      key: "private/media/track",
      options: { range: { offset: 1, length: 2 } },
    },
  ]);
});

test("get and getRange return null for a missing object or body", async () => {
  const bucket = new FakeR2Bucket();
  const store = createR2MediaStore(bucket);

  bucket.getResult = null;
  assert.equal(await store.get("private/media/missing"), null);

  bucket.getResult = storedObject();
  assert.equal(
    await store.getRange("private/media/metadata-only", {
      offset: 0,
      length: 1,
    }),
    null,
  );
});

test("remove deletes exactly the validated private object key", async () => {
  const bucket = new FakeR2Bucket();
  const store = createR2MediaStore(bucket);

  await store.remove("private/media/retired-version");

  assert.deepEqual(bucket.calls, [
    { method: "delete", key: "private/media/retired-version" },
  ]);
});

test("every operation rejects empty private keys before touching R2", async () => {
  const bucket = new FakeR2Bucket();
  const store = createR2MediaStore(bucket);

  await assert.rejects(() => store.put(" ", "bytes"), TypeError);
  await assert.rejects(() => store.head(""), TypeError);
  await assert.rejects(() => store.get("\t"), TypeError);
  await assert.rejects(
    () => store.getRange(" ", { offset: 0, length: 1 }),
    TypeError,
  );
  await assert.rejects(() => store.remove("\n"), TypeError);
  assert.deepEqual(bucket.calls, []);
});

test("getRange rejects unsafe offsets and lengths before touching R2", async () => {
  const bucket = new FakeR2Bucket();
  const store = createR2MediaStore(bucket);

  const invalidRanges = [
    { offset: -1, length: 1 },
    { offset: 0.5, length: 1 },
    { offset: 0, length: 0 },
    { offset: 0, length: Number.MAX_SAFE_INTEGER + 1 },
  ];

  for (const range of invalidRanges) {
    await assert.rejects(
      () => store.getRange("private/media/track", range),
      RangeError,
    );
  }

  assert.deepEqual(bucket.calls, []);
});

test("missing content types use a safe binary fallback", async () => {
  const bucket = new FakeR2Bucket();
  bucket.putResult = storedObject({ httpMetadata: undefined });
  bucket.headResult = storedObject({ httpMetadata: undefined });
  const store = createR2MediaStore(bucket);

  assert.deepEqual(await store.put("private/media/blob", "bytes"), {
    byteLength: 4,
    contentType: "application/octet-stream",
  });
  assert.deepEqual(await store.head("private/media/blob"), {
    byteLength: 4,
    contentType: "application/octet-stream",
  });
});

test("unsafe content type metadata is replaced before it reaches a response", async () => {
  const bucket = new FakeR2Bucket();
  bucket.headResult = storedObject({
    httpMetadata: { contentType: "audio/mpeg\r\nx-private: leaked" },
  });
  const store = createR2MediaStore(bucket);

  assert.deepEqual(await store.head("private/media/blob"), {
    byteLength: 4,
    contentType: "application/octet-stream",
  });
});
