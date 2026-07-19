import {
  canonicalArchiveJson,
  canonicalJson,
  createArchiveSha256,
  createSemanticFingerprint,
  normalizeArtistInstallationSnapshot,
  portableDocumentPath,
  sha256Hex,
} from "./canonical.ts";
import { PORTABILITY_ERROR_CODES, PortabilityError } from "./errors.ts";
import {
  ARTIST_EXPORT_DOCUMENT_SCHEMA_VERSION,
  ARTIST_EXPORT_FORMAT,
  ARTIST_EXPORT_FORMAT_VERSION,
  PORTABLE_DOCUMENT_NAMES,
  type ArtistExportArchive,
  type ArtistExportArchiveEntry,
  type ArtistExportDocument,
  type ArtistExportManifest,
  type ArtistExportManifestEntry,
  type ArtistExportRecoveryDocument,
  type ArtistInstallationSnapshot,
  type D1ArtistExportSourceAdapter,
  type PortableDocumentName,
  type VerifiedArtistExportArchive,
} from "./types.ts";
import {
  assertPortableSafeString,
  validateArtistInstallationSnapshot,
} from "./validation.ts";

export const RECOVERY_DOCUMENT_PATH = "recovery/instructions.json" as const;
export const ARTIST_EXPORT_ARCHIVE_MEDIA_TYPE =
  "application/vnd.a-op.artist-export+json" as const;

const EXPECTED_PATHS = Object.freeze([
  ...PORTABLE_DOCUMENT_NAMES.map(portableDocumentPath),
  RECOVERY_DOCUMENT_PATH,
]);
const EXPECTED_PATH_SET = new Set(EXPECTED_PATHS);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

const RECOVERY_INSTRUCTIONS = [
  "Verify every manifest checksum before restore.",
  "Restore only into an exact disposable local target.",
  "Review and bind commerce prices after restore; no provider identifier is portable.",
  "Review and bind external video after restore; no provider identifier is portable.",
  "Publish media bytes separately from artist-approved sources.",
] as const;

export const ARTIST_EXPORT_RECOVERY_DOCUMENT: ArtistExportRecoveryDocument =
  Object.freeze({
    schemaVersion: ARTIST_EXPORT_DOCUMENT_SCHEMA_VERSION,
    restoreMode: "disposable-local-rehearsal",
    commerceBindingState: "pending",
    externalVideoBindingState: "pending",
    installationDefinitionsOnly: true,
    mediaBytesIncluded: false,
    instructions: Object.freeze(RECOVERY_INSTRUCTIONS),
  });

function fail(
  code: (typeof PORTABILITY_ERROR_CODES)[keyof typeof PORTABILITY_ERROR_CODES],
  message: string,
  location: string,
): never {
  throw new PortabilityError(code, message, location);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  location: string,
): void {
  const expected = new Set(keys);
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !expected.has(key))
  ) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "The archive structure does not match the versioned format.",
      location,
    );
  }
}

function readBoundedString(
  value: unknown,
  location: string,
  maximumLength = 100_000,
): string {
  if (typeof value !== "string" || value.length > maximumLength) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Expected a bounded string.",
      location,
    );
  }
  assertPortableSafeString(value, location);
  return value;
}

function readSha256(value: unknown, location: string, message: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(PORTABILITY_ERROR_CODES.FORMAT_INVALID, message, location);
  }
  return value;
}

function readBoundedJsonText(
  value: unknown,
  location: string,
  maximumLength: number,
): string {
  if (typeof value !== "string" || value.length > maximumLength) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Expected bounded JSON text.",
      location,
    );
  }
  return value;
}

function assertSafeArchivePath(path: string, location: string): void {
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\u0000") ||
    path.split("/").some((segment) => segment === "." || segment === "..") ||
    !/^[a-z0-9][a-z0-9./-]*\.json$/.test(path)
  ) {
    fail(
      PORTABILITY_ERROR_CODES.ENTRY_PATH_INVALID,
      "Archive paths must be fixed, relative JSON paths without traversal.",
      location,
    );
  }
}

