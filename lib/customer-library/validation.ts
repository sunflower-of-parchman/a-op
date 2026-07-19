import {
  FAVORITE_TARGET_TYPES,
  type FavoriteDesiredStateInput,
  type FavoriteTargetType,
  type ListeningCheckpointInput,
  type PlaylistArchiveInput,
  type PlaylistCreateInput,
  type PlaylistReplacementInput,
} from "./types.ts";

export const CUSTOMER_LIBRARY_INPUT_LIMITS = Object.freeze({
  playlistName: 120,
  playlistDescription: 1_000,
  playlistTracks: 500,
} as const);

export interface CustomerLibraryValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type CustomerLibraryValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly CustomerLibraryValidationIssue[];
    };

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function issue(
  issues: CustomerLibraryValidationIssue[],
  field: string,
  message: string,
): void {
  issues.push(Object.freeze({ field, message }));
}

function record(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null
    ? (input as Record<string, unknown>)
    : null;
}

function exactKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
  issues: CustomerLibraryValidationIssue[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) issue(issues, key, `${key} is not supported.`);
  }
}

function safeId(
  value: unknown,
  field: string,
  issues: CustomerLibraryValidationIssue[],
): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    issue(issues, field, `${field} must be a safe application identifier.`);
    return "";
  }
  return value;
}

function expectedRevision(
  value: unknown,
  field: string,
  issues: CustomerLibraryValidationIssue[],
  nullable: boolean,
): number | null {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    issue(
      issues,
      field,
      `${field} must be a positive safe integer${nullable ? " or null" : ""}.`,
    );
    return nullable ? null : 1;
  }
  return value as number;
}

function normalizedText(
  value: unknown,
  field: string,
  limit: number,
  issues: CustomerLibraryValidationIssue[],
  allowEmpty: boolean,
): string {
  if (typeof value !== "string") {
    issue(issues, field, `${field} must be a string.`);
    return "";
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > limit) {
    issue(
      issues,
      field,
      `${field} must contain ${allowEmpty ? "at most" : "1-"}${limit} characters.`,
    );
  }
  return normalized;
}

function trackIds(
  value: unknown,
  issues: CustomerLibraryValidationIssue[],
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > CUSTOMER_LIBRARY_INPUT_LIMITS.playlistTracks
  ) {
    issue(
      issues,
      "trackIds",
      `trackIds must contain at most ${CUSTOMER_LIBRARY_INPUT_LIMITS.playlistTracks} entries.`,
    );
    return Object.freeze([]);
  }
  const result = value.map((candidate, index) =>
    safeId(candidate, `trackIds.${index}`, issues),
  );
  const seen = new Set<string>();
  result.forEach((id, index) => {
    if (id && seen.has(id)) {
      issue(issues, `trackIds.${index}`, "Each playlist track must be unique.");
    }
    seen.add(id);
  });
  return Object.freeze(result);
}

function valid<T>(value: T): CustomerLibraryValidationResult<T> {
  return Object.freeze({ ok: true, value: Object.freeze(value) });
}

