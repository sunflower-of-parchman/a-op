import type {
  AccessPlanCreateInput,
  AccessPlanGrantInput,
  AccessPlanItemInput,
  AccessPlanUpdateInput,
} from "./types.ts";

export const ACCESS_PLAN_INPUT_LIMITS = Object.freeze({
  slug: 80,
  name: 120,
  description: 2_000,
  reason: 1_000,
  items: 64,
} as const);

export interface AccessPlanValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type AccessPlanValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly AccessPlanValidationIssue[];
    };

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENT_RESOURCE_TYPES = new Set([
  "track",
  "release",
  "collection",
  "course",
]);
const ACTIONS_BY_RESOURCE = Object.freeze({
  track: new Set(["view", "stream", "download"]),
  release: new Set(["view"]),
  collection: new Set(["view"]),
  course: new Set(["view", "stream", "download"]),
} as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  issues: AccessPlanValidationIssue[],
  field: string,
  message: string,
): void {
  issues.push(Object.freeze({ field, message }));
}

function exactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  issues: AccessPlanValidationIssue[],
  prefix = "",
): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!keys.has(key)) {
      issue(
        issues,
        prefix ? `${prefix}.${key}` : key,
        `${key} is not supported.`,
      );
    }
  }
}

function valid<T>(value: T): AccessPlanValidationResult<T> {
  return Object.freeze({ ok: true, value: Object.freeze(value) });
}

function invalid<T>(
  issues: readonly AccessPlanValidationIssue[],
): AccessPlanValidationResult<T> {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

function normalizedText(
  value: unknown,
  field: string,
  limit: number,
  issues: AccessPlanValidationIssue[],
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") {
    issue(issues, field, `${field} must be a string.`);
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > limit) {
    issue(issues, field, `${field} must contain at most ${limit} characters.`);
    return null;
  }
  return normalized;
}

function safeId(
  value: unknown,
  field: string,
  issues: AccessPlanValidationIssue[],
): string | null {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    issue(issues, field, `${field} must be a safe application identifier.`);
    return null;
  }
  return value;
}

function timestamp(
  value: unknown,
  field: string,
  issues: AccessPlanValidationIssue[],
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !Number.isFinite(Date.parse(value))
  ) {
    issue(
      issues,
      field,
      `${field} must be an ISO-compatible timestamp or null.`,
    );
    return null;
  }
  return new Date(Date.parse(value)).toISOString();
}

function planItem(
  value: unknown,
  index: number,
  issues: AccessPlanValidationIssue[],
): AccessPlanItemInput | null {
  const prefix = `items.${index}`;
  if (!isRecord(value)) {
    issue(issues, prefix, "Each access-plan item must be an object.");
    return null;
  }
  exactKeys(
    value,
    [
      "resourceType",
      "resourceId",
      "actions",
      "remainingUses",
      "downloadDisposition",
    ],
    issues,
    prefix,
  );

  const resourceType = value.resourceType;
  if (
    typeof resourceType !== "string" ||
    !CURRENT_RESOURCE_TYPES.has(resourceType)
  ) {
    issue(
      issues,
      `${prefix}.resourceType`,
      "Choose a current track, release, collection, or Course.",
    );
    return null;
  }
  const resourceId = safeId(value.resourceId, `${prefix}.resourceId`, issues);
  const allowedActions = ACTIONS_BY_RESOURCE[
    resourceType as keyof typeof ACTIONS_BY_RESOURCE
  ] as ReadonlySet<string>;
  if (
    !Array.isArray(value.actions) ||
    value.actions.length === 0 ||
    value.actions.length > allowedActions.size ||
    !value.actions.every(
      (action) => typeof action === "string" && allowedActions.has(action),
    ) ||
    new Set(value.actions).size !== value.actions.length
  ) {
    issue(
      issues,
      `${prefix}.actions`,
      "Choose one or more supported actions without duplicates.",
    );
  }
  if (value.remainingUses !== null) {
    issue(
      issues,
      `${prefix}.remainingUses`,
      "Finite-use access becomes available with the credit ledger.",
    );
  }
  if (
    value.downloadDisposition !== null &&
    value.downloadDisposition !== "inline" &&
    value.downloadDisposition !== "attachment"
  ) {
    issue(
      issues,
      `${prefix}.downloadDisposition`,
      "Download disposition must be inline, attachment, or null.",
    );
  }
  if (
    value.downloadDisposition !== null &&
    (!Array.isArray(value.actions) || !value.actions.includes("download"))
  ) {
    issue(
      issues,
      `${prefix}.downloadDisposition`,
      "Download disposition requires the download action.",
    );
  }

  if (
    resourceId === null ||
    issues.some(({ field }) => field.startsWith(prefix))
  ) {
    return null;
  }
  return Object.freeze({
    resourceType: resourceType as AccessPlanItemInput["resourceType"],
    resourceId,
    actions: Object.freeze([
      ...(value.actions as AccessPlanItemInput["actions"]),
    ]),
    remainingUses: null,
    downloadDisposition:
      value.downloadDisposition as AccessPlanItemInput["downloadDisposition"],
  });
}