async function makeEntry(
  path: string,
  document: ArtistExportDocument | ArtistExportRecoveryDocument,
): Promise<{
  file: ArtistExportArchiveEntry;
  manifest: ArtistExportManifestEntry;
}> {
  const text = canonicalJson(document);
  return {
    file: { path, kind: "file", mediaType: "application/json", text },
    manifest: {
      path,
      mediaType: "application/json",
      byteLength: new TextEncoder().encode(text).byteLength,
      sha256: await sha256Hex(text),
    },
  };
}

export async function readSnapshotFromD1Adapter(
  adapter: D1ArtistExportSourceAdapter,
): Promise<ArtistInstallationSnapshot> {
  const snapshot = Object.fromEntries(
    await Promise.all(
      PORTABLE_DOCUMENT_NAMES.map(async (document) => [
        document,
        await adapter.readPortableRecords(document),
      ]),
    ),
  ) as unknown as ArtistInstallationSnapshot;
  return validateArtistInstallationSnapshot(snapshot);
}

export async function createArtistExportArchive(
  snapshotInput: ArtistInstallationSnapshot,
  options: {
    readonly applicationSchemaVersion: number;
    readonly createdAt: string;
  },
): Promise<ArtistExportArchive> {
  if (
    !Number.isSafeInteger(options.applicationSchemaVersion) ||
    options.applicationSchemaVersion < 1
  ) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Application schema version must be positive.",
      "$.applicationSchemaVersion",
    );
  }
  if (!ISO_INSTANT.test(options.createdAt)) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Archive creation time must be a UTC ISO instant.",
      "$.createdAt",
    );
  }

  const validated = validateArtistInstallationSnapshot(snapshotInput);
  const snapshot = normalizeArtistInstallationSnapshot(validated);
  const semanticFingerprint = await createSemanticFingerprint(snapshot);
  const generated = await Promise.all([
    ...PORTABLE_DOCUMENT_NAMES.map((document) =>
      makeEntry(portableDocumentPath(document), {
        schemaVersion: ARTIST_EXPORT_DOCUMENT_SCHEMA_VERSION,
        records: snapshot[document],
      }),
    ),
    makeEntry(RECOVERY_DOCUMENT_PATH, ARTIST_EXPORT_RECOVERY_DOCUMENT),
  ]);

  const manifest: ArtistExportManifest = {
    format: ARTIST_EXPORT_FORMAT,
    formatVersion: ARTIST_EXPORT_FORMAT_VERSION,
    applicationSchemaVersion: options.applicationSchemaVersion,
    createdAt: options.createdAt,
    semanticFingerprint,
    entries: generated.map(({ manifest: entry }) => entry),
  };

  return {
    manifest,
    files: generated.map(({ file }) => file),
  };
}

function parseManifestEntry(
  value: unknown,
  location: string,
): ArtistExportManifestEntry {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Expected a manifest entry.",
      location,
    );
  }
  exactKeys(value, ["path", "mediaType", "byteLength", "sha256"], location);
  const path = readBoundedString(value.path, `${location}.path`);
  assertSafeArchivePath(path, `${location}.path`);
  if (value.mediaType !== "application/json") {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Manifest entries must be JSON.",
      `${location}.mediaType`,
    );
  }
  if (!Number.isSafeInteger(value.byteLength) || Number(value.byteLength) < 1) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Manifest byte length must be positive.",
      `${location}.byteLength`,
    );
  }
  const sha256 = readSha256(
    value.sha256,
    `${location}.sha256`,
    "Manifest checksums must be lowercase SHA-256 values.",
  );
  return {
    path,
    mediaType: "application/json",
    byteLength: Number(value.byteLength),
    sha256,
  };
}

