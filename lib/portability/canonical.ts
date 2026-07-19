import type {
  ArtistExportArchive,
  ArtistInstallationSnapshot,
  PortableDocumentName,
  PortableRecord,
} from "./types.ts";
import { PORTABLE_DOCUMENT_NAMES } from "./types.ts";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Portable JSON requires finite numbers.");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Portable JSON requires plain objects.");
    }

    return `{${Object.keys(value as Record<string, unknown>)
      .sort(compareText)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }

  throw new TypeError(
    "Portable JSON cannot contain undefined or non-JSON values.",
  );
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input.byteLength);
    bytes.set(input);
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function normalizePortableRecord(
  record: PortableRecord,
): PortableRecord {
  return {
    entity: record.entity,
    id: record.id,
    fields: [...record.fields]
      .map((field) => ({
        name: field.name,
        value: Array.isArray(field.value) ? [...field.value] : field.value,
      }))
      .sort((left, right) => compareText(left.name, right.name)),
    relations: [...record.relations]
      .map((relation) => ({ ...relation }))
      .sort((left, right) =>
        compareText(
          `${left.name}\u0000${left.targetEntity}\u0000${left.targetId}`,
          `${right.name}\u0000${right.targetEntity}\u0000${right.targetId}`,
        ),
      ),
  };
}

function normalizeDocument(
  records: readonly PortableRecord[],
): PortableRecord[] {
  return records
    .map(normalizePortableRecord)
    .sort((left, right) =>
      compareText(
        `${left.entity}\u0000${left.id}`,
        `${right.entity}\u0000${right.id}`,
      ),
    );
}

export function normalizeArtistInstallationSnapshot(
  snapshot: ArtistInstallationSnapshot,
): ArtistInstallationSnapshot {
  return Object.fromEntries(
    PORTABLE_DOCUMENT_NAMES.map((document) => [
      document,
      normalizeDocument(snapshot[document]),
    ]),
  ) as unknown as ArtistInstallationSnapshot;
}

export async function createSemanticFingerprint(
  snapshot: ArtistInstallationSnapshot,
): Promise<string> {
  return sha256Hex(
    canonicalJson(normalizeArtistInstallationSnapshot(snapshot)),
  );
}

export function canonicalArchiveJson(archive: ArtistExportArchive): string {
  return canonicalJson({
    manifest: archive.manifest,
    files: [...archive.files].sort((left, right) =>
      compareText(left.path, right.path),
    ),
  });
}

export async function createArchiveSha256(
  archive: ArtistExportArchive,
): Promise<string> {
  return sha256Hex(canonicalArchiveJson(archive));
}

export function portableDocumentPath(document: PortableDocumentName): string {
  return `definitions/${document}.json`;
}
