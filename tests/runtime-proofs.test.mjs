import assert from "node:assert/strict";
import test from "node:test";

import { readRuntimeProof, writeRuntimeProof } from "../db/runtime-proofs.ts";

function fakeBinding(rows) {
  const calls = [];
  return {
    calls,
    binding: {
      prepare(sql) {
        return {
          bind(...bindings) {
            calls.push({ sql, bindings });
            return {
              async first() {
                return rows.shift() ?? null;
              },
            };
          },
        };
      },
    },
  };
}

test("a runtime proof upsert increments and returns one safe durable record", async () => {
  const fake = fakeBinding([
    {
      key: "restart-proof",
      value: "second-process-read",
      revision: 2,
      updated_at: "2026-07-18 23:59:00",
    },
  ]);

  const proof = await writeRuntimeProof(
    fake.binding,
    "restart-proof",
    "second-process-read",
  );

  assert.deepEqual(proof, {
    key: "restart-proof",
    value: "second-process-read",
    revision: 2,
    updatedAt: "2026-07-18 23:59:00",
  });
  assert.deepEqual(fake.calls[0].bindings, [
    "restart-proof",
    "second-process-read",
  ]);
  assert.match(fake.calls[0].sql, /ON CONFLICT\(key\) DO UPDATE/);
  assert.match(fake.calls[0].sql, /revision = runtime_proofs\.revision \+ 1/);
  assert.match(fake.calls[0].sql, /RETURNING key, value, revision, updated_at/);
  assert.doesNotMatch(fake.calls[0].sql, /BEGIN|COMMIT/);
});

test("a runtime proof read returns the persisted record or null", async () => {
  const fake = fakeBinding([
    {
      key: "restart-proof",
      value: "first-process-write",
      revision: 1,
      updated_at: "2026-07-18 23:58:00",
    },
    null,
  ]);

  assert.deepEqual(await readRuntimeProof(fake.binding, "restart-proof"), {
    key: "restart-proof",
    value: "first-process-write",
    revision: 1,
    updatedAt: "2026-07-18 23:58:00",
  });
  assert.equal(await readRuntimeProof(fake.binding, "missing-proof"), null);
});

test("runtime proof inputs fail before D1 receives unsafe identifiers or values", async () => {
  const fake = fakeBinding([]);

  await assert.rejects(
    () => readRuntimeProof(fake.binding, "../../secret"),
    TypeError,
  );
  await assert.rejects(
    () => writeRuntimeProof(fake.binding, "proof", ""),
    TypeError,
  );
  await assert.rejects(
    () => writeRuntimeProof(fake.binding, "proof", "x".repeat(513)),
    TypeError,
  );
  assert.equal(fake.calls.length, 0);
});