function invalid<T>(
  issues: readonly CustomerLibraryValidationIssue[],
): CustomerLibraryValidationResult<T> {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

function playlistFields(
  input: Record<string, unknown>,
  issues: CustomerLibraryValidationIssue[],
): PlaylistCreateInput {
  return {
    name: normalizedText(
      input.name,
      "name",
      CUSTOMER_LIBRARY_INPUT_LIMITS.playlistName,
      issues,
      false,
    ),
    description: normalizedText(
      input.description,
      "description",
      CUSTOMER_LIBRARY_INPUT_LIMITS.playlistDescription,
      issues,
      true,
    ),
    trackIds: trackIds(input.trackIds, issues),
  };
}

export function validateFavoriteDesiredStateInput(
  input: unknown,
): CustomerLibraryValidationResult<FavoriteDesiredStateInput> {
  const candidate = record(input);
  if (!candidate)
    return invalid([
      { field: "favorite", message: "favorite must be an object." },
    ]);
  const issues: CustomerLibraryValidationIssue[] = [];
  exactKeys(
    candidate,
    ["targetType", "targetId", "active", "expectedRevision"],
    issues,
  );
  if (
    !FAVORITE_TARGET_TYPES.includes(candidate.targetType as FavoriteTargetType)
  ) {
    issue(issues, "targetType", "targetType must be track or release.");
  }
  if (typeof candidate.active !== "boolean") {
    issue(issues, "active", "active must be a boolean.");
  }
  const value: FavoriteDesiredStateInput = {
    targetType: candidate.targetType as FavoriteTargetType,
    targetId: safeId(candidate.targetId, "targetId", issues),
    active: candidate.active === true,
    expectedRevision: expectedRevision(
      candidate.expectedRevision,
      "expectedRevision",
      issues,
      true,
    ),
  };
  return issues.length > 0 ? invalid(issues) : valid(value);
}

export function validatePlaylistCreateInput(
  input: unknown,
): CustomerLibraryValidationResult<PlaylistCreateInput> {
  const candidate = record(input);
  if (!candidate)
    return invalid([
      { field: "playlist", message: "playlist must be an object." },
    ]);
  const issues: CustomerLibraryValidationIssue[] = [];
  exactKeys(candidate, ["name", "description", "trackIds"], issues);
  const value = playlistFields(candidate, issues);
  return issues.length > 0 ? invalid(issues) : valid(value);
}

export function validatePlaylistReplacementInput(
  input: unknown,
): CustomerLibraryValidationResult<PlaylistReplacementInput> {
  const candidate = record(input);
  if (!candidate)
    return invalid([
      { field: "playlist", message: "playlist must be an object." },
    ]);
  const issues: CustomerLibraryValidationIssue[] = [];
  exactKeys(
    candidate,
    ["name", "description", "trackIds", "expectedRevision"],
    issues,
  );
  const fields = playlistFields(candidate, issues);
  const value: PlaylistReplacementInput = {
    ...fields,
    expectedRevision: expectedRevision(
      candidate.expectedRevision,
      "expectedRevision",
      issues,
      false,
    )!,
  };
  return issues.length > 0 ? invalid(issues) : valid(value);
}

export function validatePlaylistArchiveInput(
  input: unknown,
): CustomerLibraryValidationResult<PlaylistArchiveInput> {
  const candidate = record(input);
  if (!candidate)
    return invalid([
      { field: "playlist", message: "playlist archive must be an object." },
    ]);
  const issues: CustomerLibraryValidationIssue[] = [];
  exactKeys(candidate, ["expectedRevision"], issues);
  const value = {
    expectedRevision: expectedRevision(
      candidate.expectedRevision,
      "expectedRevision",
      issues,
      false,
    )!,
  };
  return issues.length > 0 ? invalid(issues) : valid(value);
}

export function validateListeningCheckpointInput(
  input: unknown,
): CustomerLibraryValidationResult<ListeningCheckpointInput> {
  const candidate = record(input);
  if (!candidate)
    return invalid([
      {
        field: "checkpoint",
        message: "listening checkpoint must be an object.",
      },
    ]);
  const issues: CustomerLibraryValidationIssue[] = [];
  exactKeys(
    candidate,
    ["trackId", "positionMs", "meaningful", "expectedRevision"],
    issues,
  );
  if (
    !Number.isSafeInteger(candidate.positionMs) ||
    (candidate.positionMs as number) < 0
  ) {
    issue(
      issues,
      "positionMs",
      "positionMs must be a non-negative safe integer.",
    );
  }
  if (typeof candidate.meaningful !== "boolean") {
    issue(issues, "meaningful", "meaningful must be a boolean.");
  }
  const value: ListeningCheckpointInput = {
    trackId: safeId(candidate.trackId, "trackId", issues),
    positionMs:
      Number.isSafeInteger(candidate.positionMs) &&
      (candidate.positionMs as number) >= 0
        ? (candidate.positionMs as number)
        : 0,
    meaningful: candidate.meaningful === true,
    expectedRevision: expectedRevision(
      candidate.expectedRevision,
      "expectedRevision",
      issues,
      true,
    ),
  };
  return issues.length > 0 ? invalid(issues) : valid(value);
}
