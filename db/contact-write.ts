import type {
  ContactFormConfigurationInput,
  ContactFormConfigurationReceipt,
  ContactNoteInput,
  ContactNoteReceipt,
  ContactSubmissionInput,
  ContactSubmissionReceipt,
  ContactSubmissionStateInput,
  ContactSubmissionStateReceipt,
} from "@/lib/contact/index.ts";
import {
  validateContactFormConfiguration,
  validateContactNote,
  validateContactSubmission,
  validateContactSubmissionState,
} from "@/lib/contact/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import type { TelemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeApplicationIdentityCondition,
  activeOwnerCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import { prepareServerTelemetryEvent } from "./telemetry-server.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";

interface ContactFormWriteRow {
  id: string;
  form_key: string;
  title: string;
  description: string;
  booking_information: string;
  public_contact_details: string;
  categories_json: string;
  state: "active" | "disabled";
  current_consent_version: number;
  revision: number;
  consent_id: string;
  consent_text: string;
}

interface ContactSubmissionStateRow {
  id: string;
  state: ContactSubmissionStateReceipt["state"];
  revision: number;
}

export interface ContactSubmissionContext {
  readonly actorUserId: string | null;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly telemetry?: TelemetryMutationRequestContext;
}

const MODULE_ACTIVE_SQL = `EXISTS (
  SELECT 1 FROM artist_modules
  WHERE module_key = 'contact' AND active = 1
)`;
const ALLOWED_TRANSITIONS = Object.freeze({
  new: Object.freeze(["in_progress", "resolved", "archived"] as const),
  in_progress: Object.freeze(["resolved", "archived"] as const),
  resolved: Object.freeze(["in_progress", "archived"] as const),
  archived: Object.freeze([] as const),
}) satisfies Readonly<
  Record<
    ContactSubmissionStateReceipt["state"],
    readonly ContactSubmissionStateReceipt["state"][]
  >
>;

function operationTime(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new RuntimeError(
      "CONTACT_TIME_INVALID",
      "Contact operation time is invalid.",
      { status: 400, publicMessage: "The contact operation time is invalid." },
    );
  }
  return value.toISOString();
}

async function readFormForWrite(
  binding: D1Database,
  formKey: string,
): Promise<ContactFormWriteRow | null> {
  return binding
    .prepare(
      `SELECT form.id, form.form_key, form.title, form.description,
              form.booking_information, form.public_contact_details,
              form.categories_json, form.state,
              form.current_consent_version, form.revision,
              consent.id AS consent_id, consent.consent_text
       FROM contact_forms AS form
       JOIN contact_consent_versions AS consent
         ON consent.contact_form_id = form.id
        AND consent.version = form.current_consent_version
       WHERE form.form_key = ?
       LIMIT 1`,
    )
    .bind(formKey)
    .first<ContactFormWriteRow>();
}

function ownerModuleCondition(actorUserId: string): {
  readonly sql: string;
  readonly bindings: readonly string[];
} {
  const owner = activeOwnerCondition(actorUserId);
  return {
    sql: `${owner.sql} AND ${MODULE_ACTIVE_SQL}`,
    bindings: owner.bindings,
  };
}

function anonymousMutationContext(
  context: ContactSubmissionContext,
): MutationContext {
  return {
    actorUserId: context.actorUserId ?? "public-contact",
    idempotencyKey: context.idempotencyKey,
    requestId: context.requestId,
  };
}

