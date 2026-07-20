import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AdminShell } from "@/components/admin";
import { readActiveModuleKeys } from "@/db/site-read.ts";
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

  const owner = hasApplicationRole(identity, "owner");
  const activeModules = await readActiveModuleKeys(env.DB);
  const navigation = resolveAdministrationNavigation(activeModules, owner);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <main id="main-content" tabIndex={-1}>
        <AdminShell
          homeHref="/account"
          navigation={navigation}
          title="Administration"
        >
          {children}
        </AdminShell>
      </main>
    </>
  );
}
