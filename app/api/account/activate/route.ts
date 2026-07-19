import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { activateCustomer } from "@/db/customer-activation.ts";
import {
  readJsonMutation,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

function requireEmptyInput(input: unknown): void {
  const valid =
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.getPrototypeOf(input) === Object.prototype &&
    Object.keys(input).length === 0;
  if (valid) return;

  throw new RuntimeError(
    "INVALID_INPUT",
    "Customer activation requires an exact empty JSON object.",
    {
      status: 400,
      publicMessage: "Submit customer activation without account details.",
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(
    "account.customer_activation_failed",
    async (requestId) => {
      requireEmptyInput(await readJsonMutation(request));
      const idempotencyKey = requireIdempotencyKey(request);
      const authenticatedUser = await getChatGPTUser();
      if (!authenticatedUser) {
        throw new RuntimeError(
          "AUTHENTICATION_REQUIRED",
          "Customer activation requires an authenticated ChatGPT identity.",
          { status: 401, publicMessage: "Sign in to continue." },
        );
      }

      const mutation = await activateCustomer(
        env.DB,
        {
          email: authenticatedUser.email,
          displayName:
            authenticatedUser.fullName ?? authenticatedUser.displayName,
        },
        { idempotencyKey, requestId },
      );

      return apiJson(
        { result: mutation.value, replayed: mutation.replayed },
        requestId,
        mutation.replayed ? 200 : 201,
      );
    },
  );
}
