import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [
  { activateCustomer },
  { activeCustomerCondition },
  { requireActiveModule },
] = await Promise.all([
  import("../db/customer-activation.ts"),
  import("../db/authority-guards.ts"),
  import("../lib/modules/active-module.ts"),
]);

let requestSequence = 0;
function activationContext(idempotencyKey) {
  requestSequence += 1;
  return {
    idempotencyKey,
    requestId: `request_activation_${requestSequence}`,
  };
}

function activationInput(overrides = {}) {
  return {
    email: " Listener@Example.Test ",
    displayName: "Fictional Listener",
    ...overrides,
  };
}

async function assertRuntimeCode(promise, expectedCode, expectedStatus = 403) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    assert.equal(error?.status, expectedStatus);
    return true;
  });
}

test("explicit activation atomically creates one normalized customer principal and replays safely", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());

  const context = activationContext("customer-activate-0001");
  const first = await activateCustomer(
    memory.binding,
    activationInput(),
    context,
  );

  assert.equal(first.replayed, false);
  assert.deepEqual(first.value, {
    userId: first.value.userId,
    role: "customer",
    profileRevision: 1,
  });
  assert.equal(
    scalar(
      memory.database,
      "SELECT normalized_email FROM users WHERE id = ?",
      first.value.userId,
    ),
    "listener@example.test",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT display_name FROM profiles WHERE user_id = ?",
      first.value.userId,
    ),
    "Fictional Listener",
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM role_assignments
       WHERE user_id = ? AND role_key = 'customer' AND revoked_at IS NULL`,
      first.value.userId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action = 'customer.activate' AND actor_user_id = ?`,
      first.value.userId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT role_assignments.last_operation_key = audit_events.idempotency_key
       FROM role_assignments
       JOIN audit_events ON audit_events.actor_user_id = role_assignments.user_id
       WHERE role_assignments.user_id = ?
         AND role_assignments.role_key = 'customer'
         AND audit_events.action = 'customer.activate'`,
      first.value.userId,
    ),
    1,
  );

  const replay = await activateCustomer(
    memory.binding,
    activationInput(),
    context,
  );
  assert.deepEqual(replay, { value: first.value, replayed: true });
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM role_assignments"),
    1,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM audit_events"), 1);

  const repeated = await activateCustomer(
    memory.binding,
    activationInput(),
    activationContext("customer-activate-0002"),
  );
  assert.equal(repeated.replayed, false);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM role_assignments"),
    1,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM profiles"), 1);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM audit_events"), 2);
});

test("same-key activation races converge on one role and one receipt", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  const input = activationInput({ email: "race@example.test" });

  const results = await Promise.all([
    activateCustomer(
      memory.binding,
      input,
      activationContext("customer-race-0001"),
    ),
    activateCustomer(
      memory.binding,
      input,
      activationContext("customer-race-0001"),
    ),
  ]);

  assert.deepEqual(results.map(({ replayed }) => replayed).sort(), [
    false,
    true,
  ]);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM users"), 1);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM profiles"), 1);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM role_assignments"),
    1,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM audit_events"), 1);
});

test("disabled and revoked customer identities cannot self-reactivate", async (t) => {
  const disabled = await createInMemoryD1();
  const revoked = await createInMemoryD1();
  t.after(() => disabled.close());
  t.after(() => revoked.close());

  disabled.database
    .prepare(
      `INSERT INTO users (id, email, normalized_email, status)
       VALUES ('user_disabled', 'disabled@example.test',
               'disabled@example.test', 'disabled')`,
    )
    .run();
  await assertRuntimeCode(
    activateCustomer(
      disabled.binding,
      activationInput({ email: "disabled@example.test" }),
      activationContext("customer-disabled-0001"),
    ),
    "ACCOUNT_DISABLED",
  );

  revoked.database
    .prepare(
      `INSERT INTO users (id, email, normalized_email, status)
       VALUES ('user_revoked', 'revoked@example.test',
               'revoked@example.test', 'active')`,
    )
    .run();
  revoked.database
    .prepare(
      `INSERT INTO profiles (user_id, display_name)
       VALUES ('user_revoked', 'Revoked Listener')`,
    )
    .run();
  revoked.database
    .prepare(
      `INSERT INTO role_assignments
        (id, user_id, role_key, assigned_by_user_id, revoked_at)
       VALUES ('role_customer_revoked', 'user_revoked', 'customer',
               'user_revoked', CURRENT_TIMESTAMP)`,
    )
    .run();
  await assertRuntimeCode(
    activateCustomer(
      revoked.binding,
      activationInput({ email: "revoked@example.test" }),
      activationContext("customer-revoked-0001"),
    ),
    "CUSTOMER_REACTIVATION_REQUIRES_ARTIST",
  );

  assert.equal(
    scalar(
      revoked.database,
      `SELECT COUNT(*) FROM role_assignments
       WHERE user_id = 'user_revoked' AND revoked_at IS NULL`,
    ),
    0,
  );
  assert.equal(
    scalar(revoked.database, "SELECT COUNT(*) FROM audit_events"),
    0,
  );
});

test("an existing operator can add the customer role without replacing profile state", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  memory.database
    .prepare(
      `INSERT INTO users (id, email, normalized_email, status)
       VALUES ('user_editor_existing', 'editor@example.test',
               'editor@example.test', 'active')`,
    )
    .run();
  memory.database
    .prepare(
      `INSERT INTO profiles (user_id, display_name, revision)
       VALUES ('user_editor_existing', 'Existing profile', 3)`,
    )
    .run();
  memory.database
    .prepare(
      `INSERT INTO role_assignments
        (id, user_id, role_key, assigned_by_user_id)
       VALUES ('role_editor_existing', 'user_editor_existing', 'editor',
               'user_editor_existing')`,
    )
    .run();

  const result = await activateCustomer(
    memory.binding,
    activationInput({
      email: "EDITOR@example.test",
      displayName: "Replacement name",
    }),
    activationContext("customer-editor-0001"),
  );

  assert.equal(result.value.userId, "user_editor_existing");
  assert.equal(result.value.profileRevision, 3);
  assert.equal(
    scalar(
      memory.database,
      "SELECT display_name FROM profiles WHERE user_id = 'user_editor_existing'",
    ),
    "Existing profile",
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM role_assignments
       WHERE user_id = 'user_editor_existing' AND revoked_at IS NULL`,
    ),
    2,
  );
});

