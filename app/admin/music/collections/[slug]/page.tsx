import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CollectionWorkspace } from "@/components/admin/music/CollectionWorkspace";
import {
  readAdminCatalogIndex,
  readAdminCollectionDraft,
  readAdminMediaOptions,
  readAdminTrackOptions,
} from "@/db/catalog-admin-read.ts";
import { readActiveEditorPermissions } from "@/db/site-read.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function CollectionAdministrationEditor({
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
  const [collection, allMediaOptions, trackOptions, catalog] =
    await Promise.all([
      slug === "new"
        ? Promise.resolve(null)
        : readAdminCollectionDraft(env.DB, slug),
      readAdminMediaOptions(env.DB),
      readAdminTrackOptions(env.DB),
      readAdminCatalogIndex(env.DB, [], owner ? null : mediaScopes),
    ]);
  if (slug !== "new" && !collection) notFound();

  return (
    <CollectionWorkspace
      canPublish={owner}
      canViewMediaStatus={owner || mediaScopes.length > 0}
      initial={
        collection
          ? {
              slug: collection.slug,
              title: collection.title,
              description: collection.description,
              viewMode: collection.viewMode,
              artworkDerivativeId: collection.artworkDerivativeId,
              tags: collection.tags,
              tracks: collection.tracks,
              credits: collection.credits,
              publicationState: collection.publicationState,
              version: collection.version,
              revision: collection.revision,
              created: true,
              draftIsPublished:
                collection.publishedRevisionId === collection.revisionId,
            }
          : {
              slug: "",
              title: "",
              description: "",
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
