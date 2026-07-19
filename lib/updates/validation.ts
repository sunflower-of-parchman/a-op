import type {
  EditorialDraftInput,
  StructuredTextBlock,
  StructuredTextBlockType,
  UpdateAudience,
  UpdateDraftInput,
  UpdateResourceInput,
  UpdateResourceType,
} from "./types.ts";

export interface PublishingValidationIssue {
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

export type PublishingValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly PublishingValidationIssue[];
    };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const BLOCK_TYPES = new Set<StructuredTextBlockType>([
  "heading",
  "paragraph",
  "quote",
]);
const RESOURCE_TYPES = new Set<UpdateResourceType>([
  "track",
  "release",
  "collection",
  "course",
  "video",
  "page",
  "license",
  "membership",
  "subscription",
  "order",
]);

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
  issues: PublishingValidationIssue[],
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") {
    issues.push({
      code: "publishing-text-required",
      field,
      message: `${field} must be text.`,
    });
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!allowEmpty && normalized.length === 0) {
    issues.push({
      code: "publishing-text-required",
      field,
      message: `${field} is required.`,
    });
    return null;
  }
  if (normalized.length > maximum) {
    issues.push({
      code: "publishing-text-too-long",
      field,
      message: `${field} must contain at most ${maximum} characters.`,
    });
    return null;
  }
  return normalized;
}

function slug(
  value: unknown,
  issues: PublishingValidationIssue[],
): string | null {
  const normalized = text(value, "slug", 80, issues);
  if (normalized !== null && !SLUG.test(normalized)) {
    issues.push({
      code: "publishing-slug-invalid",
      field: "slug",
      message: "Slug must be a normalized route segment.",
    });
  }
  return normalized;
}

function body(
  value: unknown,
  issues: PublishingValidationIssue[],
): readonly StructuredTextBlock[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    issues.push({
      code: "publishing-body-invalid",
      field: "body",
      message: "Body must contain between one and 128 structured text blocks.",
    });
    return [];
  }
  const blocks: StructuredTextBlock[] = [];
  value.forEach((candidate, index) => {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ["type", "text"])) {
      issues.push({
        code: "publishing-block-invalid",
        field: `body.${index}`,
        message: "Each body block must contain type and text.",
      });
      return;
    }
    const type =
      typeof candidate.type === "string" &&
      BLOCK_TYPES.has(candidate.type as StructuredTextBlockType)
        ? (candidate.type as StructuredTextBlockType)
        : null;
    if (type === null) {
      issues.push({
        code: "publishing-block-type-invalid",
        field: `body.${index}.type`,
        message: "Block type must be heading, paragraph, or quote.",
      });
    }
    const blockText = text(candidate.text, `body.${index}.text`, 8_000, issues);
    if (type !== null && blockText !== null) {
      blocks.push({ type, text: blockText });
    }
  });
  return Object.freeze(blocks);
}

function resource(
  value: unknown,
  issues: PublishingValidationIssue[],
): UpdateResourceInput | null {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactKeys(value, ["type", "id"])) {
    issues.push({
      code: "update-resource-invalid",
      field: "resource",
      message: "Linked resource must contain type and id, or be null.",
    });
    return null;
  }
  const type =
    typeof value.type === "string" &&
    RESOURCE_TYPES.has(value.type as UpdateResourceType)
      ? (value.type as UpdateResourceType)
      : null;
  if (type === null) {
    issues.push({
      code: "update-resource-type-invalid",
      field: "resource.type",
      message: "Linked resource type is not supported.",
    });
  }
  if (typeof value.id !== "string" || !SAFE_ID.test(value.id)) {
    issues.push({
      code: "update-resource-id-invalid",
      field: "resource.id",
      message: "Linked resource id must be a safe application identifier.",
    });
    return null;
  }
  return type === null ? null : Object.freeze({ type, id: value.id });
}

export function validateUpdateDraftInput(
  value: unknown,
): PublishingValidationResult<UpdateDraftInput> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "slug",
      "title",
      "summary",
      "body",
      "audience",
      "resource",
    ])
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "update-input-invalid",
          field: "update",
          message: "Update input must contain only the supported fields.",
        },
      ],
    };
  }
  const issues: PublishingValidationIssue[] = [];
  const parsedSlug = slug(value.slug, issues);
  const title = text(value.title, "title", 160, issues);
  const summary = text(value.summary, "summary", 2_000, issues, true);
  const parsedBody = body(value.body, issues);
  const audience =
    value.audience === "public" || value.audience === "account"
      ? (value.audience as UpdateAudience)
      : null;
  if (audience === null) {
    issues.push({
      code: "update-audience-invalid",
      field: "audience",
      message: "Update audience must be public or account.",
    });
  }
  const parsedResource = resource(value.resource, issues);
  if (parsedResource?.type === "order" && audience !== "account") {
    issues.push({
      code: "update-order-audience-invalid",
      field: "audience",
      message:
        "Order activity updates must use the signed-in account audience.",
    });
  }
  if (
    issues.length > 0 ||
    parsedSlug === null ||
    title === null ||
    summary === null ||
    audience === null
  ) {
    return { ok: false, issues: Object.freeze(issues) };
  }
  return {
    ok: true,
    value: Object.freeze({
      slug: parsedSlug,
      title,
      summary,
      body: parsedBody,
      audience,
      resource: parsedResource,
    }),
  };
}

export function validateEditorialDraftInput(
  value: unknown,
): PublishingValidationResult<EditorialDraftInput> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["slug", "title", "excerpt", "body"])
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "editorial-input-invalid",
          field: "editorial",
          message: "Editorial input must contain only the supported fields.",
        },
      ],
    };
  }
  const issues: PublishingValidationIssue[] = [];
  const parsedSlug = slug(value.slug, issues);
  const title = text(value.title, "title", 160, issues);
  const excerpt = text(value.excerpt, "excerpt", 2_000, issues, true);
  const parsedBody = body(value.body, issues);
  if (
    issues.length > 0 ||
    parsedSlug === null ||
    title === null ||
    excerpt === null
  ) {
    return { ok: false, issues: Object.freeze(issues) };
  }
  return {
    ok: true,
    value: Object.freeze({
      slug: parsedSlug,
      title,
      excerpt,
      body: parsedBody,
    }),
  };
}
