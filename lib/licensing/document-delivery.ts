import {
  LICENSE_DOCUMENT_CONTENT_TYPE,
  readLicenseDocumentWorkflowRecord,
  recordLicenseDocumentDelivery,
  requireLicenseDocumentId,
} from "@/db/license-document-workflow.ts";
import { readAccessFacts } from "@/db/access-read.ts";
import { decideAccess } from "@/lib/access/decide-access.ts";
import type { ApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { createR2MediaStore } from "@/lib/media/r2-store.ts";
import { REQUEST_ID_HEADER, RuntimeError } from "@/lib/runtime/index.ts";
import type { TelemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

function unavailable(): RuntimeError {
  return new RuntimeError(
    "LICENSE_DOCUMENT_NOT_AVAILABLE",
    "The license document is not ready for protected delivery.",
    {
      status: 404,
      publicMessage: "That license document is not available.",
    },
  );
}

function denied(): RuntimeError {
  return new RuntimeError(
    "ACCESS_DENIED",
    "License document access was denied.",
    {
      status: 403,
      publicMessage: "This account cannot download that license document.",
    },
  );
}

function filename(issuedLicenseId: string): string {
  return `a-op-license-${issuedLicenseId.replace(/[^a-z0-9._-]/gi, "-")}.txt`;
}

/**
 * Delivers one ready document through the same central entitlement decision as
 * every other protected resource. No R2 call occurs before that decision.
 */
export async function deliverLicenseDocument(input: {
  readonly binding: D1Database;
  readonly bucket: R2Bucket;
  readonly requestId: string;
  readonly licenseDocumentId: string;
  readonly identity: ApplicationIdentity | null;
  readonly telemetry?: TelemetryMutationRequestContext;
}): Promise<Response> {
  const documentId = requireLicenseDocumentId(input.licenseDocumentId);
  const record = await readLicenseDocumentWorkflowRecord(
    input.binding,
    documentId,
  );
  if (
    !record ||
    record.documentState !== "ready" ||
    record.jobStatus !== "complete" ||
    record.issuedLicenseState !== "active" ||
    record.media === null
  ) {
    throw unavailable();
  }

  const now = new Date().toISOString();
  const accessFacts = await readAccessFacts(input.binding, {
    identity: input.identity
      ? { userId: input.identity.userId, roles: input.identity.roles }
      : null,
    resourceType: "license-document",
    resourceId: documentId,
    action: "download",
    now,
  });
  const decision = await decideAccess({
    identity: input.identity
      ? { userId: input.identity.userId, roles: input.identity.roles }
      : null,
    resourceType: "license-document",
    resourceId: documentId,
    action: "download",
    now,
    facts: accessFacts.facts,
  });
  if (!decision.allowed) throw denied();

  const store = createR2MediaStore(input.bucket);
  const metadata = await store.head(record.media.objectKey);
  if (
    !metadata ||
    metadata.byteLength !== record.media.byteLength ||
    metadata.contentType !== LICENSE_DOCUMENT_CONTENT_TYPE
  ) {
    throw unavailable();
  }
  const object = await store.get(record.media.objectKey);
  if (
    !object ||
    object.byteLength !== record.media.byteLength ||
    object.contentType !== LICENSE_DOCUMENT_CONTENT_TYPE
  ) {
    throw unavailable();
  }

  if (!input.identity) throw denied();
  await recordLicenseDocumentDelivery(input.binding, {
    requestId: input.requestId,
    actorUserId: input.identity.userId,
    documentId,
    issuedLicenseId: record.issuedLicenseId,
    entitlementId: decision.entitlementId ?? null,
    accessSource: decision.source,
    contentDigest: record.media.contentDigest,
    byteLength: record.media.byteLength,
    deliveredAt: now,
    telemetry: input.telemetry,
  });

  return new Response(object.body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${filename(record.issuedLicenseId)}"`,
      "content-length": String(record.media.byteLength),
      "content-type": LICENSE_DOCUMENT_CONTENT_TYPE,
      [REQUEST_ID_HEADER]: input.requestId,
      "x-aop-access-source": decision.source,
      "x-aop-commerce-environment": "test",
    },
  });
}
