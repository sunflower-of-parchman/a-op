import { env } from "cloudflare:workers";
import { readCustomerPlaylist } from "@/db/customer-read.ts";
import {
  archiveCustomerPlaylist,
  replaceCustomerPlaylist,
} from "@/db/customer-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import {
  validatePlaylistArchiveInput,
  validatePlaylistReplacementInput,
} from "@/lib/customer-library/validation.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import {
  requireCustomerLibraryInput,
  requirePlaylistId,
} from "../../customer-library-input.ts";

export const dynamic = "force-dynamic";

interface PlaylistRouteContext {
  readonly params: Promise<{ playlistId: string }>;
}

async function requestedPlaylistId(
  context: PlaylistRouteContext,
): Promise<string> {
  return requirePlaylistId((await context.params).playlistId);
}

export async function GET(
  _request: Request,
  context: PlaylistRouteContext,
): Promise<Response> {
  return runApiRoute("account.playlist_read_failed", async (requestId) => {
    const playlistId = await requestedPlaylistId(context);
    const identity = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "customer-library");
    const playlist = await readCustomerPlaylist(
      env.DB,
      identity.userId,
      playlistId,
    );
    if (!playlist) {
      throw new RuntimeError("PLAYLIST_NOT_FOUND", "Playlist was not found.", {
        status: 404,
        publicMessage: "That playlist is not available.",
      });
    }
    return apiJson({ playlist }, requestId);
  });
}

export async function PUT(
  request: Request,
  context: PlaylistRouteContext,
): Promise<Response> {
  return runApiRoute("account.playlist_update_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireCustomerLibraryInput(
      validatePlaylistReplacementInput(requestInput),
      "Playlist update",
    );
    const playlistId = await requestedPlaylistId(context);
    const identity = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "customer-library");
    const result = await replaceCustomerPlaylist(env.DB, playlistId, input, {
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

export async function DELETE(
  request: Request,
  context: PlaylistRouteContext,
): Promise<Response> {
  return runApiRoute("account.playlist_archive_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireCustomerLibraryInput(
      validatePlaylistArchiveInput(requestInput),
      "Playlist archive",
    );
    const playlistId = await requestedPlaylistId(context);
    const identity = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "customer-library");
    const result = await archiveCustomerPlaylist(env.DB, playlistId, input, {
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
