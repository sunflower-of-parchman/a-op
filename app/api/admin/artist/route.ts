import { env } from "cloudflare:workers";
import { saveArtistDraft } from "@/db/artist-state-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { validateArtistRevisionInput } from "@/lib/site/validation.ts";

export const dynamic = "force-dynamic";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function invalidInput(message: string, details?: unknown): RuntimeError {
  return new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide valid artist information for this change.",
    ...(details === undefined ? {} : { details }),
  });
}

function readExpectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw invalidInput("Artist expectedVersion must be a positive integer.");
  }
  return value as number;
}

export async function PUT(request: Request): Promise<Response> {
  return runApiRoute("admin.artist_draft_failed", async (requestId) => {
    const input = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);

    if (
      !isPlainRecord(input) ||
      !hasExactKeys(input, ["artist", "expectedVersion"])
    ) {
      throw invalidInput(
        "Artist draft input must contain artist and expectedVersion.",
      );
    }

    const expectedVersion = readExpectedVersion(input.expectedVersion);
    const validated = validateArtistRevisionInput(input.artist);
    if (!validated.ok) {
      throw invalidInput("Artist draft input is invalid.", {
        issues: validated.issues,
      });
    }

    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const mutation = await saveArtistDraft(
      env.DB,
      validated.value,
      expectedVersion,
      {
        actorUserId: owner.userId,
        idempotencyKey,
        requestId,
      },
    );

    return apiJson(
      { result: mutation.value, replayed: mutation.replayed },
      requestId,
    );
  });
}
