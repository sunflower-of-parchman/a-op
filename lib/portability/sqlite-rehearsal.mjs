import {
  parseArtistExportArchiveBytes,
  verifyArtistExportArchive,
} from "./archive.ts";
import {
  createSemanticFingerprint,
  normalizeArtistInstallationSnapshot,
} from "./canonical.ts";
import { PORTABILITY_ERROR_CODES, PortabilityError } from "./errors.ts";
import {
  countProjectedRecords,
  createMigratedApplicationDatabaseInMemory,
  inspectPendingRestoreState,
  projectApplicationSnapshot,
  restoreArtistInstallationSnapshotPass,
} from "./application-restore.mjs";

export async function rehearseArtistExportRestoreInMemory(archiveValue) {
  const verified = await verifyArtistExportArchive(archiveValue);
  const { database, migrations } =
    await createMigratedApplicationDatabaseInMemory();
  try {
    const firstPass = await restoreArtistInstallationSnapshotPass(
      database,
      verified.snapshot,
      1,
      { replaceSeedDefinitions: true },
    );
    const secondPass = await restoreArtistInstallationSnapshotPass(
      database,
      verified.snapshot,
      2,
    );
    const restored = normalizeArtistInstallationSnapshot(
      await projectApplicationSnapshot(database),
    );
    const restoredSemanticFingerprint =
      await createSemanticFingerprint(restored);
    if (restoredSemanticFingerprint !== verified.semanticFingerprint) {
      throw new PortabilityError(
        PORTABILITY_ERROR_CODES.RESTORE_CONFLICT,
        "The disposable application D1 restore is not semantically equivalent.",
        "$.restore.semanticFingerprint",
      );
    }

    const recordCount = countProjectedRecords(restored);
    if (
      firstPass.total !== recordCount ||
      firstPass.inserted !== recordCount ||
      secondPass.inserted !== 0 ||
      secondPass.reused !== recordCount
    ) {
      throw new PortabilityError(
        PORTABILITY_ERROR_CODES.DUPLICATE_RECORD,
        "The second application D1 restore pass did not reuse every existing definition.",
        "$.restore.secondPass",
      );
    }

    const foreignKeyViolations = database
      .prepare("PRAGMA foreign_key_check")
      .all();
    if (foreignKeyViolations.length !== 0) {
      throw new PortabilityError(
        PORTABILITY_ERROR_CODES.RESTORE_CONFLICT,
        "The disposable application D1 restore contains broken relations.",
        "$.restore.relations",
      );
    }
    const pendingState = inspectPendingRestoreState(database);

    return {
      semanticFingerprint: verified.semanticFingerprint,
      restoredSemanticFingerprint,
      recordCount,
      firstPass,
      secondPass,
      duplicateCount: 0,
      commerceBindingState: pendingState.commerceBindingState,
      externalVideoBindingState: pendingState.externalVideoBindingState,
      applicationSchemaRestored: true,
      migrationCount: migrations.length,
      foreignKeyViolationCount: 0,
      sourceObjectKeysRestored: pendingState.sourceObjectKeysRestored,
      mediaBytesRestored: pendingState.mediaBytesRestored,
    };
  } finally {
    database.close();
  }
}

export async function rehearseArtistExportBytesInMemory(bytes) {
  return rehearseArtistExportRestoreInMemory(
    parseArtistExportArchiveBytes(bytes),
  );
}
