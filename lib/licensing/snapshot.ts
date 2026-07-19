import type {
  LicenseDocumentProjectionInput,
  LicenseIntendedUseSnapshot,
  LicenseTermsSnapshot,
} from "./types.ts";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function canonicalize(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  throw new TypeError("License snapshots contain only JSON values.");
}

export function freezeLicenseTermsSnapshot(
  value: LicenseTermsSnapshot,
): LicenseTermsSnapshot {
  return deepFreeze(value);
}

export function freezeLicenseIntendedUseSnapshot(
  value: LicenseIntendedUseSnapshot,
): LicenseIntendedUseSnapshot {
  return deepFreeze(value);
}

export function serializeLicenseSnapshot(
  value: LicenseTermsSnapshot | LicenseIntendedUseSnapshot,
): string {
  return canonicalize(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertTermsSnapshot(
  value: unknown,
): asserts value is LicenseTermsSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new TypeError("The stored license terms snapshot is invalid.");
  }
  for (const key of ["offer", "track", "terms", "option", "testPrice"]) {
    if (!isRecord(value[key])) {
      throw new TypeError("The stored license terms snapshot is invalid.");
    }
  }
  const offer = value.offer as Record<string, unknown>;
  const track = value.track as Record<string, unknown>;
  const terms = value.terms as Record<string, unknown>;
  const option = value.option as Record<string, unknown>;
  const testPrice = value.testPrice as Record<string, unknown>;
  const requiredStrings: readonly [Record<string, unknown>, string][] = [
    [offer, "id"],
    [offer, "slug"],
    [offer, "commerceProductId"],
    [offer, "commercePriceId"],
    [track, "id"],
    [track, "revisionId"],
    [track, "slug"],
    [track, "title"],
    [terms, "id"],
    [terms, "versionId"],
    [terms, "slug"],
    [terms, "name"],
    [terms, "title"],
    [terms, "introduction"],
    [terms, "generalTerms"],
    [terms, "disclaimer"],
    [option, "id"],
    [option, "optionKey"],
    [option, "label"],
    [option, "description"],
    [option, "usageCategory"],
    [option, "territory"],
    [testPrice, "id"],
    [testPrice, "currency"],
  ];
  if (
    requiredStrings.some(([record, key]) => typeof record[key] !== "string")
  ) {
    throw new TypeError("The stored license terms snapshot is invalid.");
  }
  if (
    !Number.isSafeInteger(offer.revision) ||
    !Number.isSafeInteger(terms.version) ||
    !Number.isSafeInteger(option.licenseCreditCost) ||
    !Number.isSafeInteger(testPrice.amountMinor) ||
    !Array.isArray(option.allowedMedia) ||
    !option.allowedMedia.every((item) => typeof item === "string") ||
    typeof option.attributionRequired !== "boolean" ||
    typeof option.exclusive !== "boolean" ||
    typeof option.requiresApproval !== "boolean" ||
    typeof option.includesTrackDownload !== "boolean"
  ) {
    throw new TypeError("The stored license terms snapshot is invalid.");
  }
}

function assertIntendedUseSnapshot(
  value: unknown,
): asserts value is LicenseIntendedUseSnapshot {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.licenseeName !== "string" ||
    typeof value.projectTitle !== "string" ||
    typeof value.intendedUse !== "string" ||
    typeof value.projectDescription !== "string"
  ) {
    throw new TypeError("The stored intended-use snapshot is invalid.");
  }
}

export function parseLicenseTermsSnapshotJson(
  value: string,
): LicenseTermsSnapshot {
  const parsed: unknown = JSON.parse(value);
  assertTermsSnapshot(parsed);
  return freezeLicenseTermsSnapshot(parsed);
}

export function parseLicenseIntendedUseSnapshotJson(
  value: string,
): LicenseIntendedUseSnapshot {
  const parsed: unknown = JSON.parse(value);
  assertIntendedUseSnapshot(parsed);
  return freezeLicenseIntendedUseSnapshot(parsed);
}

function line(label: string, value: string | number | null): string {
  return `${label}: ${value === null ? "None" : String(value)}`;
}

/**
 * Produces a deterministic text view of already-approved artist terms.
 * The projection is not stored and performs no file or media operation.
 */
export function projectLicenseDocumentText(
  input: LicenseDocumentProjectionInput,
): string {
  const { termsSnapshot, intendedUseSnapshot } = input;
  const option = termsSnapshot.option;
  return [
    termsSnapshot.terms.title,
    "",
    line("License ID", input.issuedLicenseId),
    line("Issued", input.issuedAt),
    line("Expires", input.expiresAt),
    line("Track", termsSnapshot.track.title),
    line("Licensee", intendedUseSnapshot.licenseeName),
    line("Project", intendedUseSnapshot.projectTitle),
    line("Intended use", intendedUseSnapshot.intendedUse),
    line("License option", option.label),
    line("Usage category", option.usageCategory),
    line("Allowed media", option.allowedMedia.join(", ")),
    line("Territory", option.territory),
    line("Term months", option.termMonths),
    line("Attribution required", option.attributionRequired ? "Yes" : "No"),
    line("Attribution", option.attributionText),
    "",
    termsSnapshot.terms.introduction,
    "",
    termsSnapshot.terms.generalTerms,
    "",
    termsSnapshot.terms.disclaimer,
    "",
  ].join("\n");
}