function parseManifest(value: unknown): ArtistExportManifest {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Expected an export manifest.",
      "$.manifest",
    );
  }
  exactKeys(
    value,
    [
      "format",
      "formatVersion",
      "applicationSchemaVersion",
      "createdAt",
      "semanticFingerprint",
      "entries",
    ],
    "$.manifest",
  );
  if (
    value.format !== ARTIST_EXPORT_FORMAT ||
    value.formatVersion !== ARTIST_EXPORT_FORMAT_VERSION
  ) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "The export format version is not supported.",
      "$.manifest.formatVersion",
    );
  }
  if (
    !Number.isSafeInteger(value.applicationSchemaVersion) ||
    Number(value.applicationSchemaVersion) < 1
  ) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "The application schema version is invalid.",
      "$.manifest.applicationSchemaVersion",
    );
  }
  const createdAt = readBoundedString(value.createdAt, "$.manifest.createdAt");
  if (!ISO_INSTANT.test(createdAt)) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "The manifest creation time is invalid.",
      "$.manifest.createdAt",
    );
  }
  const semanticFingerprint = readSha256(
    value.semanticFingerprint,
    "$.manifest.semanticFingerprint",
    "The semantic fingerprint is invalid.",
  );
  if (
    !Array.isArray(value.entries) ||
    value.entries.length !== EXPECTED_PATHS.length
  ) {
    fail(
      PORTABILITY_ERROR_CODES.ENTRY_SET_INVALID,
      "The manifest entry set is incomplete.",
      "$.manifest.entries",
    );
  }
  return {
    format: ARTIST_EXPORT_FORMAT,
    formatVersion: ARTIST_EXPORT_FORMAT_VERSION,
    applicationSchemaVersion: Number(value.applicationSchemaVersion),
    createdAt,
    semanticFingerprint,
    entries: value.entries.map((entry, index) =>
      parseManifestEntry(entry, `$.manifest.entries[${index}]`),
    ),
  };
}

function parseArchiveFile(
  value: unknown,
  location: string,
): ArtistExportArchiveEntry {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Expected an archive file.",
      location,
    );
  }
  exactKeys(value, ["path", "kind", "mediaType", "text"], location);
  const path = readBoundedString(value.path, `${location}.path`);
  assertSafeArchivePath(path, `${location}.path`);
  if (value.kind !== "file") {
    fail(
      PORTABILITY_ERROR_CODES.ENTRY_KIND_INVALID,
      "Only regular in-memory files are allowed; links are rejected.",
      `${location}.kind`,
    );
  }
  if (value.mediaType !== "application/json") {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Archive files must be JSON.",
      `${location}.mediaType`,
    );
  }
  const text = readBoundedJsonText(
    value.text,
    `${location}.text`,
    MAX_ARCHIVE_BYTES,
  );
  return { path, kind: "file", mediaType: "application/json", text };
}

function assertExactEntrySet(
  entries: readonly { readonly path: string }[],
  location: string,
): void {
  const paths = entries.map(({ path }) => path);
  if (
    new Set(paths).size !== paths.length ||
    paths.length !== EXPECTED_PATHS.length ||
    paths.some((path) => !EXPECTED_PATH_SET.has(path)) ||
    EXPECTED_PATHS.some((path) => !paths.includes(path))
  ) {
    fail(
      PORTABILITY_ERROR_CODES.ENTRY_SET_INVALID,
      "The archive must contain exactly the fixed versioned entry set.",
      location,
    );
  }
}

function parseJson(text: string, location: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "An archive JSON document is invalid.",
      location,
    );
  }
}

function parsePortableDocument(
  value: unknown,
  location: string,
): ArtistExportDocument {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Expected a portable definition document.",
      location,
    );
  }
  exactKeys(value, ["schemaVersion", "records"], location);
  if (
    value.schemaVersion !== ARTIST_EXPORT_DOCUMENT_SCHEMA_VERSION ||
    !Array.isArray(value.records)
  ) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "The portable document schema version is invalid.",
      location,
    );
  }
  return {
    schemaVersion: ARTIST_EXPORT_DOCUMENT_SCHEMA_VERSION,
    records: value.records as never,
  };
}

