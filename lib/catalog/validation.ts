import {
  CATALOG_ACCESS_MODES,
  MEDIA_DERIVATIVE_KINDS,
  RELEASE_TYPES,
  type CatalogAccessMode,
  type CatalogCreditInput,
  type CollectionDraftInput,
  type MediaDerivativeKind,
  type MediaDerivativeRegistrationInput,
  type MediaObjectRegistrationInput,
  type ReleaseDraftInput,
  type ReleaseTrackInput,
  type ReleaseType,
  type TrackDraftInput,
} from "./types.ts";

export const CATALOG_INPUT_LIMITS = Object.freeze({
  slug: 80,
  title: 160,
  subtitle: 240,
  description: 50_000,
  copyrightNotice: 1_000,
  catalogNumber: 80,
  tag: 64,
  tags: 32,
  credits: 64,
  creditName: 160,
  creditRole: 120,
  creditDetails: 1_000,
  tracks: 500,
  objectKey: 512,
  contentType: 160,
  processingValue: 120,
} as const);

export interface CatalogValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type CatalogValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly CatalogValidationIssue[] };

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRIVATE_OBJECT_KEY = /^[a-z0-9][a-z0-9._/-]{0,511}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  issues: CatalogValidationIssue[],
  field: string,
  message: string,
): void {
  issues.push(Object.freeze({ field, message }));
}

function exactKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  issues: CatalogValidationIssue[],
  prefix = "",
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issue(
        issues,
        prefix ? `${prefix}.${key}` : key,
        `${key} is not supported.`,
      );
    }
  }
}

function valid<T>(value: T): CatalogValidationResult<T> {
  return Object.freeze({ ok: true, value: Object.freeze(value) });
}

function invalid<T>(
  issues: readonly CatalogValidationIssue[],
): CatalogValidationResult<T> {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

function text(
  record: Record<string, unknown>,
  field: string,
  limit: number,
  issues: CatalogValidationIssue[],
  allowEmpty = false,
): string | null {
  const value = record[field];
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

function nullableText(
  record: Record<string, unknown>,
  field: string,
  limit: number,
  issues: CatalogValidationIssue[],
): string | null {
  if (
    record[field] === null ||
    record[field] === undefined ||
    record[field] === ""
  ) {
    return null;
  }
  return text(record, field, limit, issues);
}

function safeId(
  value: unknown,
  field: string,
  issues: CatalogValidationIssue[],
  nullable = false,
): string | null {
  if (nullable && (value === null || value === undefined || value === "")) {
    return null;
  }
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    issue(issues, field, `${field} must be a safe application identifier.`);
    return null;
  }
  return value;
}

function slug(
  record: Record<string, unknown>,
  issues: CatalogValidationIssue[],
) {
  const value = text(record, "slug", CATALOG_INPUT_LIMITS.slug, issues);
  if (value === null) return null;
  const normalized = value.toLowerCase();
  if (!SAFE_SLUG.test(normalized)) {
    issue(issues, "slug", "slug must be a normalized route segment.");
    return null;
  }
  return normalized;
}

function nonnegativeInteger(
  value: unknown,
  field: string,
  issues: CatalogValidationIssue[],
  nullable = false,
): number | null {
  if (nullable && (value === null || value === undefined || value === "")) {
    return null;
  }
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    issue(issues, field, `${field} must be a non-negative safe integer.`);
    return null;
  }
  return value as number;
}

function positiveInteger(
  value: unknown,
  field: string,
  issues: CatalogValidationIssue[],
): number | null {
  const integer = nonnegativeInteger(value, field, issues);
  if (integer === null) return null;
  if (integer === 0) {
    issue(issues, field, `${field} must be greater than zero.`);
    return null;
  }
  return integer;
}

function accessMode(
  value: unknown,
  field: string,
  issues: CatalogValidationIssue[],
): CatalogAccessMode | null {
  if (!CATALOG_ACCESS_MODES.includes(value as CatalogAccessMode)) {
    issue(issues, field, `${field} must be a supported availability mode.`);
    return null;
  }
  return value as CatalogAccessMode;
}

