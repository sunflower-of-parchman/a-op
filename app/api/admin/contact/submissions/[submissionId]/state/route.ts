import { env } from "cloudflare:workers";
import { changeContactSubmissionState } from "@/db/contact-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireContactId } from "@/lib/contact/index.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ submissionId: string }> },
): Promise<Response> {
  return runApiRoute("admin.contact_state_failed", async (requestId) => {
    const input = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const submissionId = requireContactId(
      (await context.params).submissionId,
      "Submission ID",
    );
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    await requireActiveModule(env.DB, "contact");
    const result = await changeContactSubmissionState(
      env.DB,
      submissionId,
      input,
      {
        actorUserId: owner.userId,
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
