import { env } from "cloudflare:workers";
import { readCustomerPlaylists } from "@/db/customer-read.ts";
import { createCustomerPlaylist } from "@/db/customer-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validatePlaylistCreateInput } from "@/lib/customer-library/validation.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import { requireCustomerLibraryInput } from "../customer-library-input.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute("account.playlists_read_failed", async (requestId) => {
    const identity = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "customer-library");
    const playlists = await readCustomerPlaylists(env.DB, identity.userId);
    return apiJson({ playlists }, requestId);
  });
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("account.playlist_create_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireCustomerLibraryInput(
      validatePlaylistCreateInput(requestInput),
      "Playlist creation",
    );
    const identity = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "customer-library");
    const result = await createCustomerPlaylist(env.DB, input, {
      actorUserId: identity.userId,
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