function tags(
  value: unknown,
  issues: CatalogValidationIssue[],
): readonly string[] {
  if (!Array.isArray(value) || value.length > CATALOG_INPUT_LIMITS.tags) {
    issue(
      issues,
      "tags",
      `tags must contain at most ${CATALOG_INPUT_LIMITS.tags} entries.`,
    );
    return [];
  }
  const normalized: string[] = [];
  value.forEach((candidate, index) => {
    if (typeof candidate !== "string") {
      issue(issues, `tags.${index}`, "Each tag must be a string.");
      return;
    }
    const tag = candidate.trim();
    if (tag.length === 0 || tag.length > CATALOG_INPUT_LIMITS.tag) {
      issue(
        issues,
        `tags.${index}`,
        `Each tag must contain at most ${CATALOG_INPUT_LIMITS.tag} characters.`,
      );
      return;
    }
    if (
      !normalized.some(
        (existing) => existing.toLowerCase() === tag.toLowerCase(),
      )
    ) {
      normalized.push(tag);
    }
  });
  return Object.freeze(normalized);
}

function credits(
  value: unknown,
  issues: CatalogValidationIssue[],
): readonly CatalogCreditInput[] {
  if (!Array.isArray(value) || value.length > CATALOG_INPUT_LIMITS.credits) {
    issue(
      issues,
      "credits",
      `credits must contain at most ${CATALOG_INPUT_LIMITS.credits} entries.`,
    );
    return [];
  }
  return Object.freeze(
    value.flatMap((candidate, index) => {
      if (!isRecord(candidate)) {
        issue(issues, `credits.${index}`, "Each credit must be an object.");
        return [];
      }
      exactKeys(
        candidate,
        ["name", "role", "details"],
        issues,
        `credits.${index}`,
      );
      const name = text(
        candidate,
        "name",
        CATALOG_INPUT_LIMITS.creditName,
        issues,
      );
      const role = text(
        candidate,
        "role",
        CATALOG_INPUT_LIMITS.creditRole,
        issues,
      );
      const details = text(
        candidate,
        "details",
        CATALOG_INPUT_LIMITS.creditDetails,
        issues,
        true,
      );
      return name === null || role === null || details === null
        ? []
        : [Object.freeze({ name, role, details })];
    }),
  );
}

function commonRecord(input: unknown): Record<string, unknown> | null {
  return isRecord(input) ? input : null;
}

export function validateTrackDraftInput(
  input: unknown,
): CatalogValidationResult<TrackDraftInput> {
  const record = commonRecord(input);
  if (!record)
    return invalid([{ field: "track", message: "track must be an object." }]);
  const issues: CatalogValidationIssue[] = [];
  exactKeys(
    record,
    [
      "slug",
      "title",
      "subtitle",
      "description",
      "durationMs",
      "isrc",
      "copyrightNotice",
      "explicit",
      "viewMode",
      "streamMode",
      "downloadMode",
      "originalMediaId",
      "streamingDerivativeId",
      "downloadDerivativeId",
      "tags",
      "credits",
    ],
    issues,
  );
  const normalizedIsrc =
    nullableText(record, "isrc", 32, issues)
      ?.replace(/[ -]/g, "")
      .toUpperCase() ?? null;
  if (normalizedIsrc !== null && !ISRC.test(normalizedIsrc)) {
    issue(issues, "isrc", "isrc must be a valid 12-character ISRC.");
  }
  if (typeof record.explicit !== "boolean")
    issue(issues, "explicit", "explicit must be a boolean.");
  const result: TrackDraftInput = {
    slug: slug(record, issues) ?? "",
    title: text(record, "title", CATALOG_INPUT_LIMITS.title, issues) ?? "",
    subtitle: nullableText(
      record,
      "subtitle",
      CATALOG_INPUT_LIMITS.subtitle,
      issues,
    ),
    description:
      text(
        record,
        "description",
        CATALOG_INPUT_LIMITS.description,
        issues,
        true,
      ) ?? "",
    durationMs: nonnegativeInteger(
      record.durationMs,
      "durationMs",
      issues,
      true,
    ),
    isrc: normalizedIsrc,
    copyrightNotice:
      text(
        record,
        "copyrightNotice",
        CATALOG_INPUT_LIMITS.copyrightNotice,
        issues,
        true,
      ) ?? "",
    explicit: record.explicit === true,
    viewMode: accessMode(record.viewMode, "viewMode", issues) ?? "unavailable",
    streamMode:
      accessMode(record.streamMode, "streamMode", issues) ?? "unavailable",
    downloadMode:
      accessMode(record.downloadMode, "downloadMode", issues) ?? "unavailable",
    originalMediaId: safeId(
      record.originalMediaId,
      "originalMediaId",
      issues,
      true,
    ),
    streamingDerivativeId: safeId(
      record.streamingDerivativeId,
      "streamingDerivativeId",
      issues,
      true,
    ),
    downloadDerivativeId: safeId(
      record.downloadDerivativeId,
      "downloadDerivativeId",
      issues,
      true,
    ),
    tags: tags(record.tags, issues),
    credits: credits(record.credits, issues),
  };
  return issues.length > 0 ? invalid(issues) : valid(result);
}

