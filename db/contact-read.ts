import type {
  ContactAdminWorkspaceDTO,
  ContactConsentDTO,
  ContactFormAdminDTO,
  ContactNoteDTO,
  ContactSubmissionAdminDTO,
  PublicContactFormDTO,
} from "@/lib/contact/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { activeOwnerCondition } from "./authority-guards.ts";

interface ContactFormRow {
  id: unknown;
  form_key: unknown;
  title: unknown;
  description: unknown;
  booking_information: unknown;
  public_contact_details: unknown;
  categories_json: unknown;
  state: unknown;
  delivery_adapter: unknown;
  revision: unknown;
  consent_id: unknown;
  consent_version: unknown;
  consent_text: unknown;
  consent_effective_at: unknown;
}

interface ConsentRow {
  id: unknown;
  version: unknown;
  consent_text: unknown;
  effective_at: unknown;
}

interface SubmissionRow {
  id: unknown;
  name: unknown;
  email: unknown;
  category: unknown;
  subject: unknown;
  message: unknown;
  state: unknown;
  consented_at: unknown;
  submitter_user_id: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
  consent_id: unknown;
  consent_version: unknown;
  consent_text: unknown;
  consent_effective_at: unknown;
}

interface NoteRow {
  id: unknown;
  contact_submission_id: unknown;
  author_user_id: unknown;
  body: unknown;
  created_at: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function integrity(message: string): never {
  throw new RuntimeError("CONTACT_INTEGRITY_INVALID", message, {
    status: 500,
    publicMessage: "The saved contact state could not be read safely.",
  });
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as string;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function key(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_KEY.test(value)) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as string;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || /[\u0000\u007f]/.test(value)) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as string;
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !Number.isFinite(Date.parse(value))
  ) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as string;
}

function categories(value: unknown): readonly string[] {
  if (typeof value !== "string") integrity("D1 returned invalid categories.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity("D1 returned invalid categories JSON.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > 12 ||
    !parsed.every(
      (item) =>
        typeof item === "string" &&
        item.trim() === item &&
        item.length >= 1 &&
        item.length <= 80,
    )
  ) {
    integrity("D1 returned invalid contact categories.");
  }
  return Object.freeze([...(parsed as string[])]);
}

function consent(row: {
  consent_id: unknown;
  consent_version: unknown;
  consent_text: unknown;
  consent_effective_at: unknown;
}): ContactConsentDTO {
  return Object.freeze({
    id: id(row.consent_id, "consent ID"),
    version: positive(row.consent_version, "consent version"),
    text: text(row.consent_text, "consent text"),
    effectiveAt: timestamp(row.consent_effective_at, "consent effective time"),
  });
}

function mapPublicForm(row: ContactFormRow): PublicContactFormDTO {
  if (row.delivery_adapter !== "stored_only") {
    integrity("D1 returned an unsupported contact delivery adapter.");
  }
  return Object.freeze({
    id: id(row.id, "contact form ID"),
    formKey: key(row.form_key, "contact form key"),
    title: text(row.title, "contact title"),
    description: text(row.description, "contact description"),
    bookingInformation: text(row.booking_information, "booking information"),
    publicContactDetails: text(
      row.public_contact_details,
      "public contact details",
    ),
    categories: categories(row.categories_json),
    consent: consent(row),
    revision: positive(row.revision, "contact form revision"),
    deliveryAdapter: "stored_only",
  });
}

function formQuery(
  publicOnly: boolean,
  authoritySql: string | null = null,
): string {
  return `SELECT form.id, form.form_key, form.title, form.description,
                 form.booking_information, form.public_contact_details,
                 form.categories_json, form.state, form.delivery_adapter,
                 form.revision, consent.id AS consent_id,
                 consent.version AS consent_version,
                 consent.consent_text AS consent_text,
                 consent.effective_at AS consent_effective_at
          FROM contact_forms AS form
          JOIN contact_consent_versions AS consent
            ON consent.contact_form_id = form.id
           AND consent.version = form.current_consent_version
          WHERE form.form_key = ?
            ${publicOnly ? "AND form.state = 'active'" : ""}
            AND EXISTS (
              SELECT 1 FROM artist_modules
              WHERE module_key = 'contact' AND active = 1
            )
            ${authoritySql === null ? "" : `AND ${authoritySql}`}
          LIMIT 1`;
}

function activeContactModuleCondition(): string {
  return `EXISTS (
    SELECT 1 FROM artist_modules
    WHERE module_key = 'contact' AND active = 1
  )`;
}

export async function readPublicContactForm(
  binding: D1Database,
  formKey = "contact",
): Promise<PublicContactFormDTO | null> {
  if (!SAFE_KEY.test(formKey)) return null;
  const row = await binding
    .prepare(formQuery(true))
    .bind(formKey)
    .first<ContactFormRow>();
  return row ? mapPublicForm(row) : null;
}

async function requireOwner(
  binding: D1Database,
  ownerUserId: string,
): Promise<void> {
  const owner = activeOwnerCondition(ownerUserId);
  const row = await binding
    .prepare(
      `SELECT 1 AS allowed
       WHERE ${owner.sql}
         AND EXISTS (
           SELECT 1 FROM artist_modules
           WHERE module_key = 'contact' AND active = 1
         )`,
    )
    .bind(...owner.bindings)
    .first<{ allowed: number }>();
  if (row?.allowed !== 1) {
    throw new RuntimeError(
      "CONTACT_OWNER_REQUIRED",
      "Contact administration requires live owner authority and an active module.",
      { status: 403, publicMessage: "Owner access is required." },
    );
  }
}

