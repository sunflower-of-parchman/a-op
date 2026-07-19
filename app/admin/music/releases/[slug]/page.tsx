import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ReleaseWorkspace } from "@/components/admin/music/ReleaseWorkspace";
import {
  readAdminCatalogIndex,
  readAdminMediaOptions,
  readAdminReleaseDraft,
  readAdminTrackOptions,
} from "@/db/catalog-admin-read.ts";
import { readActiveEditorPermissions } from "@/db/site-read.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function ReleaseAdministrationEditor({
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
  const [release, allMediaOptions, trackOptions, catalog] = await Promise.all([
    slug === "new"
      ? Promise.resolve(null)
      : readAdminReleaseDraft(env.DB, slug),
    readAdminMediaOptions(env.DB),
    readAdminTrackOptions(env.DB),
    readAdminCatalogIndex(env.DB, [], owner ? null : mediaScopes),
  ]);
  if (slug !== "new" && !release) notFound();

  return (
    <ReleaseWorkspace
      canPublish={owner}
      canViewMediaStatus={owner || mediaScopes.length > 0}
      initial={
        release
          ? {
              slug: release.slug,
              releaseType: release.releaseType,
              title: release.title,
              subtitle: release.subtitle,
              description: release.description,
              releaseDate: release.releaseDate,
              catalogNumber: release.catalogNumber,
              copyrightNotice: release.copyrightNotice,
              viewMode: release.viewMode,
              artworkDerivativeId: release.artworkDerivativeId,
              tags: release.tags,
              tracks: release.tracks,
              credits: release.credits,
              publicationState: release.publicationState,
              version: release.version,
              revision: release.revision,
              created: true,
              draftIsPublished:
                release.publishedRevisionId === release.revisionId,
            }
          : {
              slug: "",
              releaseType: "album",
              title: "",
              subtitle: null,
              description: "",
              releaseDate: null,
              catalogNumber: null,
              copyrightNotice: "",
              viewMode: "unavailable",
              artworkDerivativeId: null,
              tags: [],
              tracks: [],
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
      trackOptions={trackOptions}
    />
  );
}