function releaseType(
  value: unknown,
  issues: CatalogValidationIssue[],
): ReleaseType | null {
  if (!RELEASE_TYPES.includes(value as ReleaseType)) {
    issue(issues, "releaseType", "releaseType must be supported.");
    return null;
  }
  return value as ReleaseType;
}

function releaseTracks(
  value: unknown,
  issues: CatalogValidationIssue[],
): readonly ReleaseTrackInput[] {
  if (!Array.isArray(value) || value.length > CATALOG_INPUT_LIMITS.tracks) {
    issue(
      issues,
      "tracks",
      `tracks must contain at most ${CATALOG_INPUT_LIMITS.tracks} entries.`,
    );
    return [];
  }
  const seen = new Set<string>();
  const seenNumbers = new Set<string>();
  return Object.freeze(
    value.flatMap((candidate, index) => {
      if (!isRecord(candidate)) {
        issue(
          issues,
          `tracks.${index}`,
          "Each release track must be an object.",
        );
        return [];
      }
      exactKeys(
        candidate,
        ["trackId", "discNumber", "trackNumber"],
        issues,
        `tracks.${index}`,
      );
      const trackId = safeId(
        candidate.trackId,
        `tracks.${index}.trackId`,
        issues,
      );
      const discNumber = positiveInteger(
        candidate.discNumber,
        `tracks.${index}.discNumber`,
        issues,
      );
      const trackNumber = positiveInteger(
        candidate.trackNumber,
        `tracks.${index}.trackNumber`,
        issues,
      );
      if (trackId && seen.has(trackId))
        issue(
          issues,
          `tracks.${index}.trackId`,
          "A release cannot contain a track twice.",
        );
      if (trackId) seen.add(trackId);
      if (discNumber && trackNumber) {
        const coordinate = `${discNumber}:${trackNumber}`;
        if (seenNumbers.has(coordinate)) {
          issue(
            issues,
            `tracks.${index}.trackNumber`,
            "A release track number can appear only once on a disc.",
          );
        }
        seenNumbers.add(coordinate);
      }
      return trackId && discNumber && trackNumber
        ? [Object.freeze({ trackId, discNumber, trackNumber })]
        : [];
    }),
  );
}

function readDate(
  value: unknown,
  issues: CatalogValidationIssue[],
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    issue(issues, "releaseDate", "releaseDate must use YYYY-MM-DD.");
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    issue(issues, "releaseDate", "releaseDate must be a real calendar date.");
    return null;
  }
  return value;
}

