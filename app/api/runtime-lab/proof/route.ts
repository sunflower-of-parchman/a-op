import { env } from "cloudflare:workers";
import { bootstrapD1Schema } from "@/db/bootstrap.ts";
import { readRuntimeProof, writeRuntimeProof } from "@/db/runtime-proofs.ts";
import { bootstrapFictionalRuntimeIdentities } from "@/lib/auth/runtime-fixtures.ts";
import {
  REQUEST_ID_HEADER,
  RuntimeError,
  createErrorResponse,
  createRequestId,
  resolveSimulationMode,
} from "@/lib/runtime/index.ts";
import { runtimeLogger } from "@/lib/runtime/server-logger.ts";

export const dynamic = "force-dynamic";

const RESTART_PROOF_KEY = "restart-proof";

function runtimeLabEnabled(): boolean {
  return resolveSimulationMode({
    AOP_RUNTIME_ENV: env.AOP_RUNTIME_ENV,
    AOP_SIMULATION_MODE: env.AOP_SIMULATION_MODE,
  }).enabled;
}

function unavailable(requestId: string): Response {
  return createErrorResponse(
    new RuntimeError("NOT_FOUND", "The runtime laboratory is unavailable.", {
      status: 404,
      publicMessage: "The requested resource was not found.",
    }),
    requestId,
  );
}

function success(body: unknown, requestId: string, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

async function errorResponse(
  error: unknown,
  requestId: string,
): Promise<Response> {
  runtimeLogger.write({
    level: "error",
    event: "runtime.proof_failed",
    requestId,
    error,
  });
  return createErrorResponse(error, requestId);
}

export async function GET(): Promise<Response> {
  const requestId = createRequestId();
  if (!runtimeLabEnabled()) return unavailable(requestId);

  try {
    const proof = await readRuntimeProof(env.DB, RESTART_PROOF_KEY);
    return success({ proof }, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = createRequestId();
  if (!runtimeLabEnabled()) return unavailable(requestId);

  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new RuntimeError("INVALID_INPUT", "Invalid runtime proof JSON.", {
        status: 400,
        publicMessage: "Provide a valid runtime proof value.",
      });
    }

    const value =
      typeof input === "object" &&
      input !== null &&
      "value" in input &&
      typeof input.value === "string"
        ? input.value
        : null;

    if (!value) {
      throw new RuntimeError("INVALID_INPUT", "Missing runtime proof value.", {
        status: 400,
        publicMessage: "Provide a valid runtime proof value.",
      });
    }

    await bootstrapD1Schema(env.DB);
    await bootstrapFictionalRuntimeIdentities(env.DB, requestId);
    const proof = await writeRuntimeProof(env.DB, RESTART_PROOF_KEY, value);

    return success({ proof }, requestId, 201);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
