import assert from "node:assert/strict";
import test from "node:test";

import {
  hasApplicationRole,
  normalizeIdentityEmail,
  resolveApplicationIdentity,
} from "../lib/auth/application-identity.ts";
import {
  FICTIONAL_RUNTIME_IDENTITIES,
  bootstrapFictionalRuntimeIdentities,
} from "../lib/auth/runtime-fixtures.ts";

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

test("fictional runtime roles bootstrap as one replay-safe D1 batch", async () => {
  const prepared = [];
  const batches = [];
  const binding = {
    prepare(sql) {
      return {
        bind(...bindings) {
          const statement = { sql, bindings };
          prepared.push(statement);
          return statement;
        },
      };
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ success: true, results: [] }));
    },
  };

  const results = await bootstrapFictionalRuntimeIdentities(
    binding,
    "req_runtime-fixture-0001",
  );

  assert.equal(batches.length, 1);
  assert.equal(prepared.length, 10);
  assert.equal(results.length, 10);
  assert.match(prepared[0].sql, /ON CONFLICT\(id\) DO UPDATE/);
  assert.match(prepared[1].sql, /INSERT INTO profiles/);
  assert.match(prepared[6].sql, /INSERT INTO role_assignments/);
  assert.match(prepared[9].sql, /ON CONFLICT\(id\) DO NOTHING/);

  const serialized = JSON.stringify({
    fixtures: FICTIONAL_RUNTIME_IDENTITIES,
    prepared,
  });
  assert.match(serialized, /owner@a-op\.invalid/);
  assert.doesNotMatch(serialized, /soundformovement|@gmail\.com|@openai\.com/i);
});
