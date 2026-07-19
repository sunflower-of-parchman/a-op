import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { readContactAdminWorkspace, readPublicContactForm } =
  await import("../db/contact-read.ts");
const {
  addContactSubmissionNote,
  changeContactSubmissionState,
  configureContactForm,
  submitContactInquiry,
} = await import("../db/contact-write.ts");

const OWNER = "user_contact_owner";

let requestSequence = 0;
function ownerContext(idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId: OWNER,
    idempotencyKey,
    requestId: `request_contact_owner_${requestSequence}`,
  };
}

function publicContext(idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId: null,
    idempotencyKey,
    requestId: `request_contact_public_${requestSequence}`,
  };
}

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    UPDATE artist_modules SET active = 1 WHERE module_key = 'contact';
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${OWNER}', 'contact-owner@example.invalid',
            'contact-owner@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('role_contact_owner', '${OWNER}', 'owner', '${OWNER}');
  `);
  return memory;
}

function formInput(overrides = {}) {
  return {
    formKey: "contact",
    title: "Contact the artist",
    description: "Send a direct inquiry stored in this installation.",
    bookingInformation:
      "Booking inquiries can include venue, date, and technical details.",
    publicContactDetails: "Public contact: artist@example.invalid",
    categories: ["General", "Licensing"],
    consentText: "I agree that the artist may use this information to respond.",
    state: "active",
    expectedRevision: null,
    ...overrides,
  };
}

function submissionInput(consentVersionId, overrides = {}) {
  return {
    formKey: "contact",
    consentVersionId,
    consentAccepted: true,
    name: "Fictional Listener",
    email: "listener@example.invalid",
    category: "General",
    subject: "A fictional inquiry",
    message: "This is fictional contact-form test content.",
    ...overrides,
  };
}

async function assertRuntimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("contact configuration freezes consent and submission replay stores one redacted inquiry", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  const configured = await configureContactForm(
    memory.binding,
    formInput(),
    ownerContext("contact.form.create"),
    new Date("2026-07-19T08:20:00.000Z"),
  );
  assert.equal(configured.replayed, false);
  assert.equal(configured.value.revision, 1);
  assert.equal(configured.value.consentVersion, 1);
  assert.equal(configured.value.deliveryAdapter, "stored_only");

  const publicForm = await readPublicContactForm(memory.binding);
  assert.equal(publicForm?.consent.id, configured.value.consentVersionId);
  assert.deepEqual(publicForm?.categories, ["General", "Licensing"]);
  assert.match(publicForm?.bookingInformation ?? "", /venue, date/);
  assert.equal(
    publicForm?.publicContactDetails,
    "Public contact: artist@example.invalid",
  );

  const input = submissionInput(configured.value.consentVersionId);
  const first = await submitContactInquiry(
    memory.binding,
    input,
    publicContext("contact.submit.same-operation"),
    new Date("2026-07-19T08:21:00.000Z"),
  );
  const replay = await submitContactInquiry(
    memory.binding,
    input,
    publicContext("contact.submit.same-operation"),
    new Date("2026-07-19T08:22:00.000Z"),
  );
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, first.value);
  assert.equal(first.value.consentVersion, 1);
  assert.equal(first.value.deliveryAdapter, "stored_only");
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM contact_submissions"),
    1,
  );

  const stored = memory.database
    .prepare(
      `SELECT consent_version_id, consented_at, state, request_id,
              normalized_email
       FROM contact_submissions WHERE id = ?`,
    )
    .get(first.value.submissionId);
  assert.deepEqual(
    {
      ...stored,
      request_id:
        typeof stored?.request_id === "string" &&
        stored.request_id.startsWith("request_contact_public_")
          ? "public-request"
          : stored?.request_id,
    },
    {
      consent_version_id: configured.value.consentVersionId,
      consented_at: "2026-07-19T08:21:00.000Z",
      state: "new",
      request_id: "public-request",
      normalized_email: "listener@example.invalid",
    },
  );

  const auditJson = memory.database
    .prepare(
      `SELECT details_json, result_json FROM audit_events
       WHERE action = 'contact.submission.create'`,
    )
    .get();
  const redactedAudit = JSON.stringify(auditJson);
  assert.doesNotMatch(redactedAudit, /Fictional Listener/);
  assert.doesNotMatch(redactedAudit, /listener@example\.invalid/);
  assert.doesNotMatch(redactedAudit, /fictional contact-form test content/i);
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("new consent remains exact in history and owner state and notes appear in administration", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  const initial = await configureContactForm(
    memory.binding,
    formInput(),
    ownerContext("contact.form.initial"),
    new Date("2026-07-19T09:00:00.000Z"),
  );
  const firstSubmission = await submitContactInquiry(
    memory.binding,
    submissionInput(initial.value.consentVersionId),
    publicContext("contact.submit.first"),
    new Date("2026-07-19T09:01:00.000Z"),
  );

  const revised = await configureContactForm(
    memory.binding,
    formInput({
      expectedRevision: 1,
      consentText:
        "I agree that the artist may store this information and respond directly.",
    }),
    ownerContext("contact.form.revise-consent"),
    new Date("2026-07-19T09:02:00.000Z"),
  );
  assert.equal(revised.value.revision, 2);
  assert.equal(revised.value.consentVersion, 2);
  assert.notEqual(
    revised.value.consentVersionId,
    initial.value.consentVersionId,
  );

  await assertRuntimeCode(
    submitContactInquiry(
      memory.binding,
      submissionInput(initial.value.consentVersionId),
      publicContext("contact.submit.stale-consent"),
      new Date("2026-07-19T09:03:00.000Z"),
    ),
    "CONTACT_FORM_CHANGED",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM contact_submissions"),
    1,
  );

  const state = await changeContactSubmissionState(
    memory.binding,
    firstSubmission.value.submissionId,
    { state: "in_progress", expectedRevision: 1 },
    ownerContext("contact.submission.in-progress"),
    new Date("2026-07-19T09:04:00.000Z"),
  );
  assert.deepEqual(state.value, {
    submissionId: firstSubmission.value.submissionId,
    state: "in_progress",
    revision: 2,
  });
  const note = await addContactSubmissionNote(
    memory.binding,
    firstSubmission.value.submissionId,
    { body: "Follow up through the artist-approved response workflow." },
    ownerContext("contact.submission.note"),
    new Date("2026-07-19T09:05:00.000Z"),
  );
  assert.match(note.value.noteId, /^contact_note_/);

  const workspace = await readContactAdminWorkspace(memory.binding, OWNER);
  assert.equal(workspace.form?.consent.version, 2);
  assert.deepEqual(
    workspace.form?.consentHistory.map(({ version }) => version),
    [2, 1],
  );
  assert.equal(workspace.submissions.length, 1);
  assert.equal(workspace.submissions[0].consent.version, 1);
  assert.equal(workspace.submissions[0].state, "in_progress");
  assert.equal(workspace.submissions[0].notes.length, 1);
  assert.equal(workspace.submissions[0].notes[0].id, note.value.noteId);

  await configureContactForm(
    memory.binding,
    formInput({
      expectedRevision: 2,
      state: "disabled",
      consentText:
        "I agree that the artist may store this information and respond directly.",
    }),
    ownerContext("contact.form.disable"),
    new Date("2026-07-19T09:06:00.000Z"),
  );
  assert.equal(await readPublicContactForm(memory.binding), null);
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("inactive module and invalid category create no contact state", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const configured = await configureContactForm(
    memory.binding,
    formInput(),
    ownerContext("contact.form.boundary"),
    new Date("2026-07-19T10:00:00.000Z"),
  );

  await assertRuntimeCode(
    submitContactInquiry(
      memory.binding,
      submissionInput(configured.value.consentVersionId, {
        category: "Unsupported",
      }),
      publicContext("contact.submit.bad-category"),
    ),
    "CONTACT_FORM_CHANGED",
  );
  memory.database.exec(
    "UPDATE artist_modules SET active = 0 WHERE module_key = 'contact'",
  );
  await assertRuntimeCode(
    submitContactInquiry(
      memory.binding,
      submissionInput(configured.value.consentVersionId),
      publicContext("contact.submit.inactive-module"),
    ),
    "CONTACT_FORM_CHANGED",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM contact_submissions"),
    0,
  );
});

test("contact administration repeats live owner authority on every PII read", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const configured = await configureContactForm(
    memory.binding,
    formInput(),
    ownerContext("contact.form.private-read"),
    new Date("2026-07-19T10:10:00.000Z"),
  );
  await submitContactInquiry(
    memory.binding,
    submissionInput(configured.value.consentVersionId),
    publicContext("contact.submit.private-read"),
    new Date("2026-07-19T10:11:00.000Z"),
  );

  let revokedAtBoundary = false;
  const boundaryBinding = {
    prepare(sql) {
      const statement = memory.binding.prepare(sql);
      if (
        sql.includes("FROM contact_forms AS form") &&
        sql.includes("role_assignments")
      ) {
        return {
          bind(...values) {
            const bound = statement.bind(...values);
            return {
              async first() {
                const row = await bound.first();
                memory.database.exec(`
                  UPDATE role_assignments
                  SET revoked_at = '2026-07-19T10:11:30.000Z',
                      revoked_by_user_id = '${OWNER}'
                  WHERE user_id = '${OWNER}' AND role_key = 'owner'
                    AND revoked_at IS NULL;
                `);
                revokedAtBoundary = true;
                return row;
              },
            };
          },
        };
      }
      return statement;
    },
    batch(statements) {
      return memory.binding.batch(statements);
    },
  };

  await assertRuntimeCode(
    readContactAdminWorkspace(boundaryBinding, OWNER),
    "CONTACT_OWNER_REQUIRED",
  );
  assert.equal(revokedAtBoundary, true);

  await assertRuntimeCode(
    readContactAdminWorkspace(memory.binding, OWNER),
    "CONTACT_OWNER_REQUIRED",
  );
});
