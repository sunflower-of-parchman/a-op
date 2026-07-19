import {
  readArtworkDelivery,
  readTrackDownloadDelivery,
  readTrackStreamDelivery,
} from "@/db/catalog-media.ts";
import { readAccessFacts } from "@/db/access-read.ts";
import { recordSuccessfulDownload } from "@/db/download-events.ts";
import { recordMediaOperationalFailure } from "@/db/operational-failures-write.ts";
import { decideAccess } from "@/lib/access/decide-access.ts";
import {
  hasApplicationRole,
  type ApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import { createR2MediaStore } from "@/lib/media/r2-store.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import {
  createMediaResponse,
  createMediaResponsePlan,
  parseByteRange,
} from "@/lib/media/range.ts";
import { REQUEST_ID_HEADER, RuntimeError } from "@/lib/runtime/index.ts";
import type { TelemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

function unavailable(): RuntimeError {
  return new RuntimeError("MEDIA_NOT_FOUND", "Media is not available.", {
    status: 404,
    publicMessage: "That media is not available.",
  });
}

function denied(action: "stream" | "download"): RuntimeError {
  return new RuntimeError("ACCESS_DENIED", "Media access was denied.", {
    status: 403,
    publicMessage:
      action === "stream"
        ? "This account cannot stream that track."
        : "This account cannot download that track.",
  });
}

type DeliveryFailureCode = Parameters<
  typeof recordMediaOperationalFailure
>[1]["code"];

async function recordDeliveryFailure(input: {
  readonly binding: D1Database;
  readonly code: DeliveryFailureCode;
  readonly derivativeId: string;
  readonly requestId: string;
}): Promise<void> {
  try {
    await recordMediaOperationalFailure(input.binding, {
      code: input.code,
      requestId: input.requestId,
      subjectType: "media-derivative",
      subjectId: input.derivativeId,
    });
  } catch {
    // Operational evidence cannot replace the original media response.
  }
}

async function readMediaStorage<T>(input: {
  readonly binding: D1Database;
  readonly derivativeId: string;
  readonly requestId: string;
  readonly read: () => Promise<T>;
}): Promise<T> {
  try {
    return await input.read();
  } catch (error) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_STORAGE_READ_FAILED",
      derivativeId: input.derivativeId,
      requestId: input.requestId,
    });
    throw error;
  }
}

async function editorDeliveryAllowed(input: {
  readonly binding: D1Database;
  readonly identity: ApplicationIdentity | null;
  readonly trackSlug: string;
  readonly sourceMediaId: string;
}): Promise<boolean> {
  return input.identity !== null && hasApplicationRole(input.identity, "editor")
    ? (await hasEditorPermission(input.binding, input.identity.userId, {
        permissionKey: "catalog.write",
        scopeId: input.trackSlug,
      })) ||
        (await hasEditorPermission(input.binding, input.identity.userId, {
          permissionKey: "media.write",
          scopeId: input.sourceMediaId,
        }))
    : false;
}

export async function deliverTrackStream(input: {
  readonly binding: D1Database;
  readonly bucket: R2Bucket;
  readonly request: Request;
  readonly requestId: string;
  readonly trackId: string;
  readonly requestedRevisionId: string | null;
  readonly identity: ApplicationIdentity | null;
}): Promise<Response> {
  const record = await readTrackStreamDelivery(
    input.binding,
    input.trackId,
    input.requestedRevisionId,
  );
  if (!record) throw unavailable();

  const editorAllowed = await editorDeliveryAllowed({
    binding: input.binding,
    identity: input.identity,
    trackSlug: record.trackSlug,
    sourceMediaId: record.sourceMediaId,
  });
  const now = new Date().toISOString();
  const accessFacts =
    record.streamMode === "protected"
      ? await readAccessFacts(input.binding, {
          identity: input.identity
            ? { userId: input.identity.userId, roles: input.identity.roles }
            : null,
          resourceType: "track",
          resourceId: record.trackId,
          action: "stream",
          now,
        })
      : null;
  const decision = await decideAccess({
    identity: input.identity
      ? { userId: input.identity.userId, roles: input.identity.roles }
      : null,
    resourceType: "track",
    resourceId: record.trackId,
    action: "stream",
    now,
    facts: {
      publicActions: record.streamMode === "public" ? ["stream"] : [],
      accountActions: record.streamMode === "account" ? ["stream"] : [],
      editorActions: editorAllowed ? ["stream"] : [],
      grants: accessFacts?.facts.grants ?? [],
    },
  });
  if (!decision.allowed) throw denied("stream");

  const rangeDecision = parseByteRange(
    input.request.headers.get("range"),
    record.byteLength,
  );
  const plan = createMediaResponsePlan(rangeDecision, {
    contentType: record.contentType,
  });
  plan.headers.set("cache-control", "no-store");
  plan.headers.set(REQUEST_ID_HEADER, input.requestId);
  plan.headers.set("x-aop-access-source", decision.source);
  if (plan.status === 416) return createMediaResponse(plan, null);

  const store = createR2MediaStore(input.bucket);
  const metadata = await readMediaStorage({
    binding: input.binding,
    derivativeId: record.derivativeId,
    requestId: input.requestId,
    read: () => store.head(record.objectKey),
  });
  if (!metadata) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_OBJECT_MISSING",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw unavailable();
  }
  if (
    metadata.byteLength !== record.byteLength ||
    metadata.contentType !== record.contentType
  ) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_METADATA_MISMATCH",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw new RuntimeError(
      "MEDIA_METADATA_MISMATCH",
      "Stored media metadata does not match the approved D1 record.",
      { status: 500, publicMessage: "That media is temporarily unavailable." },
    );
  }
  const object = await readMediaStorage({
    binding: input.binding,
    derivativeId: record.derivativeId,
    requestId: input.requestId,
    read: () =>
      plan.readRange
        ? store.getRange(record.objectKey, plan.readRange)
        : store.get(record.objectKey),
  });
  if (!object) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_OBJECT_MISSING",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw unavailable();
  }
  return createMediaResponse(plan, object.body);
}