export function validateReleaseDraftInput(
  input: unknown,
): CatalogValidationResult<ReleaseDraftInput> {
  const record = commonRecord(input);
  if (!record)
    return invalid([
      { field: "release", message: "release must be an object." },
    ]);
  const issues: CatalogValidationIssue[] = [];
  exactKeys(
    record,
    [
      "slug",
      "releaseType",
      "title",
      "subtitle",
      "description",
      "releaseDate",
      "catalogNumber",
      "copyrightNotice",
      "viewMode",
      "artworkDerivativeId",
      "tags",
      "tracks",
      "credits",
    ],
    issues,
  );
  const result: ReleaseDraftInput = {
    slug: slug(record, issues) ?? "",
    releaseType: releaseType(record.releaseType, issues) ?? "other",
    title: text(record, "title", CATALOG_INPUT_LIMITS.title, issues) ?? "",
    subtitle: nullableText(
      record,
      "subtitle",
      CATALOG_INPUT_LIMITS.subtitle,
      issues,
    ),
    description:
      text(
        record,
        "description",
        CATALOG_INPUT_LIMITS.description,
        issues,
        true,
      ) ?? "",
    releaseDate: readDate(record.releaseDate, issues),
    catalogNumber: nullableText(
      record,
      "catalogNumber",
      CATALOG_INPUT_LIMITS.catalogNumber,
      issues,
    ),
    copyrightNotice:
      text(
        record,
        "copyrightNotice",
        CATALOG_INPUT_LIMITS.copyrightNotice,
        issues,
        true,
      ) ?? "",
    viewMode: accessMode(record.viewMode, "viewMode", issues) ?? "unavailable",
    artworkDerivativeId: safeId(
      record.artworkDerivativeId,
      "artworkDerivativeId",
      issues,
      true,
    ),
    tags: tags(record.tags, issues),
    tracks: releaseTracks(record.tracks, issues),
    credits: credits(record.credits, issues),
  };
  return issues.length > 0 ? invalid(issues) : valid(result);
}

function trackIds(
  value: unknown,
  issues: CatalogValidationIssue[],
): readonly string[] {
  if (!Array.isArray(value) || value.length > CATALOG_INPUT_LIMITS.tracks) {
    issue(
      issues,
      "trackIds",
      `trackIds must contain at most ${CATALOG_INPUT_LIMITS.tracks} entries.`,
    );
    return [];
  }
  const seen = new Set<string>();
  return Object.freeze(
    value.flatMap((candidate, index) => {
      const trackId = safeId(candidate, `trackIds.${index}`, issues);
      if (!trackId) return [];
      if (seen.has(trackId)) {
        issue(
          issues,
          `trackIds.${index}`,
          "A collection cannot contain a track twice.",
        );
        return [];
      }
      seen.add(trackId);
      return [trackId];
    }),
  );
}

export function validateCollectionDraftInput(
  input: unknown,
): CatalogValidationResult<CollectionDraftInput> {
  const record = commonRecord(input);
  if (!record)
    return invalid([
      { field: "collection", message: "collection must be an object." },
    ]);
  const issues: CatalogValidationIssue[] = [];
  exactKeys(
    record,
    [
      "slug",
      "title",
      "description",
      "viewMode",
      "artworkDerivativeId",
      "tags",
      "trackIds",
      "credits",
    ],
    issues,
  );
  const result: CollectionDraftInput = {
    slug: slug(record, issues) ?? "",
    title: text(record, "title", CATALOG_INPUT_LIMITS.title, issues) ?? "",
    description:
      text(
        record,
        "description",
        CATALOG_INPUT_LIMITS.description,
        issues,
        true,
      ) ?? "",
    viewMode: accessMode(record.viewMode, "viewMode", issues) ?? "unavailable",
    artworkDerivativeId: safeId(
      record.artworkDerivativeId,
      "artworkDerivativeId",
      issues,
      true,
    ),
    tags: tags(record.tags, issues),
    trackIds: trackIds(record.trackIds, issues),
    credits: credits(record.credits, issues),
  };
  return issues.length > 0 ? invalid(issues) : valid(result);
}

function contentType(
  value: unknown,
  field: string,
  issues: CatalogValidationIssue[],
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > CATALOG_INPUT_LIMITS.contentType
  ) {
    issue(issues, field, `${field} must be a valid content type.`);
    return null;
  }
  try {
    const headers = new Headers();
    headers.set("content-type", value.trim());
    return headers.get("content-type");
  } catch {
    issue(issues, field, `${field} must be a valid content type.`);
    return null;
  }
}

function objectKey(
  value: unknown,
  field: string,
  issues: CatalogValidationIssue[],
  nullable = false,
): string | null {
  if (nullable && (value === null || value === undefined || value === ""))
    return null;
  if (
    typeof value !== "string" ||
    value.length > CATALOG_INPUT_LIMITS.objectKey ||
    !PRIVATE_OBJECT_KEY.test(value) ||
    value.includes("..")
  ) {
    issue(issues, field, `${field} must be a safe private object key.`);
    return null;
  }
  return value;
}

