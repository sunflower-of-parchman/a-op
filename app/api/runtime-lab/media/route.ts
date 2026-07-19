import { env } from "cloudflare:workers";
import { bootstrapD1Schema } from "@/db/bootstrap.ts";
import {
  readMediaDeliveryRecord,
  removeMediaDeliveryRecord,
  upsertMediaDeliveryRecord,
} from "@/db/media-objects.ts";
import { decideAccess } from "@/lib/access/decide-access.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import {
  FICTIONAL_RUNTIME_IDENTITIES,
  bootstrapFictionalRuntimeIdentities,
} from "@/lib/auth/runtime-fixtures.ts";
import { createR2MediaStore } from "@/lib/media/r2-store.ts";
import {
  createMediaResponse,
  createMediaResponsePlan,
  parseByteRange,
} from "@/lib/media/range.ts";
import {
  REQUEST_ID_HEADER,
  RuntimeError,
  createErrorResponse,
  createRequestId,
  resolveSimulationMode,
} from "@/lib/runtime/index.ts";
import { runtimeLogger } from "@/lib/runtime/server-logger.ts";

export const dynamic = "force-dynamic";

const RUNTIME_MEDIA_ID = "media_runtime-range";
const RUNTIME_MEDIA_KEY = "runtime-lab/range-proof-v1";
const RUNTIME_MEDIA_CONTENT_TYPE = "text/plain; charset=utf-8";
const RUNTIME_MEDIA_BYTES = new TextEncoder().encode(
  "a-op runtime range proof",
);
const PERSONAS = ["anonymous", "customer", "editor", "owner"] as const;

type RuntimePersona = (typeof PERSONAS)[number];

function runtimeLabEnabled(): boolean {
  return resolveSimulationMode({
    AOP_RUNTIME_ENV: env.AOP_RUNTIME_ENV,
    AOP_SIMULATION_MODE: env.AOP_SIMULATION_MODE,
  }).enabled;
}

function runtimeError(
  code: string,
  message: string,
  status: number,
): RuntimeError {
  return new RuntimeError(code, message, {
    status,
    publicMessage: message,
  });
}

function unavailable(requestId: string): Response {
  return createErrorResponse(
    runtimeError("NOT_FOUND", "The requested resource was not found.", 404),
    requestId,
  );
}

function routeFailure(error: unknown, requestId: string): Response {
  runtimeLogger.write({
    level: "error",
    event: "runtime.media_failed",
    requestId,
    error: new RuntimeError(
      "RUNTIME_MEDIA_FAILED",
      "A runtime media operation failed.",
    ),
  });
  return createErrorResponse(error, requestId);
}

function personaFromRequest(request: Request): RuntimePersona | null {
  const value = new URL(request.url).searchParams.get("as") ?? "anonymous";
  return PERSONAS.includes(value as RuntimePersona)
    ? (value as RuntimePersona)
    : null;
}

async function identityForPersona(persona: RuntimePersona) {
  if (persona === "anonymous") return null;
  const fixture = FICTIONAL_RUNTIME_IDENTITIES[persona];
  return resolveApplicationIdentity(env.DB, {
    email: fixture.email,
    fullName: fixture.displayName,
    displayName: fixture.displayName,
  });
}