function assertRecoveryDocument(value: unknown): void {
  if (canonicalJson(value) !== canonicalJson(ARTIST_EXPORT_RECOVERY_DOCUMENT)) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Recovery instructions must match the versioned portable contract.",
      `$.files.${RECOVERY_DOCUMENT_PATH}`,
    );
  }
}

export async function verifyArtistExportArchive(
  value: unknown,
): Promise<VerifiedArtistExportArchive> {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "Expected an artist export archive.",
      "$",
    );
  }
  exactKeys(value, ["manifest", "files"], "$");
  const manifest = parseManifest(value.manifest);
  if (
    !Array.isArray(value.files) ||
    value.files.length !== EXPECTED_PATHS.length
  ) {
    fail(
      PORTABILITY_ERROR_CODES.ENTRY_SET_INVALID,
      "The archive file set is incomplete.",
      "$.files",
    );
  }
  const files = value.files.map((file, index) =>
    parseArchiveFile(file, `$.files[${index}]`),
  );
  assertExactEntrySet(manifest.entries, "$.manifest.entries");
  assertExactEntrySet(files, "$.files");
  if (
    manifest.entries.some(
      (entry, index) => entry.path !== EXPECTED_PATHS[index],
    )
  ) {
    fail(
      PORTABILITY_ERROR_CODES.ENTRY_SET_INVALID,
      "Manifest entries must use the canonical versioned order.",
      "$.manifest.entries",
    );
  }

  const manifestByPath = new Map(
    manifest.entries.map((entry) => [entry.path, entry]),
  );
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  for (const path of EXPECTED_PATHS) {
    const entry = manifestByPath.get(path)!;
    const file = fileByPath.get(path)!;
    const byteLength = new TextEncoder().encode(file.text).byteLength;
    const checksum = await sha256Hex(file.text);
    if (entry.byteLength !== byteLength || entry.sha256 !== checksum) {
      fail(
        PORTABILITY_ERROR_CODES.CHECKSUM_INVALID,
        "An archive document does not match its manifest checksum.",
        `$.files.${path}`,
      );
    }
  }

  const snapshotInput = {} as Record<PortableDocumentName, unknown>;
  for (const document of PORTABLE_DOCUMENT_NAMES) {
    const path = portableDocumentPath(document);
    const parsed = parsePortableDocument(
      parseJson(fileByPath.get(path)!.text, `$.files.${path}`),
      `$.files.${path}`,
    );
    snapshotInput[document] = parsed.records;
  }
  assertRecoveryDocument(
    parseJson(
      fileByPath.get(RECOVERY_DOCUMENT_PATH)!.text,
      `$.files.${RECOVERY_DOCUMENT_PATH}`,
    ),
  );

  const snapshot = validateArtistInstallationSnapshot(snapshotInput);
  const semanticFingerprint = await createSemanticFingerprint(snapshot);
  if (semanticFingerprint !== manifest.semanticFingerprint) {
    fail(
      PORTABILITY_ERROR_CODES.FINGERPRINT_INVALID,
      "The restored artist definitions do not match the manifest fingerprint.",
      "$.manifest.semanticFingerprint",
    );
  }

  const archive: ArtistExportArchive = { manifest, files };
  return {
    archive,
    snapshot: normalizeArtistInstallationSnapshot(snapshot),
    semanticFingerprint,
    archiveSha256: await createArchiveSha256(archive),
  };
}

export function serializeArtistExportArchive(
  archive: ArtistExportArchive,
): Uint8Array {
  return new TextEncoder().encode(canonicalArchiveJson(archive));
}

export function parseArtistExportArchiveBytes(bytes: Uint8Array): unknown {
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "The archive byte length is outside its contract.",
      "$",
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(
      PORTABILITY_ERROR_CODES.FORMAT_INVALID,
      "The archive must be UTF-8 JSON.",
      "$",
    );
  }
  return parseJson(text, "$");
}
