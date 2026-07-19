import { canonicalSha256, isSha256 } from "./canonical.ts";
import { SetupContractError, type SetupValidationIssue } from "./errors.ts";
import {
  SETUP_TOPIC_KEYS,
  SOURCE_STATE_SCHEMA_VERSION,
  type SourceResourceKind,
  type SourceStateResource,
  type SourceStateSnapshot,
} from "./types.ts";

const SAFE_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESOURCE_KINDS = new Set<string>([
  ...SETUP_TOPIC_KEYS,
  "media",
  "source",
]);

function issue(
  issues: SetupValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function exact(
  value: unknown,
  keys: readonly string[],
  path: string,
  issues: SetupValidationIssue[],
): Record<string, unknown> {
  if (!record(value)) {
    issue(issues, path, "object-required", "Use a JSON object.");
    return {};
  }
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      issue(issues, `${path}.${key}`, "unknown-field", "Remove this field.");
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      issue(issues, `${path}.${key}`, "required-field", "Provide this field.");
    }
  }
  return value;
}

function safeKey(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 100 ||
    !SAFE_KEY.test(value)
  ) {
    issue(
      issues,
      path,
      "stable-key",
      "Use lowercase words separated by single hyphens.",
    );
    return "invalid";
  }
  return value;
}

function nonnegativeInteger(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    issue(issues, path, "revision", "Use a nonnegative integer revision.");
    return 0;
  }
  return value as number;
}

export function validateSourceStateSnapshot(
  value: unknown,
): SourceStateSnapshot {
  const issues: SetupValidationIssue[] = [];
  const object = exact(
    value,
    [
      "schemaVersion",
      "installationId",
      "d1SchemaVersion",
      "setupRevision",
      "resources",
    ],
    "$",
    issues,
  );
  if (object.schemaVersion !== SOURCE_STATE_SCHEMA_VERSION) {
    issue(
      issues,
      "$.schemaVersion",
      "schema-version",
      `Use ${SOURCE_STATE_SCHEMA_VERSION}.`,
    );
  }
  const resources: SourceStateResource[] = [];
  if (!Array.isArray(object.resources)) {
    issue(issues, "$.resources", "array-required", "Use an array.");
  } else if (object.resources.length > 10_000) {
    issue(
      issues,
      "$.resources",
      "array-length",
      "Use at most 10000 resource revisions.",
    );
  } else {
    for (const [index, entry] of object.resources.entries()) {
      const path = `$.resources[${index}]`;
      const resource = exact(
        entry,
        ["kind", "resourceKey", "revision", "contentHash"],
        path,
        issues,
      );
      if (
        typeof resource.kind !== "string" ||
        !RESOURCE_KINDS.has(resource.kind)
      ) {
        issue(
          issues,
          `${path}.kind`,
          "resource-kind",
          "Use a setup topic, media, or source.",
        );
      }
      if (resource.contentHash !== null && !isSha256(resource.contentHash)) {
        issue(
          issues,
          `${path}.contentHash`,
          "content-hash",
          "Use a canonical sha256 hash or null.",
        );
      }
      resources.push({
        kind: (RESOURCE_KINDS.has(String(resource.kind))
          ? resource.kind
          : "source") as SourceResourceKind,
        resourceKey: safeKey(
          resource.resourceKey,
          `${path}.resourceKey`,
          issues,
        ),
        revision: nonnegativeInteger(
          resource.revision,
          `${path}.revision`,
          issues,
        ),
        contentHash:
          resource.contentHash === null || isSha256(resource.contentHash)
            ? resource.contentHash
            : null,
      });
    }
  }

  resources.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.resourceKey.localeCompare(right.resourceKey),
  );
  for (let index = 1; index < resources.length; index += 1) {
    const previous = resources[index - 1]!;
    const current = resources[index]!;
    if (
      previous.kind === current.kind &&
      previous.resourceKey === current.resourceKey
    ) {
      issue(
        issues,
        "$.resources",
        "duplicate-resource",
        "Each resource revision must appear once.",
      );
    }
  }

  const snapshot: SourceStateSnapshot = {
    schemaVersion: SOURCE_STATE_SCHEMA_VERSION,
    installationId: safeKey(object.installationId, "$.installationId", issues),
    d1SchemaVersion: nonnegativeInteger(
      object.d1SchemaVersion,
      "$.d1SchemaVersion",
      issues,
    ),
    setupRevision: nonnegativeInteger(
      object.setupRevision,
      "$.setupRevision",
      issues,
    ),
    resources: Object.freeze(
      resources.map((resource) => Object.freeze(resource)),
    ),
  };

  if (issues.length > 0) {
    throw new SetupContractError(
      "SETUP_INPUT_INVALID",
      `The setup source state has ${issues.length} validation issue${issues.length === 1 ? "" : "s"}.`,
      issues,
    );
  }
  return Object.freeze(snapshot);
}

export async function createSourceStateFingerprint(
  value: unknown,
): Promise<string> {
  return canonicalSha256(validateSourceStateSnapshot(value));
}
