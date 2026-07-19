import { env } from "cloudflare:workers";
import { saveNavigationSnapshot } from "@/db/artist-state-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { validateNavigationSnapshotInput } from "@/lib/site/validation.ts";

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
    publicMessage: "Provide valid navigation information for this change.",
    ...(details === undefined ? {} : { details }),
  });
}

function readExpectedRevisions(value: unknown): ExpectedRevisions {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["primary", "footer"]) ||
    !Number.isSafeInteger(value.primary) ||
    !Number.isSafeInteger(value.footer) ||
    (value.primary as number) < 1 ||
    (value.footer as number) < 1
  ) {
    throw invalidInput(
      "expectedRevisions must contain positive primary and footer integers.",
    );
  }

  return Object.freeze({
    primary: value.primary as number,
    footer: value.footer as number,
  });
}

export async function PUT(request: Request): Promise<Response> {
  return runApiRoute("admin.navigation_draft_failed", async (requestId) => {
    const input = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    if (
      !isPlainRecord(input) ||
      !hasExactKeys(input, ["expectedRevisions", "navigation"])
    ) {
      throw invalidInput(
        "Navigation input must contain expectedRevisions and navigation.",
      );
    }

    const expectedRevisions = readExpectedRevisions(input.expectedRevisions);
    const validated = validateNavigationSnapshotInput(input.navigation);
    if (!validated.ok) {
      throw invalidInput("Navigation snapshot input is invalid.", {
        issues: validated.issues,
      });
    }

    const [primaryInput, footerInput] = validated.value;
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const navigation = await saveNavigationSnapshot(
      env.DB,
      { primary: primaryInput.items, footer: footerInput.items },
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