function safeJson(body: unknown, requestId: string, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function POST(): Promise<Response> {
  const requestId = createRequestId();
  if (!runtimeLabEnabled()) return unavailable(requestId);

  const store = createR2MediaStore(env.MEDIA);

  try {
    await bootstrapD1Schema(env.DB);
    await bootstrapFictionalRuntimeIdentities(env.DB, requestId);
    const metadata = await store.put(RUNTIME_MEDIA_KEY, RUNTIME_MEDIA_BYTES, {
      contentType: RUNTIME_MEDIA_CONTENT_TYPE,
    });

    try {
      await upsertMediaDeliveryRecord(env.DB, {
        id: RUNTIME_MEDIA_ID,
        objectKey: RUNTIME_MEDIA_KEY,
        visibility: "protected",
        ownerUserId: FICTIONAL_RUNTIME_IDENTITIES.owner.id,
        contentType: metadata.contentType,
        byteLength: metadata.byteLength,
      });
    } catch (error) {
      await store.remove(RUNTIME_MEDIA_KEY);
      throw error;
    }

    return safeJson(
      {
        media: {
          id: RUNTIME_MEDIA_ID,
          status: "ready",
          byteLength: metadata.byteLength,
          contentType: metadata.contentType,
        },
      },
      requestId,
      201,
    );
  } catch (error) {
    return routeFailure(error, requestId);
  }
}

export async function GET(request: Request): Promise<Response> {
  const requestId = createRequestId();
  if (!runtimeLabEnabled()) return unavailable(requestId);

  try {
    const persona = personaFromRequest(request);
    if (!persona) {
      return createErrorResponse(
        runtimeError("INVALID_INPUT", "Choose a valid runtime persona.", 400),
        requestId,
      );
    }

    const record = await readMediaDeliveryRecord(env.DB, RUNTIME_MEDIA_ID);
    if (!record) {
      return createErrorResponse(
        runtimeError("NOT_FOUND", "The media resource was not found.", 404),
        requestId,
      );
    }

    const identity = await identityForPersona(persona);
    const decision = await decideAccess({
      identity,
      resourceType: "media-stream",
      resourceId: record.id,
      action: "stream",
      now: new Date().toISOString(),
      facts: {
        publicActions: record.visibility === "public" ? ["view", "stream"] : [],
        editorActions: ["stream"],
        ...(record.ownerUserId
          ? {
              resourceOwnerUserId: record.ownerUserId,
              ownershipActions: ["stream"] as const,
            }
          : {}),
      },
    });

    if (!decision.allowed) {
      return safeJson(
        {
          error: {
            code: "ACCESS_DENIED",
            message: "Access denied.",
            requestId,
          },
          decision,
        },
        requestId,
        403,
      );
    }

    const store = createR2MediaStore(env.MEDIA);
    const metadata = await store.head(record.objectKey);
    if (!metadata) {
      return createErrorResponse(
        runtimeError("NOT_FOUND", "The media resource was not found.", 404),
        requestId,
      );
    }
    if (metadata.byteLength !== record.byteLength) {
      throw new Error("The media metadata does not match its stored bytes.");
    }

    const rangeDecision = parseByteRange(
      request.headers.get("range"),
      metadata.byteLength,
    );
    const responsePlan = createMediaResponsePlan(rangeDecision, {
      contentType: record.contentType,
    });
    responsePlan.headers.set("cache-control", "no-store");
    responsePlan.headers.set(REQUEST_ID_HEADER, requestId);
    responsePlan.headers.set("x-aop-access-source", decision.source);

    if (responsePlan.status === 416) {
      return createMediaResponse(responsePlan, null);
    }

    const object = responsePlan.readRange
      ? await store.getRange(record.objectKey, responsePlan.readRange)
      : await store.get(record.objectKey);

    if (!object) {
      return createErrorResponse(
        runtimeError("NOT_FOUND", "The media resource was not found.", 404),
        requestId,
      );
    }

    return createMediaResponse(responsePlan, object.body);
  } catch (error) {
    return routeFailure(error, requestId);
  }
}

export async function DELETE(): Promise<Response> {
  const requestId = createRequestId();
  if (!runtimeLabEnabled()) return unavailable(requestId);

  try {
    const record = await readMediaDeliveryRecord(env.DB, RUNTIME_MEDIA_ID);
    if (record) {
      await createR2MediaStore(env.MEDIA).remove(record.objectKey);
      await removeMediaDeliveryRecord(env.DB, record.id);
    }
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        [REQUEST_ID_HEADER]: requestId,
      },
    });
  } catch (error) {
    return routeFailure(error, requestId);
  }
}
