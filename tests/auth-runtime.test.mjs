import assert from "node:assert/strict";
import test from "node:test";

import {
  hasApplicationRole,
  normalizeIdentityEmail,
  resolveApplicationIdentity,
} from "../lib/auth/application-identity.ts";

function identityBinding(rows) {
  const calls = [];

  return {
    calls,
    binding: {
      prepare(sql) {
        return {
          bind(...bindings) {
            calls.push({ sql, bindings });
            return {
              async all() {
                return { success: true, results: rows };
              },
            };
          },
        };
      },
    },
  };
}

test("authenticated identity resolves ordered active roles from D1", async () => {
  const fake = identityBinding([
    {
      user_id: "user_1",
      email: "listener@example.test",
      display_name: null,
      role_key: "owner",
    },
    {
      user_id: "user_1",
      email: "listener@example.test",
      display_name: null,
      role_key: "customer",
    },
  ]);

  const identity = await resolveApplicationIdentity(fake.binding, {
    email: " Listener@Example.Test ",
    fullName: "Fictional Listener",
    displayName: "Fictional Listener",
  });

  assert.deepEqual(identity, {
    userId: "user_1",
    email: "listener@example.test",
    displayName: "Fictional Listener",
    roles: ["owner", "customer"],
  });
  assert.deepEqual(fake.calls[0].bindings, ["listener@example.test"]);
  assert.equal(hasApplicationRole(identity, "owner"), true);
  assert.equal(hasApplicationRole(identity, "editor"), false);
});

test("anonymous and unregistered identities receive no application authority", async () => {
  const fake = identityBinding([]);

  assert.equal(await resolveApplicationIdentity(fake.binding, null), null);
  assert.equal(fake.calls.length, 0);
  assert.equal(
    await resolveApplicationIdentity(fake.binding, {
      email: "new@example.test",
      fullName: null,
      displayName: "new@example.test",
    }),
    null,
  );
  assert.equal(hasApplicationRole(null, "customer"), false);
  assert.equal(
    normalizeIdentityEmail(" Person@Example.Test "),
    "person@example.test",
  );
});
