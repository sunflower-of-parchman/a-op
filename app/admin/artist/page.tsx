import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ArtistWorkspace } from "@/components/admin";
import {
  readArtistModules,
  readDraftArtistRevision,
  readNavigationSnapshot,
} from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function ArtistAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!hasApplicationRole(identity, "owner")) notFound();

  const [artist, modules, primary, footer] = await Promise.all([
    readDraftArtistRevision(env.DB),
    readArtistModules(env.DB),
    readNavigationSnapshot(env.DB, "primary", "draft", "administration"),
    readNavigationSnapshot(env.DB, "footer", "draft", "administration"),
  ]);
  if (!artist || !primary || !footer) notFound();

  return (
    <ArtistWorkspace
      artist={{
        displayName: artist.displayName,
        siteTitle: artist.siteTitle,
        headline: artist.headline,
        introduction: artist.introduction,
        footerText: artist.footerText,
        version: artist.configVersion,
      }}
      modules={modules.map(({ active, moduleKey }) => ({
        active,
        moduleKey,
      }))}
      navigation={{
        primary: { revision: primary.revision, items: primary.items },
        footer: { revision: footer.revision, items: footer.items },
      }}
    />
  );
}