function mapConsentRow(row: ConsentRow): ContactConsentDTO {
  return consent({
    consent_id: row.id,
    consent_version: row.version,
    consent_text: row.consent_text,
    consent_effective_at: row.effective_at,
  });
}

function submissionState(value: unknown): ContactSubmissionAdminDTO["state"] {
  if (
    value !== "new" &&
    value !== "in_progress" &&
    value !== "resolved" &&
    value !== "archived"
  ) {
    integrity("D1 returned an invalid contact submission state.");
  }
  return value;
}

export async function readContactAdminWorkspace(
  binding: D1Database,
  ownerUserId: string,
  formKey = "contact",
): Promise<ContactAdminWorkspaceDTO> {
  await requireOwner(binding, ownerUserId);
  if (!SAFE_KEY.test(formKey)) integrity("An invalid form key was requested.");
  const owner = activeOwnerCondition(ownerUserId);
  const moduleActive = activeContactModuleCondition();
  const formRow = await binding
    .prepare(formQuery(false, owner.sql))
    .bind(formKey, ...owner.bindings)
    .first<ContactFormRow>();
  if (!formRow) {
    await requireOwner(binding, ownerUserId);
    return Object.freeze({ form: null, submissions: Object.freeze([]) });
  }

  const formId = id(formRow.id, "contact form ID");
  const [consentRows, submissionRows, noteRows] = await Promise.all([
    binding
      .prepare(
        `SELECT id, version, consent_text, effective_at
         FROM contact_consent_versions
         WHERE contact_form_id = ?
           AND ${moduleActive}
           AND ${owner.sql}
         ORDER BY version DESC`,
      )
      .bind(formId, ...owner.bindings)
      .all<ConsentRow>(),
    binding
      .prepare(
        `SELECT submission.id, submission.name, submission.email,
                submission.category, submission.subject, submission.message,
                submission.state, submission.consented_at,
                submission.submitter_user_id, submission.revision,
                submission.created_at, submission.updated_at,
                consent.id AS consent_id,
                consent.version AS consent_version,
                consent.consent_text AS consent_text,
                consent.effective_at AS consent_effective_at
         FROM contact_submissions AS submission
         JOIN contact_consent_versions AS consent
           ON consent.id = submission.consent_version_id
          AND consent.contact_form_id = submission.contact_form_id
         WHERE submission.contact_form_id = ?
           AND ${moduleActive}
           AND ${owner.sql}
         ORDER BY submission.created_at DESC, submission.id DESC`,
      )
      .bind(formId, ...owner.bindings)
      .all<SubmissionRow>(),
    binding
      .prepare(
        `SELECT note.id, note.contact_submission_id, note.author_user_id,
                note.body, note.created_at
         FROM contact_notes AS note
         JOIN contact_submissions AS submission
           ON submission.id = note.contact_submission_id
         WHERE submission.contact_form_id = ?
           AND ${moduleActive}
           AND ${owner.sql}
         ORDER BY note.created_at, note.id`,
      )
      .bind(formId, ...owner.bindings)
      .all<NoteRow>(),
  ]);

  // The PII-bearing reads above each repeat live owner and module authority.
  // This final barrier prevents a partial workspace from escaping if authority
  // changes between those independent D1 reads.
  await requireOwner(binding, ownerUserId);

  const notes = new Map<string, ContactNoteDTO[]>();
  for (const row of noteRows.results ?? []) {
    const submissionId = id(row.contact_submission_id, "note submission ID");
    const list = notes.get(submissionId) ?? [];
    list.push(
      Object.freeze({
        id: id(row.id, "contact note ID"),
        authorUserId: id(row.author_user_id, "contact note author ID"),
        body: text(row.body, "contact note body"),
        createdAt: timestamp(row.created_at, "contact note time"),
      }),
    );
    notes.set(submissionId, list);
  }

  const submissions = (submissionRows.results ?? []).map((row) => {
    const submissionId = id(row.id, "contact submission ID");
    return Object.freeze({
      id: submissionId,
      name: text(row.name, "contact name"),
      email: text(row.email, "contact email"),
      category: text(row.category, "contact category"),
      subject: text(row.subject, "contact subject"),
      message: text(row.message, "contact message"),
      state: submissionState(row.state),
      consent: consent(row),
      consentedAt: timestamp(row.consented_at, "contact consent time"),
      submitterUserId: nullableId(row.submitter_user_id, "submitter ID"),
      revision: positive(row.revision, "contact submission revision"),
      createdAt: timestamp(row.created_at, "contact submission time"),
      updatedAt: timestamp(row.updated_at, "contact submission update time"),
      notes: Object.freeze(notes.get(submissionId) ?? []),
    });
  });

  const publicForm = mapPublicForm(formRow);
  const state = formRow.state;
  if (state !== "active" && state !== "disabled") {
    integrity("D1 returned an invalid contact form state.");
  }
  const form: ContactFormAdminDTO = Object.freeze({
    ...publicForm,
    state,
    consentHistory: Object.freeze(
      (consentRows.results ?? []).map(mapConsentRow),
    ),
  });
  return Object.freeze({ form, submissions: Object.freeze(submissions) });
}
