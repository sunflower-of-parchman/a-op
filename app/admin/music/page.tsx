import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CatalogOverview } from "@/components/admin/music/CatalogOverview";
import { readAdminCatalogIndex } from "@/db/catalog-admin-read.ts";
import { readActiveEditorPermissions } from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function MusicAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner", "editor")) {
    notFound();
  }

  const owner = hasApplicationRole(identity, "owner");
  const permissions = owner
    ? []
    : await readActiveEditorPermissions(env.DB, identity.userId);
  const catalogScopes = owner
    ? null
    : permissions
        .filter(({ permissionKey }) => permissionKey === "catalog.write")
        .map(({ scopeId }) => scopeId);
  const mediaScopes = owner
    ? null
    : permissions
        .filter(({ permissionKey }) => permissionKey === "media.write")
        .map(({ scopeId }) => scopeId);
  const data = await readAdminCatalogIndex(env.DB, catalogScopes, mediaScopes);

  return (
    <CatalogOverview
      canCreate={catalogScopes === null || catalogScopes.includes("*")}
      canViewMedia={mediaScopes === null || mediaScopes.length > 0}
      data={data}
    />
  );
}
