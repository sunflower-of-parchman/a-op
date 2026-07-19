import {
  CONTENT_SECTION_KINDS,
  type ContentSectionDraftInput,
  type ContentSectionKind,
} from "./types.ts";

export interface ContentSectionValidationIssue {
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

export type ContentSectionValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly ContentSectionValidationIssue[];
    };

const SECTION_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECTION_KINDS = new Set<ContentSectionKind>(CONTENT_SECTION_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function text(
  value: unknown,
  field: string,
  maximum: number,
  issues: ContentSectionValidationIssue[],
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") {
    issues.push({
      code: "content-section-text-required",
      field,
      message: `${field} must be text.`,
    });
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!allowEmpty && normalized.length === 0) {
    issues.push({
      code: "content-section-text-required",
      field,
      message: `${field} is required.`,
    });
    return null;
  }
  if (normalized.length > maximum) {
    issues.push({
      code: "content-section-text-too-long",
      field,
      message: `${field} must contain at most ${maximum} characters.`,
    });
    return null;
  }
  return normalized;
}

export function validateContentSectionKey(
  value: unknown,
): ContentSectionValidationResult<string> {
  const issues: ContentSectionValidationIssue[] = [];
  const sectionKey = text(value, "sectionKey", 80, issues);
  if (
    sectionKey !== null &&
    (!SECTION_KEY.test(sectionKey) || sectionKey === "new")
  ) {
    issues.push({
      code: "content-section-key-invalid",
      field: "sectionKey",
      message:
        "Section key must be a normalized route segment and cannot be new.",
    });
  }
  return issues.length > 0 || sectionKey === null
    ? { ok: false, issues: Object.freeze(issues) }
    : { ok: true, value: sectionKey };
}

export function validateContentSectionDraftInput(
  value: unknown,
): ContentSectionValidationResult<ContentSectionDraftInput> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["sectionKey", "kind", "heading", "bodyText"])
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "content-section-input-invalid",
          field: "section",
          message: "Content section must contain only the supported fields.",
        },
      ],
    };
  }

  const issues: ContentSectionValidationIssue[] = [];
  const keyResult = validateContentSectionKey(value.sectionKey);
  if (!keyResult.ok) issues.push(...keyResult.issues);
  const kind =
    typeof value.kind === "string" &&
    SECTION_KINDS.has(value.kind as ContentSectionKind)
      ? (value.kind as ContentSectionKind)
      : null;
  if (kind === null) {
    issues.push({
      code: "content-section-kind-invalid",
      field: "kind",
      message: "Section kind must be prose, quote, or callout.",
    });
  }
  const heading = text(value.heading, "heading", 160, issues, true);
  const bodyText = text(value.bodyText, "bodyText", 20_000, issues);
  if (
    issues.length > 0 ||
    !keyResult.ok ||
    kind === null ||
    heading === null ||
    bodyText === null
  ) {
    return { ok: false, issues: Object.freeze(issues) };
  }
  return {
    ok: true,
    value: Object.freeze({
      sectionKey: keyResult.value,
      kind,
      heading,
      bodyText,
    }),
  };
}