function planItems(
  value: unknown,
  issues: AccessPlanValidationIssue[],
): readonly AccessPlanItemInput[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > ACCESS_PLAN_INPUT_LIMITS.items
  ) {
    issue(
      issues,
      "items",
      `items must contain 1-${ACCESS_PLAN_INPUT_LIMITS.items} resources.`,
    );
    return Object.freeze([]);
  }
  const items = value.flatMap((candidate, index) => {
    const parsed = planItem(candidate, index, issues);
    return parsed === null ? [] : [parsed];
  });
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const key = `${item.resourceType}:${item.resourceId}`;
    if (seen.has(key)) {
      issue(
        issues,
        `items.${index}.resourceId`,
        "Each resource may appear once.",
      );
    }
    seen.add(key);
  });
  return Object.freeze(items);
}

export function validateAccessPlanCreateInput(
  value: unknown,
): AccessPlanValidationResult<AccessPlanCreateInput> {
  const issues: AccessPlanValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "plan", "Access plan must be an object.");
    return invalid(issues);
  }
  exactKeys(value, ["slug", "name", "description", "items"], issues);
  const rawSlug = normalizedText(
    value.slug,
    "slug",
    ACCESS_PLAN_INPUT_LIMITS.slug,
    issues,
  );
  const slug = rawSlug?.toLowerCase() ?? null;
  if (slug !== null && !SAFE_SLUG.test(slug)) {
    issue(issues, "slug", "slug must be a normalized route segment.");
  }
  const name = normalizedText(
    value.name,
    "name",
    ACCESS_PLAN_INPUT_LIMITS.name,
    issues,
  );
  const description = normalizedText(
    value.description,
    "description",
    ACCESS_PLAN_INPUT_LIMITS.description,
    issues,
    true,
  );
  const items = planItems(value.items, issues);
  if (
    issues.length > 0 ||
    slug === null ||
    name === null ||
    description === null
  ) {
    return invalid(issues);
  }
  return valid({ slug, name, description, items });
}

export function validateAccessPlanUpdateInput(
  value: unknown,
): AccessPlanValidationResult<AccessPlanUpdateInput> {
  const issues: AccessPlanValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "plan", "Access plan must be an object.");
    return invalid(issues);
  }
  exactKeys(value, ["name", "description", "items"], issues);
  const name = normalizedText(
    value.name,
    "name",
    ACCESS_PLAN_INPUT_LIMITS.name,
    issues,
  );
  const description = normalizedText(
    value.description,
    "description",
    ACCESS_PLAN_INPUT_LIMITS.description,
    issues,
    true,
  );
  const items = planItems(value.items, issues);
  if (issues.length > 0 || name === null || description === null) {
    return invalid(issues);
  }
  return valid({ name, description, items });
}

export function validateAccessPlanGrantInput(
  value: unknown,
): AccessPlanValidationResult<AccessPlanGrantInput> {
  const issues: AccessPlanValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "grant", "Access grant must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    ["accessPlanId", "customerUserId", "startsAt", "expiresAt", "reason"],
    issues,
  );
  const accessPlanId = safeId(value.accessPlanId, "accessPlanId", issues);
  const customerUserId = safeId(value.customerUserId, "customerUserId", issues);
  const startsAt = timestamp(value.startsAt, "startsAt", issues);
  const expiresAt = timestamp(value.expiresAt, "expiresAt", issues);
  const reason = normalizedText(
    value.reason,
    "reason",
    ACCESS_PLAN_INPUT_LIMITS.reason,
    issues,
    true,
  );
  if (
    startsAt !== null &&
    expiresAt !== null &&
    Date.parse(startsAt) >= Date.parse(expiresAt)
  ) {
    issue(issues, "expiresAt", "expiresAt must be later than startsAt.");
  }
  if (
    issues.length > 0 ||
    accessPlanId === null ||
    customerUserId === null ||
    reason === null
  ) {
    return invalid(issues);
  }
  return valid({ accessPlanId, customerUserId, startsAt, expiresAt, reason });
}
