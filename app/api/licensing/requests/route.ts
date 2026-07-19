import { env } from "cloudflare:workers";
import { submitLicenseRequest } from "@/db/licensing-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateLicenseRequestSubmitInput } from "@/lib/licensing/validation.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { requireLicensingInput } from "../licensing-input.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("licensing.request_submit_failed", async (requestId) => {
    const requestInput = requireLicensingInput(
      validateLicenseRequestSubmitInput(await readJsonMutation(request)),
      "License request",
    );
    const idempotencyKey = requireIdempotencyKey(request);
    const customer = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "licensing");
    const result = await submitLicenseRequest(env.DB, requestInput, {
      actorUserId: customer.userId,
      idempotencyKey,
      requestId,
    });

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.replayed ? 200 : 201,
    );
  });
}
