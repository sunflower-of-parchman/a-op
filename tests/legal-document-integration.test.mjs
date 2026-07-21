import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const legal = await import("../lib/legal/index.ts");
const read = await import("../db/legal-read.ts");
const write = await import("../db/legal-write.ts");

const OWNER = "user_legal_owner";
const EDITOR = "user_legal_editor";
let requestSequence = 0;

function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_legal_${requestSequence}`,
  };
}

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'legal-owner@example.invalid',
       'legal-owner@example.invalid', 'active'),
      ('${EDITOR}', 'legal-editor@example.invalid',
       'legal-editor@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_legal_owner', '${OWNER}', 'owner', '${OWNER}'),
      ('role_legal_editor', '${EDITOR}', 'editor', '${OWNER}');
    INSERT INTO editor_permissions
      (id, user_id, permission_key, scope_id, assigned_by_user_id)
    VALUES
      ('permission_legal_editor_pages', '${EDITOR}', 'pages.write', '*', '${OWNER}');
  `);
  return memory;
}

function setupAnswers(overrides = {}) {
  return {
    ...legal.createDefaultLegalSetupAnswers(),
    publicContactEmail: "artist@example.invalid",
    contactSubmissions: true,
    downloads: true,
    memberships: true,
    subscriptions: true,
    licensing: true,
    services: ["OpenAI Sites", "Stripe", "Fictional transcript service"],
    ...overrides,
  };
}

function input(documentId, version) {
  return {
    documentId,
    title: documentId === "privacy" ? "Privacy Policy" : "Terms and Conditions",
    introduction: `Artist-reviewed ${documentId} introduction, version ${version}.`,
    bodyText: [
      `Fictional ${documentId} body, version ${version}.`,
      "This Site uses Stripe Test Mode only.",
      "No real payment will be accepted and no money is moved.",
      "Sites does not support data residency or inference residency at launch.",
    ].join("\n"),
    setupAnswers: setupAnswers(),
  };
}

function injectBeforeBatch(binding, injection) {
  let pending = true;
  return {
    prepare(sql) {
      return binding.prepare(sql);
    },
    batch(statements) {
      if (pending) {
        pending = false;
        injection();
      }
      return binding.batch(statements);
    },
  };
}

function injectBeforeSqlExecution(binding, sqlFragment, injection) {
  let pending = true;
  return {
    prepare(sql) {
      const statement = binding.prepare(sql);
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          const before = () => {
            if (pending && sql.includes(sqlFragment)) {
              pending = false;
              injection();
            }
          };
          return {
            all() {
              before();
              return bound.all();
            },
            first(columnName) {
              before();
              return bound.first(columnName);
            },
            raw() {
              before();
              return bound.raw();
            },
            run() {
              before();
              return bound.run();
            },
          };
        },
      };
    },
    batch(statements) {
      return binding.batch(statements);
    },
  };
}

