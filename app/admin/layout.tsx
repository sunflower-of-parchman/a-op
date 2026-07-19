import { env } from "cloudflare:workers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { AdminShell } from "@/components/admin";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  readActiveModuleKeys,
  readDraftArtistRevision,
  readPublishedArtistRevision,
} from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { resolveAdministrationNavigation } from "@/lib/modules/index.ts";

export const dynamic = "force-dynamic";

export default async function AdministrationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authenticatedUser = await requireChatGPTUser("/admin");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner", "editor")) {
    notFound();
  }

  const [draftArtist, publishedArtist, activeModules] = await Promise.all([
    readDraftArtistRevision(env.DB),
    readPublishedArtistRevision(env.DB),
    readActiveModuleKeys(env.DB),
  ]);
  if (!draftArtist || !publishedArtist) notFound();

  const owner = hasApplicationRole(identity, "owner");
  const navigation = resolveAdministrationNavigation(activeModules, owner);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <main id="main-content" tabIndex={-1}>
        <AdminShell
          actions={
            <>
              <ThemeToggle />
              <Link className="button button-secondary" href="/">
                View site
              </Link>
              <a className="text-link" href={chatGPTSignOutPath("/")}>
                Sign out
              </a>
            </>
          }
          description="Publish artist state and operate the connected application."
          identity={{
            name: identity.displayName,
            email: identity.email,
            role: owner ? "owner" : "editor",
          }}
          navigation={navigation}
          productName={publishedArtist.displayName}
          status={[
            {
              label: "Published artist revision",
              value: String(publishedArtist.revision),
              tone:
                publishedArtist.id === draftArtist.id
                  ? "positive"
                  : "attention",
              detail:
                publishedArtist.id === draftArtist.id
                  ? "Current"
                  : "Draft changes waiting",
            },
            {
              label: "Optional modules",
              value: `${activeModules.length} active`,
              tone: "neutral",
            },
          ]}
          title="Administration"
        >
          {children}
        </AdminShell>
      </main>
    </>
  );
}
