import { createArchiveSha256, createSemanticFingerprint } from "./canonical.ts";
import {
  ARTIST_EXPORT_ARCHIVE_MEDIA_TYPE,
  serializeArtistExportArchive,
  verifyArtistExportArchive,
} from "./archive.ts";
import { PORTABILITY_ERROR_CODES, PortabilityError } from "./errors.ts";
import {
  PORTABLE_DOCUMENT_NAMES,
  type ArtistExportArchive,
  type D1ArtistRestoreAdapter,
  type PortableRecord,
  type R2ArtistExportArchiveAdapter,
  type VerifiedArtistExportArchive,
} from "./types.ts";

function recordCount(verified: VerifiedArtistExportArchive): number {
  return PORTABLE_DOCUMENT_NAMES.reduce(
    (total, document) => total + verified.snapshot[document].length,
    0,
  );
}

export async function applyVerifiedArtistExportToD1(
  verified: VerifiedArtistExportArchive,
  adapter: D1ArtistRestoreAdapter,
): Promise<{
  readonly inserted: number;
  readonly reused: number;
  readonly total: number;
}> {
  const transaction = await adapter.beginDisposableRestore();
  let inserted = 0;
  let reused = 0;
  try {
    for (const document of PORTABLE_DOCUMENT_NAMES) {
      for (const record of verified.snapshot[document]) {
        const outcome = await transaction.putPortableRecord(document, record, {
          semanticFingerprint: verified.semanticFingerprint,
          commerceBindingState: "pending",
          externalVideoBindingState: "pending",
        });
        if (outcome === "inserted") inserted += 1;
        else reused += 1;
      }
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return { inserted, reused, total: recordCount(verified) };
}

export async function assertRestoredArtistEquivalence(
  verified: VerifiedArtistExportArchive,
  adapter: D1ArtistRestoreAdapter,
): Promise<void> {
  const restored = await adapter.readRestoredSnapshot();
  const fingerprint = await createSemanticFingerprint(restored);
  if (fingerprint !== verified.semanticFingerprint) {
    throw new PortabilityError(
      PORTABILITY_ERROR_CODES.RESTORE_CONFLICT,
      "The disposable restore does not reproduce the exported artist definitions.",
      "$.restore.semanticFingerprint",
    );
  }
}

export async function storeArtistExportWithR2Adapter(
  archive: ArtistExportArchive,
  exportId: string,
  adapter: R2ArtistExportArchiveAdapter,
): Promise<{
  readonly exportId: string;
  readonly sha256: string;
  readonly byteLength: number;
}> {
  const verified = await verifyArtistExportArchive(archive);
  const bytes = serializeArtistExportArchive(verified.archive);
  const sha256 = await createArchiveSha256(verified.archive);
  const result = await adapter.putArtistArchive({
    exportId,
    contentType: ARTIST_EXPORT_ARCHIVE_MEDIA_TYPE,
    byteLength: bytes.byteLength,
    sha256,
    bytes,
  });
  return { exportId: result.exportId, sha256, byteLength: bytes.byteLength };
}

export function portableRecordIdentity(record: PortableRecord): string {
  return `${record.entity}:${record.id}`;
}
