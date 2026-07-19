import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { prepareServerTelemetryEvent } =
  await import("../db/telemetry-server.ts");

const CUSTOMER = "user_server_telemetry_customer";
const SESSION = "33333333-3333-4333-8333-333333333333";

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    UPDATE artist_modules
    SET active = 1
    WHERE module_key IN ('telemetry', 'contact');
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${CUSTOMER}', 'server-telemetry@example.invalid',
            'server-telemetry@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('role_server_telemetry_customer', '${CUSTOMER}', 'customer', NULL);
  `);
  return memory;
}

function input(overrides = {}) {
  return {
    eventName: "contact-submitted",
    resourceType: "contact",
    resourceId: "contact_form_server_telemetry",
    sourceOperationKey: "contact.submission.create:server-telemetry-operation",
    userId: CUSTOMER,
    requestContext: {
      sessionId: SESSION,
      consent: "granted",
      privacySignal: null,
    },
    occurredAt: new Date("2026-07-19T12:00:00.000Z"),
    durableCondition: {
      sql: "EXISTS (SELECT 1 FROM users WHERE id = ? AND status = 'active')",
      bindings: [CUSTOMER],
    },
    ...overrides,
  };
}

async function run(memory, value) {
  const statement = await prepareServerTelemetryEvent(memory.binding, value);
  await statement.run();
}

test("server-owned telemetry is consent-aware, identity-safe, and replay-safe", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  await run(memory, input());
  await run(memory, input());
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_events"),
    1,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT event_name, resource_type, resource_id, session_id, user_id,
                  consent_basis, day_utc
           FROM telemetry_events`,
        )
        .get(),
    },
    {
      event_name: "contact-submitted",
      resource_type: "contact",
      resource_id: "contact_form_server_telemetry",
      session_id: SESSION,
      user_id: CUSTOMER,
      consent_basis: "explicit",
      day_utc: "2026-07-19",
    },
  );

  await run(
    memory,
    input({
      sourceOperationKey: "contact.submission.create:denied",
      requestContext: {
        sessionId: SESSION,
        consent: "denied",
        privacySignal: null,
      },
    }),
  );
  await run(
    memory,
    input({
      sourceOperationKey: "contact.submission.create:gpc",
      requestContext: {
        sessionId: SESSION,
        consent: "granted",
        privacySignal: "global-privacy-control",
      },
    }),
  );
  await run(
    memory,
    input({
      sourceOperationKey: "contact.submission.create:undecided",
      requestContext: {
        sessionId: SESSION,
        consent: "undecided",
        privacySignal: null,
      },
    }),
  );
  await run(
    memory,
    input({
      sourceOperationKey: "contact.submission.create:missing-source",
      durableCondition: {
        sql: "EXISTS (SELECT 1 FROM users WHERE id = ?)",
        bindings: ["user_missing"],
      },
    }),
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_events"),
    1,
  );

  memory.database
    .prepare(
      `UPDATE telemetry_settings
       SET collection_mode = 'anonymous', revision = revision + 1`,
    )
    .run();
  await run(
    memory,
    input({
      sourceOperationKey: "contact.submission.create:anonymous",
      requestContext: undefined,
    }),
  );
  const anonymous = memory.database
    .prepare(
      `SELECT session_id, user_id, consent_basis
       FROM telemetry_events WHERE consent_basis = 'not_required'`,
    )
    .get();
  assert.equal(anonymous?.user_id, null);
  assert.equal(anonymous?.consent_basis, "not_required");
  assert.match(
    anonymous?.session_id ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("server-owned telemetry never lands in an already finalized UTC day", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  memory.database
    .prepare(
      `INSERT INTO telemetry_aggregate_days
        (day_utc, source_event_count, group_count, session_count,
         linked_user_count, finalized_at, last_operation_key)
       VALUES (?, 1, 1, 1, 0, ?, ?)`,
    )
    .run(
      "2026-07-19",
      "2026-07-20T00:00:00.000Z",
      "telemetry:aggregate:server-events-finalized-day",
    );

  await run(
    memory,
    input({
      sourceOperationKey: "contact.submission.create:finalized-day",
    }),
  );

  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_events"),
    0,
  );
});
