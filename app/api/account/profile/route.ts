import { env } from "cloudflare:workers";
import { updateProfile } from "@/db/role-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { SITE_INPUT_LIMITS } from "@/lib/site/validation.ts";

export const dynamic = "force-dynamic";

function invalidInput(message: string): never {
  throw new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide valid information for this change.",
  });
}

function readProfileInput(input: unknown): {
  readonly displayName: string;
  readonly expectedRevision: number;
} {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  ) {
    return invalidInput("Profile update request must be a JSON object.");
  }

  const record = input as Record<string, unknown>;
  const unexpectedKeys = Object.keys(record).filter(
    (key) => key !== "displayName" && key !== "expectedRevision",
  );
  if (unexpectedKeys.length > 0) {
    return invalidInput("Profile update request contains unsupported fields.");
  }

  if (typeof record.displayName !== "string") {
    return invalidInput("Display name must be text.");
  }
  const displayName = record.displayName.replace(/\r\n?/g, "\n").trim();
  if (
    displayName.length === 0 ||
    displayName.length > SITE_INPUT_LIMITS.displayName
  ) {
    return invalidInput(
      `Display name must contain 1-${SITE_INPUT_LIMITS.displayName} characters.`,
    );
  }

  if (
    !Number.isSafeInteger(record.expectedRevision) ||
    (record.expectedRevision as number) < 1
  ) {
    return invalidInput("Expected revision must be a positive safe integer.");
  }

  return {
    displayName,
    expectedRevision: record.expectedRevision as number,
  };
}

export async function PUT(request: Request): Promise<Response> {
  return runApiRoute("account.profile_update_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = readProfileInput(requestInput);
    const identity = await requireApplicationAuthority(env.DB, [
      "owner",
      "editor",
      "customer",
    ]);
    const result = await updateProfile(
      env.DB,
      input.displayName,
      input.expectedRevision,
      {
        actorUserId: identity.userId,
        idempotencyKey,
        requestId,
      },
    );

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
    );
  });
}
