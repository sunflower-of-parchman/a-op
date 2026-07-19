import { env } from "cloudflare:workers";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AccountShell } from "@/components/account";
import { readActiveModuleKeys } from "@/db/site-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { resolveAccountNavigation } from "@/lib/modules/index.ts";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authenticatedUser = await requireChatGPTUser("/account");
  const [identity, activeModules] = await Promise.all([
    resolveApplicationIdentity(env.DB, authenticatedUser),
    readActiveModuleKeys(env.DB),
  ]);
  const customerActive = identity?.roles.includes("customer") ?? false;
  const navigation = resolveAccountNavigation(activeModules, customerActive);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <main id="main-content" tabIndex={-1}>
        <AccountShell
          identity={{
            name: identity?.displayName ?? authenticatedUser.displayName,
            email: authenticatedUser.email,
          }}
          navigation={navigation}
          description="Your profile, saved music, and artist-controlled access live here."
          status={{
            label: "Customer account",
            value: customerActive ? "Active" : "Activation available",
            detail:
              identity && identity.roles.length > 0
                ? `Application roles: ${identity.roles.join(", ")}`
                : "Activation creates your customer profile from this signed-in identity.",
            tone: customerActive ? "positive" : "attention",
          }}
        >
          {children}
        </AccountShell>
      </main>
    </>
  );
}
