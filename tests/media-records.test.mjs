import assert from "node:assert/strict";
import test from "node:test";

import {
  readMediaDeliveryRecord,
  removeMediaDeliveryRecord,
  upsertMediaDeliveryRecord,
} from "../db/media-objects.ts";

function fakeBinding(firstRows = []) {
  const calls = [];
  return {
    calls,
    binding: {
      prepare(sql) {
        return {
          bind(...bindings) {
            const call = { sql, bindings };
            calls.push(call);
            return {
              async first() {
                return firstRows.shift() ?? null;
              },
              async run() {
                return { success: true, results: [] };
              },
            };
          },
        };
      },
    },
  };
}

const record = {
  id: "media_delivery_range",
  objectKey: "originals/range-proof/v1",
  visibility: "protected",
  ownerUserId: "user_delivery_owner",
  contentType: "text/plain; charset=utf-8",
  byteLength: 24,
};

test("media delivery records keep the private R2 key inside the repository", async () => {
  const fake = fakeBinding([
    {
      id: record.id,
      object_key: record.objectKey,
      visibility: record.visibility,
      owner_user_id: record.ownerUserId,
      content_type: record.contentType,
      byte_length: record.byteLength,
    },
  ]);

  assert.deepEqual(
    await readMediaDeliveryRecord(fake.binding, record.id),
    record,
  );
  assert.match(fake.calls[0].sql, /WHERE id = \?1/);
  assert.deepEqual(fake.calls[0].bindings, [record.id]);
});

test("media writes and deletes use one prepared statement each", async () => {
  const fake = fakeBinding();

  await upsertMediaDeliveryRecord(fake.binding, record);
  await removeMediaDeliveryRecord(fake.binding, record.id);

  assert.match(fake.calls[0].sql, /ON CONFLICT\(id\) DO UPDATE/);
  assert.deepEqual(fake.calls[0].bindings, [
    record.id,
    record.objectKey,
    record.visibility,
    record.ownerUserId,
    record.contentType,
    record.byteLength,
  ]);
  assert.match(fake.calls[1].sql, /^DELETE FROM media_objects/);
});

test("unsafe media facts fail before reaching D1", async () => {
  const fake = fakeBinding();

  await assert.rejects(
    () => readMediaDeliveryRecord(fake.binding, "../private-key"),
    TypeError,
  );
  await assert.rejects(
    () =>
      upsertMediaDeliveryRecord(fake.binding, {
        ...record,
        objectKey: "../outside",
      }),
    TypeError,
  );
  await assert.rejects(
    () =>
      upsertMediaDeliveryRecord(fake.binding, {
        ...record,
        contentType: "text/plain\r\nx-private: leaked",
      }),
    TypeError,
  );
  assert.equal(fake.calls.length, 0);
});
