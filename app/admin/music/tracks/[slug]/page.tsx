import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { TrackWorkspace } from "@/components/admin/music/TrackWorkspace";
import {
  readAdminCatalogIndex,
  readAdminMediaOptions,
  readAdminTrackDraft,
} from "@/db/catalog-admin-read.ts";
import { readActiveEditorPermissions } from "@/db/site-read.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function TrackAdministrationEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity) notFound();

  const owner = hasApplicationRole(identity, "owner");
  const allowed =
    owner ||
    (hasApplicationRole(identity, "editor") &&
      (await hasEditorPermission(env.DB, identity.userId, {
        permissionKey: "catalog.write",
        scopeId: slug === "new" ? "*" : slug,
      })));
  if (!allowed) notFound();

  const permissions = owner
    ? []
    : await readActiveEditorPermissions(env.DB, identity.userId);
  const mediaScopes = owner
    ? []
    : permissions
        .filter(({ permissionKey }) => permissionKey === "media.write")
        .map(({ scopeId }) => scopeId);
  const [track, allMediaOptions, catalog] = await Promise.all([
    slug === "new" ? Promise.resolve(null) : readAdminTrackDraft(env.DB, slug),
    readAdminMediaOptions(env.DB),
    readAdminCatalogIndex(env.DB, [], owner ? null : mediaScopes),
  ]);
  if (slug !== "new" && !track) notFound();

  return (
    <TrackWorkspace
      canPublish={owner}
      canViewMediaStatus={owner || mediaScopes.length > 0}
      initial={
        track
          ? {
              slug: track.slug,
              title: track.title,
              subtitle: track.subtitle,
              description: track.description,
              durationMs: track.durationMs,
              meter: track.meter,
              tempoBpm: track.tempoBpm,
              musicalKey: track.musicalKey,
              isrc: track.isrc,
              copyrightNotice: track.copyrightNotice,
              explicit: track.explicit,
              viewMode: track.viewMode,
              streamMode: track.streamMode,
              downloadMode: track.downloadMode,
              originalMediaId: track.originalMediaId,
              streamingDerivativeId: track.streamingDerivativeId,
              downloadDerivativeId: track.downloadDerivativeId,
              tags: track.tags,
              credits: track.credits,
              publicationState: track.publicationState,
              version: track.version,
              revision: track.revision,
              created: true,
              draftIsPublished: track.publishedRevisionId === track.revisionId,
            }
          : {
              slug: "",
              title: "",
              subtitle: null,
              description: "",
              durationMs: null,
              meter: null,
              tempoBpm: null,
              musicalKey: null,
              isrc: null,
              copyrightNotice: "",
              explicit: false,
              viewMode: "unavailable",
              streamMode: "unavailable",
              downloadMode: "unavailable",
              originalMediaId: null,
              streamingDerivativeId: null,
              downloadDerivativeId: null,
              tags: [],
              credits: [],
              publicationState: "draft",
              version: 0,
              revision: 0,
              created: false,
              draftIsPublished: false,
            }
      }
      media={catalog.media}
      mediaOptions={allMediaOptions}
    />
  );
}