export async function configureContactForm(
  binding: D1Database,
  unsafeInput: unknown,
  context: MutationContext,
  at = new Date(),
): Promise<MutationResult<ContactFormConfigurationReceipt>> {
  const input: ContactFormConfigurationInput =
    validateContactFormConfiguration(unsafeInput);
  const timestamp = operationTime(at);
  const operation = "contact.form.configure";
  const mutation = await prepareMutation<ContactFormConfigurationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const current = await readFormForWrite(binding, input.formKey);
  if (!current && input.expectedRevision !== null) {
    throw staleMutation("contact form");
  }
  if (current && current.revision !== input.expectedRevision) {
    throw staleMutation("contact form");
  }

  const created = current === null;
  const formId = current?.id ?? `contact_form_${crypto.randomUUID()}`;
  const consentChanged = !current || current.consent_text !== input.consentText;
  const consentVersion = current
    ? current.current_consent_version + (consentChanged ? 1 : 0)
    : 1;
  const consentVersionId = consentChanged
    ? `contact_consent_${crypto.randomUUID()}`
    : current!.consent_id;
  const revision = current ? current.revision + 1 : 1;
  const result: ContactFormConfigurationReceipt = Object.freeze({
    formId,
    formKey: input.formKey,
    state: input.state,
    revision,
    consentVersionId,
    consentVersion,
    deliveryAdapter: "stored_only",
  });
  const authority = ownerModuleCondition(context.actorUserId);
  const categoriesJson = JSON.stringify(input.categories);

  const statements: D1PreparedStatement[] = [];
  let formChangeIndex: number;
  if (created) {
    formChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `INSERT INTO contact_forms
            (id, form_key, title, description, booking_information,
             public_contact_details, categories_json, state,
             current_consent_version, delivery_adapter, revision,
             last_operation_key, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, 'stored_only', 1, ?, ?, ?
           WHERE ${authority.sql}
             AND NOT EXISTS (
               SELECT 1 FROM contact_forms WHERE form_key = ?
             )`,
        )
        .bind(
          formId,
          input.formKey,
          input.title,
          input.description,
          input.bookingInformation,
          input.publicContactDetails,
          categoriesJson,
          input.state,
          mutation.namespacedKey,
          timestamp,
          timestamp,
          ...authority.bindings,
          input.formKey,
        ),
    );
    statements.push(
      binding
        .prepare(
          `INSERT INTO contact_consent_versions
            (id, contact_form_id, version, consent_text,
             approved_by_user_id, effective_at, created_at)
           SELECT ?, form.id, 1, ?, ?, ?, ?
           FROM contact_forms AS form
           WHERE form.id = ?
             AND form.last_operation_key = ?
             AND ${authority.sql}`,
        )
        .bind(
          consentVersionId,
          input.consentText,
          context.actorUserId,
          timestamp,
          timestamp,
          formId,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    );
  } else {
    if (consentChanged) {
      statements.push(
        binding
          .prepare(
            `INSERT INTO contact_consent_versions
              (id, contact_form_id, version, consent_text,
               approved_by_user_id, effective_at, created_at)
             SELECT ?, form.id, ?, ?, ?, ?, ?
             FROM contact_forms AS form
             WHERE form.id = ?
               AND form.form_key = ?
               AND form.revision = ?
               AND ${authority.sql}`,
          )
          .bind(
            consentVersionId,
            consentVersion,
            input.consentText,
            context.actorUserId,
            timestamp,
            timestamp,
            formId,
            input.formKey,
            input.expectedRevision,
            ...authority.bindings,
          ),
      );
    }
    formChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `UPDATE contact_forms
           SET title = ?, description = ?, booking_information = ?,
               public_contact_details = ?, categories_json = ?, state = ?,
               current_consent_version = ?, revision = revision + 1,
               last_operation_key = ?, updated_at = ?
           WHERE id = ? AND form_key = ? AND revision = ?
             AND ${authority.sql}
             ${
               consentChanged
                 ? `AND EXISTS (
                      SELECT 1 FROM contact_consent_versions
                      WHERE id = ? AND contact_form_id = contact_forms.id
                        AND version = ?
                    )`
                 : ""
             }`,
        )
        .bind(
          input.title,
          input.description,
          input.bookingInformation,
          input.publicContactDetails,
          categoriesJson,
          input.state,
          consentVersion,
          mutation.namespacedKey,
          timestamp,
          formId,
          input.formKey,
          input.expectedRevision,
          ...authority.bindings,
          ...(consentChanged ? [consentVersionId, consentVersion] : []),
        ),
    );
  }

  const auditIndex = statements.length;
  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "contact-form",
        subjectId: formId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          formKey: input.formKey,
          categoryCount: input.categories.length,
          hasBookingInformation: input.bookingInformation.length > 0,
          hasPublicContactDetails: input.publicContactDetails.length > 0,
          consentVersion,
          deliveryAdapter: "stored_only",
        },
        result: { ...result },
      },
      `EXISTS (
         SELECT 1 FROM contact_forms AS form
         JOIN contact_consent_versions AS consent
           ON consent.contact_form_id = form.id
          AND consent.version = form.current_consent_version
         WHERE form.id = ? AND form.revision = ?
           AND form.last_operation_key = ? AND consent.id = ?
       ) AND ${authority.sql}`,
      [
        formId,
        revision,
        mutation.namespacedKey,
        consentVersionId,
        ...authority.bindings,
      ],
    ),
  );

  try {
    const batch = await runAtomicBatch(binding, statements);
    if (
      changedRows(batch[formChangeIndex]) !== 1 ||
      changedRows(batch[auditIndex]) !== 1
    ) {
      throw staleMutation("contact form");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function submitContactInquiry(
  binding: D1Database,
  unsafeInput: unknown,
  context: ContactSubmissionContext,
  at = new Date(),
): Promise<MutationResult<ContactSubmissionReceipt>> {
  const input: ContactSubmissionInput = validateContactSubmission(unsafeInput);
  const submittedAt = operationTime(at);
  const operation = "contact.submission.create";
  const mutationContext = anonymousMutationContext(context);
  const mutation = await prepareMutation<ContactSubmissionReceipt>(
    binding,
    operation,
    mutationContext,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const form = await binding
    .prepare(
      `SELECT form.id, form.current_consent_version,
              consent.version AS consent_version
       FROM contact_forms AS form
       JOIN contact_consent_versions AS consent
         ON consent.contact_form_id = form.id
        AND consent.version = form.current_consent_version
       WHERE form.form_key = ? AND form.state = 'active'
         AND consent.id = ?
         AND EXISTS (
           SELECT 1 FROM json_each(form.categories_json)
           WHERE value = ?
         )
         AND ${MODULE_ACTIVE_SQL}
       LIMIT 1`,
    )
    .bind(input.formKey, input.consentVersionId, input.category)
    .first<{ id: string; consent_version: number }>();
  if (!form) {
    throw new RuntimeError(
      "CONTACT_FORM_CHANGED",
      "The selected form, category, or consent version is no longer current.",
      {
        status: 409,
        publicMessage:
          "The contact form changed. Reload it before sending your message.",
      },
    );
  }

  const submissionId = `contact_submission_${crypto.randomUUID()}`;
  const result: ContactSubmissionReceipt = Object.freeze({
    submissionId,
    state: "new",
    category: input.category,
    consentVersion: form.consent_version,
    submittedAt,
    deliveryAdapter: "stored_only",
  });
  const identity = context.actorUserId
    ? activeApplicationIdentityCondition(context.actorUserId)
    : null;
  const identitySql = identity ? identity.sql : "1 = 1";
  const identityBindings = identity?.bindings ?? [];
  const insert = binding
    .prepare(
      `INSERT INTO contact_submissions
        (id, contact_form_id, consent_version_id, submitter_user_id,
         name, email, normalized_email, category, subject, message, state,
         request_id, consented_at, revision, last_operation_key,
         created_at, updated_at)
       SELECT ?, form.id, consent.id, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, 1, ?, ?, ?
       FROM contact_forms AS form
       JOIN contact_consent_versions AS consent
         ON consent.contact_form_id = form.id
        AND consent.version = form.current_consent_version
       WHERE form.id = ? AND form.form_key = ? AND form.state = 'active'
         AND consent.id = ?
         AND EXISTS (
           SELECT 1 FROM json_each(form.categories_json)
           WHERE value = ?
         )
         AND ${MODULE_ACTIVE_SQL}
         AND ${identitySql}`,
    )
    .bind(
      submissionId,
      context.actorUserId,
      input.name,
      input.email,
      input.email,
      input.category,
      input.subject,
      input.message,
      context.requestId,
      submittedAt,
      mutation.namespacedKey,
      submittedAt,
      submittedAt,
      form.id,
      input.formKey,
      input.consentVersionId,
      input.category,
      ...identityBindings,
    );
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "contact-submission",
      subjectId: submissionId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        formId: form.id,
        category: input.category,
        consentVersion: form.consent_version,
        deliveryAdapter: "stored_only",
      },
      result: { ...result },
    },
    `EXISTS (
       SELECT 1 FROM contact_submissions
       WHERE id = ? AND contact_form_id = ? AND consent_version_id = ?
         AND last_operation_key = ?
     )`,
    [submissionId, form.id, input.consentVersionId, mutation.namespacedKey],
  );
  const telemetry = await prepareServerTelemetryEvent(binding, {
    eventName: "contact-submitted",
    resourceType: "contact",
    resourceId: form.id,
    sourceOperationKey: mutation.namespacedKey,
    userId: context.actorUserId,
    requestContext: context.telemetry,
    occurredAt: new Date(submittedAt),
    durableCondition: {
      sql: `EXISTS (
        SELECT 1 FROM contact_submissions
        WHERE id = ? AND contact_form_id = ? AND consent_version_id = ?
          AND last_operation_key = ?
      )`,
      bindings: [
        submissionId,
        form.id,
        input.consentVersionId,
        mutation.namespacedKey,
      ],
    },
  });

  try {
    const batch = await runAtomicBatch(binding, [insert, audit, telemetry]);
    if (changedRows(batch[0]) !== 1 || changedRows(batch[1]) !== 1) {
      throw staleMutation("contact form");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function readSubmissionState(
  binding: D1Database,
  submissionId: string,
): Promise<ContactSubmissionStateRow | null> {
  return binding
    .prepare(
      `SELECT id, state, revision
       FROM contact_submissions
       WHERE id = ? LIMIT 1`,
    )
    .bind(submissionId)
    .first<ContactSubmissionStateRow>();
}

export async function changeContactSubmissionState(
  binding: D1Database,
  submissionId: string,
  unsafeInput: unknown,
  context: MutationContext,
  at = new Date(),
): Promise<MutationResult<ContactSubmissionStateReceipt>> {
  const input: ContactSubmissionStateInput =
    validateContactSubmissionState(unsafeInput);
  const timestamp = operationTime(at);
  const operation = "contact.submission.state";
  const mutation = await prepareMutation<ContactSubmissionStateReceipt>(
    binding,
    operation,
    context,
    { submissionId, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const current = await readSubmissionState(binding, submissionId);
  if (!current || current.revision !== input.expectedRevision) {
    throw staleMutation("contact submission");
  }
  const allowedTransitions = ALLOWED_TRANSITIONS[
    current.state
  ] as readonly ContactSubmissionStateReceipt["state"][];
  if (!allowedTransitions.includes(input.state)) {
    throw new RuntimeError(
      "CONTACT_STATE_INVALID",
      "The requested contact submission transition is invalid.",
      { status: 409, publicMessage: "That inquiry cannot make this change." },
    );
  }
  const result: ContactSubmissionStateReceipt = Object.freeze({
    submissionId,
    state: input.state,
    revision: current.revision + 1,
  });
  const authority = ownerModuleCondition(context.actorUserId);
  const update = binding
    .prepare(
      `UPDATE contact_submissions
       SET state = ?, revision = revision + 1,
           last_operation_key = ?, updated_at = ?
       WHERE id = ? AND state = ? AND revision = ?
         AND ${authority.sql}`,
    )
    .bind(
      input.state,
      mutation.namespacedKey,
      timestamp,
      submissionId,
      current.state,
      input.expectedRevision,
      ...authority.bindings,
    );
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "contact-submission",
      subjectId: submissionId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: { from: current.state, to: input.state },
      result: { ...result },
    },
    `EXISTS (
       SELECT 1 FROM contact_submissions
       WHERE id = ? AND state = ? AND revision = ?
         AND last_operation_key = ?
     ) AND ${authority.sql}`,
    [
      submissionId,
      input.state,
      result.revision,
      mutation.namespacedKey,
      ...authority.bindings,
    ],
  );
  try {
    const batch = await runAtomicBatch(binding, [update, audit]);
    if (changedRows(batch[0]) !== 1 || changedRows(batch[1]) !== 1) {
      throw staleMutation("contact submission");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function addContactSubmissionNote(
  binding: D1Database,
  submissionId: string,
  unsafeInput: unknown,
  context: MutationContext,
  at = new Date(),
): Promise<MutationResult<ContactNoteReceipt>> {
  const input: ContactNoteInput = validateContactNote(unsafeInput);
  const createdAt = operationTime(at);
  const operation = "contact.submission.note";
  const mutation = await prepareMutation<ContactNoteReceipt>(
    binding,
    operation,
    context,
    { submissionId, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const noteId = `contact_note_${crypto.randomUUID()}`;
  const result: ContactNoteReceipt = Object.freeze({
    submissionId,
    noteId,
    createdAt,
  });
  const authority = ownerModuleCondition(context.actorUserId);
  const insert = binding
    .prepare(
      `INSERT INTO contact_notes
        (id, contact_submission_id, author_user_id, body,
         last_operation_key, created_at)
       SELECT ?, submission.id, ?, ?, ?, ?
       FROM contact_submissions AS submission
       WHERE submission.id = ? AND ${authority.sql}`,
    )
    .bind(
      noteId,
      context.actorUserId,
      input.body,
      mutation.namespacedKey,
      createdAt,
      submissionId,
      ...authority.bindings,
    );
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "contact-submission",
      subjectId: submissionId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: { noteId },
      result: { ...result },
    },
    `EXISTS (
       SELECT 1 FROM contact_notes
       WHERE id = ? AND contact_submission_id = ?
         AND last_operation_key = ?
     ) AND ${authority.sql}`,
    [noteId, submissionId, mutation.namespacedKey, ...authority.bindings],
  );
  try {
    const batch = await runAtomicBatch(binding, [insert, audit]);
    if (changedRows(batch[0]) !== 1 || changedRows(batch[1]) !== 1) {
      throw new RuntimeError(
        "CONTACT_SUBMISSION_NOT_FOUND",
        "The contact submission was not available for a note.",
        { status: 404, publicMessage: "That inquiry was not found." },
      );
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