export async function deliverTrackDownload(input: {
  readonly binding: D1Database;
  readonly bucket: R2Bucket;
  readonly requestId: string;
  readonly trackId: string;
  readonly requestedRevisionId: string | null;
  readonly identity: ApplicationIdentity | null;
  readonly telemetry?: TelemetryMutationRequestContext;
}): Promise<Response> {
  await requireActiveModule(input.binding, "downloads");
  const record = await readTrackDownloadDelivery(
    input.binding,
    input.trackId,
    input.requestedRevisionId,
  );
  if (!record) throw unavailable();

  const editorAllowed = await editorDeliveryAllowed({
    binding: input.binding,
    identity: input.identity,
    trackSlug: record.trackSlug,
    sourceMediaId: record.sourceMediaId,
  });
  const now = new Date().toISOString();
  const accessFacts =
    record.downloadMode === "protected"
      ? await readAccessFacts(input.binding, {
          identity: input.identity
            ? { userId: input.identity.userId, roles: input.identity.roles }
            : null,
          resourceType: "track",
          resourceId: record.trackId,
          action: "download",
          now,
        })
      : null;
  const decision = await decideAccess({
    identity: input.identity
      ? { userId: input.identity.userId, roles: input.identity.roles }
      : null,
    resourceType: "track",
    resourceId: record.trackId,
    action: "download",
    now,
    facts: {
      publicActions: record.downloadMode === "public" ? ["download"] : [],
      accountActions: record.downloadMode === "account" ? ["download"] : [],
      editorActions: editorAllowed ? ["download"] : [],
      grants: accessFacts?.facts.grants ?? [],
    },
  });
  if (!decision.allowed) throw denied("download");

  const store = createR2MediaStore(input.bucket);
  const metadata = await readMediaStorage({
    binding: input.binding,
    derivativeId: record.derivativeId,
    requestId: input.requestId,
    read: () => store.head(record.objectKey),
  });
  if (!metadata) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_OBJECT_MISSING",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw unavailable();
  }
  if (
    metadata.byteLength !== record.byteLength ||
    metadata.contentType !== record.contentType
  ) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_METADATA_MISMATCH",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw new RuntimeError(
      "MEDIA_METADATA_MISMATCH",
      "Stored media metadata does not match the approved D1 record.",
      { status: 500, publicMessage: "That media is temporarily unavailable." },
    );
  }
  const object = await readMediaStorage({
    binding: input.binding,
    derivativeId: record.derivativeId,
    requestId: input.requestId,
    read: () => store.get(record.objectKey),
  });
  if (!object) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_OBJECT_MISSING",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw unavailable();
  }

  await recordSuccessfulDownload(input.binding, {
    userId: input.identity?.userId ?? null,
    resourceType: "track",
    resourceId: record.trackId,
    mediaDerivativeId: record.derivativeId,
    entitlementId: decision.entitlementId ?? null,
    accessSource: decision.source,
    byteLength: record.byteLength,
    requestId: input.requestId,
    deliveredAt: now,
    protectedDelivery: record.downloadMode === "protected",
    telemetry: input.telemetry,
  });

  const disposition = decision.downloadDisposition ?? "attachment";
  return new Response(object.body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": `${disposition}; filename="${record.filename}"`,
      "content-length": String(record.byteLength),
      "content-type": record.contentType,
      [REQUEST_ID_HEADER]: input.requestId,
      "x-aop-access-source": decision.source,
    },
  });
}

export async function deliverArtwork(input: {
  readonly binding: D1Database;
  readonly bucket: R2Bucket;
  readonly derivativeId: string;
  readonly requestId: string;
}): Promise<Response> {
  const record = await readArtworkDelivery(input.binding, input.derivativeId);
  if (!record) throw unavailable();
  const store = createR2MediaStore(input.bucket);
  const metadata = await readMediaStorage({
    binding: input.binding,
    derivativeId: record.derivativeId,
    requestId: input.requestId,
    read: () => store.head(record.objectKey),
  });
  if (!metadata) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_OBJECT_MISSING",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw unavailable();
  }
  if (
    metadata.byteLength !== record.byteLength ||
    metadata.contentType !== record.contentType
  ) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_METADATA_MISMATCH",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw unavailable();
  }
  const object = await readMediaStorage({
    binding: input.binding,
    derivativeId: record.derivativeId,
    requestId: input.requestId,
    read: () => store.get(record.objectKey),
  });
  if (!object) {
    await recordDeliveryFailure({
      binding: input.binding,
      code: "MEDIA_OBJECT_MISSING",
      derivativeId: record.derivativeId,
      requestId: input.requestId,
    });
    throw unavailable();
  }
  return new Response(object.body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-length": String(record.byteLength),
      "content-type": record.contentType,
      [REQUEST_ID_HEADER]: input.requestId,
    },
  });
}
