import { env } from "cloudflare:workers";
import { publishNavigationSnapshot } from "@/db/artist-state-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

interface ExpectedRevisions {
  readonly primary: number;
  readonly footer: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidInput(message: string): RuntimeError {
  return new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide valid navigation revisions for this change.",
  });
}

function readExpectedRevisions(input: unknown): ExpectedRevisions {
  if (
    !isPlainRecord(input) ||
    Object.keys(input).length !== 1 ||
    !isPlainRecord(input.expectedRevisions)
  ) {
    throw invalidInput(
      "Navigation publication input must contain expectedRevisions.",
    );
  }

  const revisions = input.expectedRevisions;
  const revisionKeys = Object.keys(revisions).sort();
  if (
    revisionKeys.length !== 2 ||
    revisionKeys[0] !== "footer" ||
    revisionKeys[1] !== "primary" ||
    !Number.isSafeInteger(revisions.primary) ||
    !Number.isSafeInteger(revisions.footer) ||
    (revisions.primary as number) < 1 ||
    (revisions.footer as number) < 1
  ) {
    throw invalidInput(
      "expectedRevisions must contain positive primary and footer integers.",
    );
  }

  return Object.freeze({
    primary: revisions.primary as number,
    footer: revisions.footer as number,
  });
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.navigation_publish_failed", async (requestId) => {
    const input = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const expectedRevisions = readExpectedRevisions(input);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const navigation = await publishNavigationSnapshot(
      env.DB,
      expectedRevisions,
      { actorUserId: owner.userId, idempotencyKey, requestId },
    );

    return apiJson(
      {
        result: navigation.value,
        replayed: navigation.replayed,
      },
      requestId,
    );
  });
}
