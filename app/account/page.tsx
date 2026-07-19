import { env } from "cloudflare:workers";
import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerActivationControl } from "@/components/account";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const authenticatedUser = await requireChatGPTUser("/account");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const customerActive = identity?.roles.includes("customer") ?? false;

  return (
    <div className="account-content">
      <h2>Overview</h2>
      <p className="intro-copy">
        Signed in with ChatGPT as {authenticatedUser.displayName}.
      </p>
      {customerActive ? (
        <>
          <p>Your customer account is active.</p>
          {identity && identity.roles.length > 0 ? (
            <p>
              Your active a-op role
              {identity.roles.length === 1 ? " is " : "s are "}
              {identity.roles.join(", ")}.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p>
            Activate this signed-in identity to create your customer profile and
            use customer account features as they become active.
          </p>
          <CustomerActivationControl />
        </>
      )}
      <a className="text-link" href={chatGPTSignOutPath("/")}>
        Sign out
      </a>
    </div>
  );
}
