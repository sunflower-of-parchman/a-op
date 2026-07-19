import {
  claimLicenseDocumentJob,
  failLicenseDocumentJob,
  finalizeLicenseDocumentJob,
  LICENSE_DOCUMENT_CONTENT_TYPE,
  readLicenseDocumentWorkflowRecord,
  readyLicenseDocumentReceipt,
  requireLicenseDocumentId,
  requireLicenseDocumentOwner,
  type LicenseDocumentReadyReceipt,
} from "@/db/license-document-workflow.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  type MutationContext,
  type MutationResult,
} from "@/db/mutation.ts";
import { createR2MediaStore } from "@/lib/media/r2-store.ts";
import { projectLicenseDocumentText } from "./snapshot.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const LEASE_DURATION_MS = 5 * 60 * 1_000;

export interface GenerateLicenseDocumentInput {
  readonly licenseDocumentId: string;
  readonly expectedRevision: number;
}

function validRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RuntimeError(
      "LICENSE_DOCUMENT_INPUT_INVALID",
      "A positive expected document revision is required.",
      {
        status: 400,
        publicMessage: "Reload the license document and try again.",
      },
    );
  }
  return value as number;
}

async function sha256(value: Uint8Array | string): Promise<string> {
  const source =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function renderedDocument(input: {
  readonly issuedLicenseId: string;
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly termsSnapshot: Parameters<
    typeof projectLicenseDocumentText
  >[0]["termsSnapshot"];
  readonly intendedUseSnapshot: Parameters<
    typeof projectLicenseDocumentText
  >[0]["intendedUseSnapshot"];
}): Uint8Array {
  const licenseText = projectLicenseDocumentText(input);
  return new TextEncoder().encode(
    [
      "Stripe Test Mode",
      "No real payment will be accepted.",
      "This is a simulated Build Week commerce record.",
      "",
      licenseText,
    ].join("\n"),
  );
}

function generationFailed(category: string): RuntimeError {
  return new RuntimeError(
    "LICENSE_DOCUMENT_GENERATION_FAILED",
    `License document generation failed: ${category}.`,
    {
      status: 503,
      publicMessage:
        "The license document could not be generated. Its job can be retried.",
    },
  );
}

/**
 * Claims, renders, stores, and finalizes one immutable license document.
 * The R2 key and bytes are deterministic, so a retry after an interrupted D1
 * finalization safely overwrites the same object with the same content.
 */
export async function generateLicenseDocument(
  binding: D1Database,
  bucket: R2Bucket,
  rawInput: GenerateLicenseDocumentInput,
  context: MutationContext,
): Promise<MutationResult<LicenseDocumentReadyReceipt>> {
  const licenseDocumentId = requireLicenseDocumentId(
    rawInput.licenseDocumentId,
  );
  const expectedRevision = validRevision(rawInput.expectedRevision);
  await requireLicenseDocumentOwner(binding, context.actorUserId);

  const mutation = await prepareMutation<LicenseDocumentReadyReceipt>(
    binding,
    "license.document.generate",
    context,
    { licenseDocumentId, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const record = await readLicenseDocumentWorkflowRecord(
    binding,
    licenseDocumentId,
  );
  if (!record) {
    throw new RuntimeError(
      "LICENSE_DOCUMENT_NOT_FOUND",
      "License document not found.",
      { status: 404, publicMessage: "That license document was not found." },
    );
  }
  if (record.documentState === "ready") {
    return { value: readyLicenseDocumentReceipt(record), replayed: true };
  }
  if (record.documentRevision !== expectedRevision) {
    throw new RuntimeError(
      "LICENSE_DOCUMENT_STALE",
      "The license document revision changed before generation.",
      {
        status: 409,
        publicMessage: "The license document changed. Reload and try again.",
      },
    );
  }

  const now = new Date();
  const claimedAt = now.toISOString();
  const leaseExpiresAt = new Date(
    now.valueOf() + LEASE_DURATION_MS,
  ).toISOString();
  const workerId = `license_document_worker_${crypto.randomUUID()}`;
  const leaseToken = `license_document_lease_${crypto.randomUUID()}`;
  const claimed = await claimLicenseDocumentJob(binding, {
    record,
    expectedRevision,
    actorUserId: context.actorUserId,
    operationKey: mutation.namespacedKey,
    workerId,
    leaseToken,
    claimedAt,
    leaseExpiresAt,
  });

  let failureCategory = "render_failed";
  try {
    const bytes = renderedDocument({
      issuedLicenseId: record.issuedLicenseId,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      termsSnapshot: record.termsSnapshot,
      intendedUseSnapshot: record.intendedUseSnapshot,
    });
    const [contentDigest, documentIdDigest] = await Promise.all([
      sha256(bytes),
      sha256(record.documentId),
    ]);
    const mediaObjectId = `license_document_media_${documentIdDigest.slice(0, 32)}`;
    const objectKey = `originals/${mediaObjectId}/v1`;
    const store = createR2MediaStore(bucket);
    failureCategory = "storage_write_failed";
    const stored = await store.put(objectKey, bytes, {
      contentType: LICENSE_DOCUMENT_CONTENT_TYPE,
    });
    if (
      stored.byteLength !== bytes.byteLength ||
      stored.contentType !== LICENSE_DOCUMENT_CONTENT_TYPE
    ) {
      failureCategory = "storage_metadata_mismatch";
      throw generationFailed(failureCategory);
    }
    failureCategory = "state_finalize_failed";
    const value = await finalizeLicenseDocumentJob(binding, {
      record,
      claimed,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      operationKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      workerId,
      leaseToken,
      mediaObjectId,
      objectKey,
      contentDigest,
      byteLength: bytes.byteLength,
      completedAt: new Date().toISOString(),
    });
    return { value, replayed: false };
  } catch (error) {
    try {
      return await replayAfterMutationFailure(binding, mutation, error);
    } catch {
      const current = await readLicenseDocumentWorkflowRecord(
        binding,
        licenseDocumentId,
      );
      if (current?.documentState === "ready") {
        return { value: readyLicenseDocumentReceipt(current), replayed: true };
      }
      await failLicenseDocumentJob(binding, {
        record,
        claimed,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        operationKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        workerId,
        leaseToken,
        failureCategory,
      });
      throw generationFailed(failureCategory);
    }
  }
}
