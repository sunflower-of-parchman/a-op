import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { readCustomerFavoriteState } from "@/db/customer-read";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity";
import type { CustomerPlaylistDTO } from "@/lib/customer-library/types";
import { RuntimeError } from "@/lib/runtime";
import { TrackActions } from "./TrackActions";

export async function PublicTrackActions({
  artworkAlt,
  artworkUrl,
  downloadHref,
  licenseHref,
  playlists,
  productHref,
  trackHref,
  trackId,
  trackSubtitle,
  trackTitle,
}: {
  readonly artworkAlt: string | null;
  readonly artworkUrl: string | null;
  readonly downloadHref: string;
  readonly licenseHref: string;
  readonly playlists: readonly CustomerPlaylistDTO[];
  readonly productHref: string;
  readonly trackHref: string;
  readonly trackId: string;
  readonly trackSubtitle: string | null;
  readonly trackTitle: string;
}) {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const canSave = identity?.roles.includes("customer") === true;
  let favorite = null;

  if (canSave && identity) {
    try {
      favorite = await readCustomerFavoriteState(
        env.DB,
        identity.userId,
        "track",
        trackId,
      );
    } catch (error) {
      if (!(
        error instanceof RuntimeError && error.code === "MODULE_INACTIVE"
      )) {
        throw error;
      }
    }
  }

  return (
    <TrackActions
      artworkAlt={artworkAlt}
      artworkUrl={artworkUrl}
      canSave={canSave}
      downloadHref={downloadHref}
      initialFavoriteActive={favorite?.active ?? false}
      initialFavoriteRevision={favorite?.revision ?? null}
      licenseHref={licenseHref}
      playlists={playlists}
      productHref={productHref}
      trackHref={trackHref}
      trackId={trackId}
      trackSubtitle={trackSubtitle}
      trackTitle={trackTitle}
    />
  );
}

export default PublicTrackActions;