function checksum(
  value: unknown,
  field: string,
  issues: CatalogValidationIssue[],
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !SHA256.test(value.toLowerCase())) {
    issue(issues, field, `${field} must be a SHA-256 digest.`);
    return null;
  }
  return value.toLowerCase();
}

export function validateMediaObjectRegistrationInput(
  input: unknown,
): CatalogValidationResult<MediaObjectRegistrationInput> {
  const record = commonRecord(input);
  if (!record)
    return invalid([{ field: "media", message: "media must be an object." }]);
  const issues: CatalogValidationIssue[] = [];
  exactKeys(
    record,
    [
      "id",
      "objectKey",
      "kind",
      "visibility",
      "contentType",
      "byteLength",
      "etag",
      "sourceVersion",
      "status",
      "contentSha256",
      "durationMs",
      "channels",
      "sampleRate",
    ],
    issues,
  );
  const kinds = [
    "audio",
    "image",
    "video",
    "document",
    "export",
    "other",
  ] as const;
  const statuses = ["pending", "ready", "failed"] as const;
  if (!kinds.includes(record.kind as (typeof kinds)[number]))
    issue(issues, "kind", "kind must be supported.");
  if (record.visibility !== "public" && record.visibility !== "protected")
    issue(issues, "visibility", "visibility must be public or protected.");
  if (!statuses.includes(record.status as (typeof statuses)[number]))
    issue(issues, "status", "status must be supported.");
  const normalizedContentType = contentType(
    record.contentType,
    "contentType",
    issues,
  );
  if (!normalizedContentType)
    issue(issues, "contentType", "contentType is required.");
  if (
    normalizedContentType &&
    ((record.kind === "audio" && !normalizedContentType.startsWith("audio/")) ||
      (record.kind === "image" &&
        !normalizedContentType.startsWith("image/")) ||
      (record.kind === "video" && !normalizedContentType.startsWith("video/")))
  ) {
    issue(issues, "contentType", "contentType must match the media kind.");
  }
  const normalizedObjectKey = objectKey(record.objectKey, "objectKey", issues);
  if (normalizedObjectKey && !normalizedObjectKey.startsWith("originals/")) {
    issue(
      issues,
      "objectKey",
      "Original media keys must use the originals namespace.",
    );
  }
  const normalizedChecksum = checksum(
    record.contentSha256,
    "contentSha256",
    issues,
  );
  if (record.status === "ready" && normalizedChecksum === null) {
    issue(
      issues,
      "contentSha256",
      "Ready original media needs a SHA-256 digest.",
    );
  }
  const channels =
    record.channels === null ||
    record.channels === undefined ||
    record.channels === ""
      ? null
      : positiveInteger(record.channels, "channels", issues);
  const sampleRate =
    record.sampleRate === null ||
    record.sampleRate === undefined ||
    record.sampleRate === ""
      ? null
      : positiveInteger(record.sampleRate, "sampleRate", issues);
  const result: MediaObjectRegistrationInput = {
    id: safeId(record.id, "id", issues) ?? "",
    objectKey: normalizedObjectKey ?? "",
    kind: (kinds.includes(record.kind as (typeof kinds)[number])
      ? record.kind
      : "other") as MediaObjectRegistrationInput["kind"],
    visibility: record.visibility === "public" ? "public" : "protected",
    contentType: normalizedContentType ?? "application/octet-stream",
    byteLength:
      nonnegativeInteger(record.byteLength, "byteLength", issues) ?? 0,
    etag: nullableText(record, "etag", 256, issues),
    sourceVersion:
      positiveInteger(record.sourceVersion, "sourceVersion", issues) ?? 1,
    status: (statuses.includes(record.status as (typeof statuses)[number])
      ? record.status
      : "failed") as MediaObjectRegistrationInput["status"],
    contentSha256: normalizedChecksum,
    durationMs: nonnegativeInteger(
      record.durationMs,
      "durationMs",
      issues,
      true,
    ),
    channels,
    sampleRate,
  };
  return issues.length > 0 ? invalid(issues) : valid(result);
}

function derivativeKind(
  value: unknown,
  issues: CatalogValidationIssue[],
): MediaDerivativeKind | null {
  if (!MEDIA_DERIVATIVE_KINDS.includes(value as MediaDerivativeKind)) {
    issue(issues, "kind", "kind must be a supported derivative kind.");
    return null;
  }
  return value as MediaDerivativeKind;
}

