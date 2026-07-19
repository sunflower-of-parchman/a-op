import { RuntimeError } from "@/lib/runtime/index.ts";
import type {
  ContactFormConfigurationInput,
  ContactNoteInput,
  ContactSubmissionInput,
  ContactSubmissionStateInput,
} from "./types.ts";

const SAFE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMISSION_STATES = new Set([
  "new",
  "in_progress",
  "resolved",
  "archived",
]);

function invalid(message: string): never {
  throw new RuntimeError("CONTACT_INPUT_INVALID", message, {
    status: 400,
    publicMessage: "Review the contact information and try again.",
  });
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    invalid(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  if (
    Object.keys(value).length !== expected.size ||
    Object.keys(value).some((key) => !expected.has(key))
  ) {
    invalid(`${label} contains unsupported fields.`);
  }
}

function text(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") invalid(`${label} must be text.`);
  const normalized = (value as string).replace(/\r\n?/g, "\n").trim();
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  ) {
    invalid(`${label} has an invalid length or control character.`);
  }
  return normalized;
}

function safeKey(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_KEY.test(value)) {
    invalid(`${label} must be a normalized key.`);
  }
  return value as string;
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    invalid(`${label} must be a safe identifier.`);
  }
  return value as string;
}

function positiveRevision(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    invalid(`${label} must be a positive revision.`);
  }
  return value as number;
}

function categories(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    invalid("Contact categories must contain between one and twelve values.");
  }
  const normalized = value.map((item) => text(item, "Contact category", 1, 80));
  if (
    new Set(normalized.map((item) => item.toLocaleLowerCase("en-US"))).size !==
    normalized.length
  ) {
    invalid("Contact categories must be unique.");
  }
  return Object.freeze(normalized);
}

export function validateContactFormConfiguration(
  value: unknown,
): ContactFormConfigurationInput {
  const input = plainObject(value, "Contact-form configuration");
  exactKeys(
    input,
    [
      "formKey",
      "title",
      "description",
      "bookingInformation",
      "publicContactDetails",
      "categories",
      "consentText",
      "state",
      "expectedRevision",
    ],
    "Contact-form configuration",
  );
  if (input.state !== "active" && input.state !== "disabled") {
    invalid("Contact-form state is invalid.");
  }
  const expectedRevision =
    input.expectedRevision === null
      ? null
      : positiveRevision(input.expectedRevision, "Expected revision");
  return Object.freeze({
    formKey: safeKey(input.formKey, "Form key"),
    title: text(input.title, "Contact title", 1, 160),
    description: text(input.description, "Contact description", 0, 1000),
    bookingInformation: text(
      input.bookingInformation,
      "Booking information",
      0,
      4000,
    ),
    publicContactDetails: text(
      input.publicContactDetails,
      "Public contact details",
      0,
      4000,
    ),
    categories: categories(input.categories),
    consentText: text(input.consentText, "Consent text", 1, 2000),
    state: input.state,
    expectedRevision,
  });
}

export function validateContactSubmission(
  value: unknown,
): ContactSubmissionInput {
  const input = plainObject(value, "Contact submission");
  exactKeys(
    input,
    [
      "formKey",
      "consentVersionId",
      "consentAccepted",
      "name",
      "email",
      "category",
      "subject",
      "message",
    ],
    "Contact submission",
  );
  if (input.consentAccepted !== true) {
    invalid("The current contact consent must be accepted.");
  }
  const email = text(input.email, "Email", 3, 320).toLocaleLowerCase("en-US");
  if (!EMAIL.test(email)) invalid("Email is invalid.");
  return Object.freeze({
    formKey: safeKey(input.formKey, "Form key"),
    consentVersionId: safeId(input.consentVersionId, "Consent version"),
    consentAccepted: true,
    name: text(input.name, "Name", 1, 160),
    email,
    category: text(input.category, "Category", 1, 80),
    subject: text(input.subject, "Subject", 1, 240),
    message: text(input.message, "Message", 1, 12_000),
  });
}

export function validateContactSubmissionState(
  value: unknown,
): ContactSubmissionStateInput {
  const input = plainObject(value, "Contact submission state");
  exactKeys(input, ["state", "expectedRevision"], "Contact submission state");
  if (typeof input.state !== "string" || !SUBMISSION_STATES.has(input.state)) {
    invalid("Contact submission state is invalid.");
  }
  return Object.freeze({
    state: input.state as ContactSubmissionStateInput["state"],
    expectedRevision: positiveRevision(
      input.expectedRevision,
      "Expected revision",
    ),
  });
}

export function validateContactNote(value: unknown): ContactNoteInput {
  const input = plainObject(value, "Contact note");
  exactKeys(input, ["body"], "Contact note");
  return Object.freeze({ body: text(input.body, "Contact note", 1, 4000) });
}

export function requireContactId(value: unknown, label: string): string {
  return safeId(value, label);
}
