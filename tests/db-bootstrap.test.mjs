import assert from "node:assert/strict";
import test from "node:test";

import { D1_BOOTSTRAP_STATEMENTS, bootstrapD1Schema } from "../db/bootstrap.ts";
import { runAtomicBatch } from "../db/d1.ts";

function createFakeD1() {
  const prepared = [];
  const batches = [];

  return {
    prepared,
    batches,
    binding: {
      prepare(sql) {
        const statement = { sql };
        prepared.push(statement);
        return statement;
      },
      async batch(statements) {
        batches.push(statements);
        return statements.map(() => ({ success: true, results: [] }));
      },
    },
  };
}

test("the local D1 bootstrap prepares one idempotent statement per batch item", async () => {
  const fake = createFakeD1();
  const results = await bootstrapD1Schema(fake.binding);

  assert.equal(fake.batches.length, 1);
  assert.equal(fake.prepared.length, D1_BOOTSTRAP_STATEMENTS.length);
  assert.equal(results.length, D1_BOOTSTRAP_STATEMENTS.length);
  assert.deepEqual(
    fake.batches[0].map(({ sql }) => sql),
    D1_BOOTSTRAP_STATEMENTS,
  );

  for (const statement of D1_BOOTSTRAP_STATEMENTS) {
    assert.match(
      statement,
      /^(?:CREATE (?:TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS|INSERT OR IGNORE INTO roles)/,
    );
    assert.doesNotMatch(statement, /;/);
  }

  const usersIndex = D1_BOOTSTRAP_STATEMENTS.findIndex((statement) =>
    statement.startsWith("CREATE TABLE IF NOT EXISTS users"),
  );
  const rolesIndex = D1_BOOTSTRAP_STATEMENTS.findIndex((statement) =>
    statement.startsWith("CREATE TABLE IF NOT EXISTS role_assignments"),
  );
  assert.ok(usersIndex >= 0 && rolesIndex > usersIndex);
  assert.equal(
    D1_BOOTSTRAP_STATEMENTS.filter((statement) =>
      statement.startsWith("INSERT OR IGNORE INTO roles"),
    ).length,
    3,
  );
});

test("the D1 atomic helper rejects an empty unit of work", async () => {
  const fake = createFakeD1();

  await assert.rejects(
    runAtomicBatch(fake.binding, []),
    /requires at least one statement/,
  );
  assert.equal(fake.batches.length, 0);
});
