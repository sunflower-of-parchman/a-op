import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { bootstrapOwner } from "@/db/role-write.ts";
import {
  readJsonMutation,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { normalizeIdentityEmail } from "@/lib/auth/application-identity.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

function requireConfirmation(value: unknown): void {
  const valid =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === 1 &&
    "confirm" in value &&
    value.confirm === "bootstrap-owner";
  if (!valid) {
    throw new RuntimeError(
      "INVALID_INPUT",
      "Owner bootstrap requires an exact confirmation.",
      {
        status: 400,
        publicMessage: "Confirm the explicit owner bootstrap action.",
      },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("setup.owner_bootstrap_failed", async (requestId) => {
    requireConfirmation(await readJsonMutation(request));
    const idempotencyKey = requireIdempotencyKey(request);
    const authenticatedUser = await getChatGPTUser();
    if (!authenticatedUser) {
      throw new RuntimeError(
        "AUTHENTICATION_REQUIRED",
        "Owner bootstrap requires an authenticated ChatGPT identity.",
        { status: 401, publicMessage: "Sign in to continue." },
      );
    }

    const email = normalizeIdentityEmail(authenticatedUser.email);
    const approvedEmail = env.AOP_OWNER_BOOTSTRAP_EMAIL
      ? normalizeIdentityEmail(env.AOP_OWNER_BOOTSTRAP_EMAIL)
      : null;
    const approved = approvedEmail !== null && email === approvedEmail;
    if (!approved) {
      throw new RuntimeError(
        "OWNER_BOOTSTRAP_NOT_APPROVED",
        "The authenticated identity is not approved for owner bootstrap.",
        {
          status: 403,
          publicMessage:
            "Owner bootstrap has not been approved for this account.",
        },
      );
    }

    const mutation = await bootstrapOwner(
      env.DB,
      {
        email: authenticatedUser.email,
        displayName:
          authenticatedUser.fullName ?? authenticatedUser.displayName,
      },
      { actorUserId: "owner-bootstrap", idempotencyKey, requestId },
    );

    return apiJson(
      { result: mutation.value, replayed: mutation.replayed },
      requestId,
      mutation.replayed ? 200 : 201,
    );
  });
}
