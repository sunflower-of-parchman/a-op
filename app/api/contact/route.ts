import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { submitContactInquiry } from "@/db/contact-write.ts";
import {
  readJsonMutation,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("contact.submission_failed", async (requestId) => {
    const input = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    await requireActiveModule(env.DB, "contact");
    const authenticatedUser = await getChatGPTUser();
    const identity = authenticatedUser
      ? await resolveApplicationIdentity(env.DB, authenticatedUser)
      : null;
    const result = await submitContactInquiry(env.DB, input, {
      actorUserId: identity?.userId ?? null,
      idempotencyKey,
      requestId,
      telemetry: telemetryMutationRequestContext(request),
    });
    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.replayed ? 200 : 201,
    );
  });
}
