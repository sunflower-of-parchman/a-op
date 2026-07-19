import {
  MEDIA_INTENDED_USES,
  MEDIA_KINDS,
  type ApprovedMediaSourceInput,
  type MediaInspection,
} from "./types.ts";

export const MEDIA_ALIAS_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const CONTENT_TYPE_PATTERN =
  /^(?:audio\/(?:wav|x-wav|flac|mpeg|mp4|aac)|image\/(?:jpeg|png|webp|avif)|video\/(?:mp4|webm)|text\/(?:plain|vtt)|application\/(?:json|pdf|octet-stream))$/;

export function requireMediaAlias(
  value: unknown,
  label = "Media alias",
): string {
  if (typeof value !== "string" || !MEDIA_ALIAS_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a safe local path alias.`);
  }
  return value;
}

export function requireSha256(value: unknown, label = "SHA-256"): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 value.`);
  }
  return value;
}

export function requireContractSha256(
  value: unknown,
  label = "Contract SHA-256",
): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(
      `${label} must use the sha256:<lowercase digest> contract form.`,
    );
  }
  return value as `sha256:${string}`;
}

export function requireContentType(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("Media content type is required.");
  }
  const normalized = value.trim().toLowerCase();
  if (!CONTENT_TYPE_PATTERN.test(normalized)) {
    throw new TypeError(
      "Media content type is not in the publication allowlist.",
    );
  }
  return normalized;
}

export function requireApprovedSource(
  input: ApprovedMediaSourceInput,
): ApprovedMediaSourceInput {
  const alias = requireMediaAlias(input.alias, "Source alias");
  const expectedSourceSha256 = requireSha256(
    input.expectedSourceSha256,
    "Expected source SHA-256",
  );
  if (!MEDIA_KINDS.includes(input.kind)) {
    throw new TypeError("Media kind is invalid.");
  }
  const contentType = requireContentType(input.contentType);
  if (input.rightsConfirmed !== true) {
    throw new TypeError("Explicit media rights confirmation is required.");
  }
  if (!Array.isArray(input.intendedUse) || input.intendedUse.length === 0) {
    throw new TypeError("At least one intended media use is required.");
  }
  const intendedUse = [...new Set(input.intendedUse)].sort();
  if (
    intendedUse.some((value) => !MEDIA_INTENDED_USES.includes(value as never))
  ) {
    throw new TypeError("Media intended use is invalid.");
  }
  return Object.freeze({
    alias,
    expectedSourceSha256,
    kind: input.kind,
    contentType,
    rightsConfirmed: true,
    intendedUse,
  });
}

function nullableNonnegativeInteger(
  value: unknown,
  label: string,
): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be null or a non-negative integer.`);
  }
  return value as number;
}

export function requireInspection(value: MediaInspection): MediaInspection {
  return Object.freeze({
    durationMs: nullableNonnegativeInteger(value.durationMs, "Duration"),
    channels: nullableNonnegativeInteger(value.channels, "Channels"),
    sampleRate: nullableNonnegativeInteger(value.sampleRate, "Sample rate"),
    format:
      value.format === null
        ? null
        : typeof value.format === "string" &&
            /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value.format)
          ? value.format.toLowerCase()
          : (() => {
              throw new TypeError("Media format is invalid.");
            })(),
    bitrateKbps: nullableNonnegativeInteger(value.bitrateKbps, "Bitrate"),
  });
}

export interface LocalPathAliases {
  readonly schemaVersion: "aop.local-path-aliases.v1";
  readonly aliases: Readonly<Record<string, string>>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

export function requireLocalPathAliases(
  value: unknown,
  isAbsolutePath: (path: string) => boolean,
): LocalPathAliases {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["aliases", "schemaVersion"])
  ) {
    throw new TypeError(
      "Local path configuration must contain only schemaVersion and aliases.",
    );
  }
  if (
    value.schemaVersion !== "aop.local-path-aliases.v1" ||
    !isPlainRecord(value.aliases)
  ) {
    throw new TypeError("Local path configuration schema is invalid.");
  }
  const aliases: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [alias, rawPath] of Object.entries(value.aliases)) {
    requireMediaAlias(alias, "Local path alias");
    if (
      typeof rawPath !== "string" ||
      !isAbsolutePath(rawPath) ||
      rawPath.includes("\0") ||
      seen.has(rawPath)
    ) {
      throw new TypeError(
        "Every local path alias must resolve to one unique absolute path.",
      );
    }
    aliases[alias] = rawPath;
    seen.add(rawPath);
  }
  if (Object.keys(aliases).length === 0) {
    throw new TypeError("At least one local path alias is required.");
  }
  return Object.freeze({
    schemaVersion: "aop.local-path-aliases.v1",
    aliases: Object.freeze(aliases),
  });
}

export function resolveLocalAlias(
  configuration: LocalPathAliases,
  alias: string,
): string {
  const safeAlias = requireMediaAlias(alias);
  const resolved = configuration.aliases[safeAlias];
  if (!resolved)
    throw new TypeError("The requested local path alias is not configured.");
  return resolved;
}
