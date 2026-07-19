import { env } from "cloudflare:workers";
import { readCustomerFavorites } from "@/db/customer-read.ts";
import { setCustomerFavorite } from "@/db/customer-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateFavoriteDesiredStateInput } from "@/lib/customer-library/validation.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import { requireCustomerLibraryInput } from "../customer-library-input.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute("account.favorites_read_failed", async (requestId) => {
    const identity = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "customer-library");
    const favorites = await readCustomerFavorites(env.DB, identity.userId);
    return apiJson({ favorites }, requestId);
  });
}

export async function PUT(request: Request): Promise<Response> {
  return runApiRoute("account.favorite_update_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireCustomerLibraryInput(
      validateFavoriteDesiredStateInput(requestInput),
      "Favorite update",
    );
    const identity = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "customer-library");
    const result = await setCustomerFavorite(env.DB, input, {
      actorUserId: identity.userId,
      idempotencyKey,
      requestId,
      telemetry: telemetryMutationRequestContext(request),
    });

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
    );
  });
}