async function runtimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("owner review publishes exact immutable legal versions and preserves the prior public version", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  assert.equal(
    await read.readPublishedLegalDocument(memory.binding, "privacy"),
    null,
  );
  const seeded = await read.readAdminLegalDocument(
    memory.binding,
    "privacy",
    OWNER,
  );
  assert.equal(seeded.draft.version, 1);
  assert.equal(seeded.draft.setupAnswers, null);
  assert.equal(seeded.published, null);

  await runtimeCode(
    write.approveLegalDocumentDraft(
      memory.binding,
      "privacy",
      seeded.draft.id,
      1,
      context(OWNER, "approve-incomplete-starter"),
    ),
    "LEGAL_SETUP_INCOMPLETE",
  );

  const saveContext = context(OWNER, "privacy-save-v2");
  const saved = await write.saveLegalDocumentDraft(
    memory.binding,
    input("privacy", 2),
    1,
    saveContext,
  );
  assert.deepEqual(
    {
      version: saved.value.version,
      revision: saved.value.revision,
      published: saved.value.publishedVersionId,
    },
    { version: 2, revision: 2, published: null },
  );
  const saveReplay = await write.saveLegalDocumentDraft(
    memory.binding,
    input("privacy", 2),
    1,
    saveContext,
  );
  assert.equal(saveReplay.replayed, true);
  assert.deepEqual(saveReplay.value, saved.value);

  const approveContext = context(OWNER, "privacy-approve-v2");
  const approved = await write.approveLegalDocumentDraft(
    memory.binding,
    "privacy",
    saved.value.draftVersionId,
    2,
    approveContext,
  );
  assert.equal(approved.value.revision, 3);
  assert.equal(
    (
      await write.approveLegalDocumentDraft(
        memory.binding,
        "privacy",
        saved.value.draftVersionId,
        2,
        approveContext,
      )
    ).replayed,
    true,
  );
  assert.equal(
    await read.readPublishedLegalDocument(memory.binding, "privacy"),
    null,
  );

  const publishContext = context(OWNER, "privacy-publish-v2");
  const published = await write.publishLegalDocument(
    memory.binding,
    "privacy",
    saved.value.draftVersionId,
    3,
    publishContext,
  );
  assert.equal(published.value.revision, 4);
  assert.equal(
    (
      await write.publishLegalDocument(
        memory.binding,
        "privacy",
        saved.value.draftVersionId,
        3,
        publishContext,
      )
    ).replayed,
    true,
  );
  let publicDocument = await read.readPublishedLegalDocument(
    memory.binding,
    "privacy",
  );
  assert.equal(publicDocument.version, 2);
  assert.match(publicDocument.bodyText, /No real payment will be accepted/);

  const next = await write.saveLegalDocumentDraft(
    memory.binding,
    input("privacy", 3),
    4,
    context(OWNER, "privacy-save-v3"),
  );
  assert.equal(next.value.version, 3);
  assert.equal(next.value.publishedVersionId, saved.value.draftVersionId);
  publicDocument = await read.readPublishedLegalDocument(
    memory.binding,
    "privacy",
  );
  assert.equal(publicDocument.version, 2);
  await runtimeCode(
    write.publishLegalDocument(
      memory.binding,
      "privacy",
      next.value.draftVersionId,
      5,
      context(OWNER, "privacy-publish-unapproved-v3"),
    ),
    "LEGAL_APPROVAL_REQUIRED",
  );
  assert.equal(
    (await read.readPublishedLegalDocument(memory.binding, "privacy")).version,
    2,
  );

  await write.approveLegalDocumentDraft(
    memory.binding,
    "privacy",
    next.value.draftVersionId,
    5,
    context(OWNER, "privacy-approve-v3"),
  );
  assert.equal(
    (await read.readPublishedLegalDocument(memory.binding, "privacy")).version,
    2,
  );
  await write.publishLegalDocument(
    memory.binding,
    "privacy",
    next.value.draftVersionId,
    6,
    context(OWNER, "privacy-publish-v3"),
  );
  publicDocument = await read.readPublishedLegalDocument(
    memory.binding,
    "privacy",
  );
  assert.equal(publicDocument.version, 3);

  const history = memory.database
    .prepare(
      `SELECT version, body_text, approved_at
       FROM legal_document_versions
       WHERE document_id = 'privacy'
       ORDER BY version`,
    )
    .all();
  assert.equal(history.length, 3);
  assert.match(history[1].body_text, /version 2/);
  assert.match(history[2].body_text, /version 3/);
  assert.notEqual(history[1].approved_at, null);
  assert.notEqual(history[2].approved_at, null);
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE subject_type = 'legal-document' AND subject_id = 'privacy'",
    ),
    6,
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("editors cannot read or change private legal drafts", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  assert.equal(
    await read.readAdminLegalDocument(memory.binding, "terms", EDITOR),
    null,
  );
  await runtimeCode(
    read.readLegalAdminWorkspace(memory.binding, EDITOR),
    "LEGAL_OWNER_REQUIRED",
  );
  await runtimeCode(
    write.saveLegalDocumentDraft(
      memory.binding,
      input("terms", 2),
      1,
      context(EDITOR, "editor-legal-save"),
    ),
    "LEGAL_OWNER_REQUIRED",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM legal_document_versions WHERE document_id = 'terms'",
    ),
    1,
  );
});

test("owner revocation and stale draft changes leave no version, publication, or audit receipt", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  const operationKey = "legal-save-revoked-at-batch";
  const boundary = injectBeforeBatch(memory.binding, () => {
    memory.database.exec(`
      UPDATE role_assignments
      SET revoked_at = '2026-07-19T12:00:00.000Z',
          revoked_by_user_id = '${OWNER}'
      WHERE user_id = '${OWNER}' AND role_key = 'owner'
        AND revoked_at IS NULL;
    `);
  });
  await runtimeCode(
    write.saveLegalDocumentDraft(
      boundary,
      input("terms", 2),
      1,
      context(OWNER, operationKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM legal_document_versions WHERE document_id = 'terms'",
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `legal-document.draft.save:${OWNER}:${operationKey}`,
    ),
    0,
  );

  memory.database.exec(`
    UPDATE role_assignments
    SET revoked_at = NULL, revoked_by_user_id = NULL
    WHERE user_id = '${OWNER}' AND role_key = 'owner';
  `);
  const saved = await write.saveLegalDocumentDraft(
    memory.binding,
    input("terms", 2),
    1,
    context(OWNER, "terms-save-boundary-v2"),
  );
  await write.approveLegalDocumentDraft(
    memory.binding,
    "terms",
    saved.value.draftVersionId,
    2,
    context(OWNER, "terms-approve-boundary-v2"),
  );

  const publishKey = "terms-publish-pointer-race";
  const stalePublication = injectBeforeBatch(memory.binding, () => {
    memory.database.exec(
      "UPDATE legal_documents SET approved_version_id = NULL WHERE id = 'terms'",
    );
  });
  await runtimeCode(
    write.publishLegalDocument(
      stalePublication,
      "terms",
      saved.value.draftVersionId,
      3,
      context(OWNER, publishKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    await read.readPublishedLegalDocument(memory.binding, "terms"),
    null,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `legal-document.publish:${OWNER}:${publishKey}`,
    ),
    0,
  );
});

test("private legal workspace repeats owner authority at its final read barrier", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const boundary = injectBeforeSqlExecution(
    memory.binding,
    "SELECT 1 AS allowed WHERE",
    () => {
      memory.database.exec(`
        UPDATE role_assignments
        SET revoked_at = '2026-07-19T13:00:00.000Z',
            revoked_by_user_id = '${OWNER}'
        WHERE user_id = '${OWNER}' AND role_key = 'owner'
          AND revoked_at IS NULL;
      `);
    },
  );
  await runtimeCode(
    read.readLegalAdminWorkspace(boundary, OWNER),
    "LEGAL_OWNER_REQUIRED",
  );
});