export function validateMediaDerivativeRegistrationInput(
  input: unknown,
): CatalogValidationResult<MediaDerivativeRegistrationInput> {
  const record = commonRecord(input);
  if (!record)
    return invalid([
      { field: "derivative", message: "derivative must be an object." },
    ]);
  const issues: CatalogValidationIssue[] = [];
  exactKeys(
    record,
    [
      "id",
      "sourceMediaId",
      "kind",
      "processingProfile",
      "processingVersion",
      "objectKey",
      "status",
      "contentType",
      "format",
      "bitrateKbps",
      "durationMs",
      "channels",
      "sampleRate",
      "byteLength",
      "contentSha256",
    ],
    issues,
  );
  const statuses = ["pending", "processing", "ready", "failed"] as const;
  if (!statuses.includes(record.status as (typeof statuses)[number]))
    issue(issues, "status", "status must be supported.");
  const status = statuses.includes(record.status as (typeof statuses)[number])
    ? (record.status as MediaDerivativeRegistrationInput["status"])
    : "failed";
  const normalizedContentType = contentType(
    record.contentType,
    "contentType",
    issues,
  );
  const normalizedObjectKey = objectKey(
    record.objectKey,
    "objectKey",
    issues,
    true,
  );
  const normalizedByteLength = nonnegativeInteger(
    record.byteLength,
    "byteLength",
    issues,
    true,
  );
  if (
    status === "ready" &&
    (!normalizedContentType ||
      !normalizedObjectKey ||
      normalizedByteLength === null)
  ) {
    issue(
      issues,
      "status",
      "A ready derivative needs an object key, content type, and byte length.",
    );
  }
  if (normalizedObjectKey && !normalizedObjectKey.startsWith("derivatives/")) {
    issue(
      issues,
      "objectKey",
      "Derivative keys must use the derivatives namespace.",
    );
  }
  if (
    normalizedContentType &&
    (["streaming", "download", "waveform"].includes(String(record.kind))
      ? !normalizedContentType.startsWith("audio/")
      : record.kind === "artwork" ||
          record.kind === "poster" ||
          record.kind === "thumbnail"
        ? !normalizedContentType.startsWith("image/")
        : false)
  ) {
    issue(issues, "contentType", "contentType must match the derivative kind.");
  }
  const normalizedChecksum = checksum(
    record.contentSha256,
    "contentSha256",
    issues,
  );
  if (status === "ready" && normalizedChecksum === null) {
    issue(
      issues,
      "contentSha256",
      "A ready derivative needs a SHA-256 digest.",
    );
  }
  const result: MediaDerivativeRegistrationInput = {
    id: safeId(record.id, "id", issues) ?? "",
    sourceMediaId: safeId(record.sourceMediaId, "sourceMediaId", issues) ?? "",
    kind: derivativeKind(record.kind, issues) ?? "other",
    processingProfile:
      text(
        record,
        "processingProfile",
        CATALOG_INPUT_LIMITS.processingValue,
        issues,
      ) ?? "",
    processingVersion:
      text(
        record,
        "processingVersion",
        CATALOG_INPUT_LIMITS.processingValue,
        issues,
      ) ?? "",
    objectKey: normalizedObjectKey,
    status,
    contentType: normalizedContentType,
    format: nullableText(record, "format", 80, issues),
    bitrateKbps: nonnegativeInteger(
      record.bitrateKbps,
      "bitrateKbps",
      issues,
      true,
    ),
    durationMs: nonnegativeInteger(
      record.durationMs,
      "durationMs",
      issues,
      true,
    ),
    channels:
      record.channels === null ||
      record.channels === undefined ||
      record.channels === ""
        ? null
        : positiveInteger(record.channels, "channels", issues),
    sampleRate:
      record.sampleRate === null ||
      record.sampleRate === undefined ||
      record.sampleRate === ""
        ? null
        : positiveInteger(record.sampleRate, "sampleRate", issues),
    byteLength: normalizedByteLength,
    contentSha256: normalizedChecksum,
  };
  return issues.length > 0 ? invalid(issues) : valid(result);
}
