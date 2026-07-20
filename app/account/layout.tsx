import { env } from "cloudflare:workers";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AccountShell } from "@/components/account";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SiteHeader } from "@/components/public/SiteHeader";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authenticatedUser = await requireChatGPTUser("/account");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const canAdminister = hasApplicationRole(identity, "owner", "editor");

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="site-shell">
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>
          <AccountShell
            administrationHref={canAdminister ? "/admin" : undefined}
            identity={{
              name: identity?.displayName ?? authenticatedUser.displayName,
            }}
          >
            {children}
          </AccountShell>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