test("customer and optional-module guards fail closed on current D1 facts", async () => {
  const customer = activeCustomerCondition("user_customer");
  assert.match(customer.sql, /customer_role\.role_key = 'customer'/);
  assert.match(customer.sql, /customer_role\.revoked_at IS NULL/);
  assert.match(customer.sql, /customer_user\.status = 'active'/);
  assert.deepEqual(customer.bindings, ["user_customer"]);

  const calls = [];
  const binding = {
    prepare(sql) {
      return {
        bind(...bindings) {
          calls.push({ sql, bindings });
          return {
            async first() {
              return bindings[0] === "downloads" ? { active: 1 } : null;
            },
          };
        },
      };
    },
  };

  await requireActiveModule(binding, "downloads");
  await assertRuntimeCode(
    requireActiveModule(binding, "customer-library"),
    "MODULE_INACTIVE",
    404,
  );
  assert.match(calls[0].sql, /FROM artist_modules/);
  assert.deepEqual(calls[0].bindings, ["downloads"]);
});

test("the account endpoint accepts only empty JSON and derives identity server-side", async () => {
  const [route, control, accountPage, profilePage] = await Promise.all([
    readFile(
      new URL("../app/api/account/activate/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../components/account/CustomerActivationControl.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/account/profile/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(route, /requireEmptyInput\(await readJsonMutation\(request\)\)/);
  assert.match(route, /Object\.keys\(input\)\.length === 0/);
  assert.match(route, /const authenticatedUser = await getChatGPTUser\(\)/);
  assert.match(route, /email: authenticatedUser\.email/);
  assert.doesNotMatch(route, /input\.email|record\.email|body\.email/);
  assert.match(control, /body: "\{\}"/);
  assert.match(control, /aria-live="polite"/);
  assert.match(control, /router\.refresh\(\)/);
  assert.match(accountPage, /<CustomerActivationControl \/>/);
  assert.match(profilePage, /<CustomerActivationControl \/>/);
  assert.doesNotMatch(accountPage, /activateCustomer\(/);
  assert.doesNotMatch(profilePage, /activateCustomer\(/);
});
