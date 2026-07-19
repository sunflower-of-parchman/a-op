import { env } from "cloudflare:workers";
import { publishArtistDraft } from "@/db/artist-state-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidInput(message: string): RuntimeError {
  return new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide a valid artist version for this change.",
  });
}

function readExpectedVersion(input: unknown): number {
  if (
    !isPlainRecord(input) ||
    Object.keys(input).length !== 1 ||
    !("expectedVersion" in input) ||
    !Number.isSafeInteger(input.expectedVersion) ||
    (input.expectedVersion as number) < 1
  ) {
    throw invalidInput(
      "Artist publication input must contain a positive expectedVersion integer.",
    );
  }
  return input.expectedVersion as number;
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.artist_publish_failed", async (requestId) => {
    const input = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const expectedVersion = readExpectedVersion(input);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const mutation = await publishArtistDraft(env.DB, expectedVersion, {
      actorUserId: owner.userId,
      idempotencyKey,
      requestId,
    });

    return apiJson(
      { result: mutation.value, replayed: mutation.replayed },
      requestId,
    );
  });
}
