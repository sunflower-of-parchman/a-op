import { env } from "cloudflare:workers";
import Link from "next/link";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { OwnerBootstrapControl } from "@/components/admin";
import { readInstallationState } from "@/db/site-read.ts";
import { normalizeIdentityEmail } from "@/lib/auth/application-identity.ts";
import { FICTIONAL_RUNTIME_IDENTITIES } from "@/lib/auth/runtime-fixtures.ts";
import { resolveSimulationMode } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

export default async function OwnerSetupPage() {
  const [installation, authenticatedUser] = await Promise.all([
    readInstallationState(env.DB),
    getChatGPTUser(),
  ]);
  const runtimeLab = resolveSimulationMode({
    AOP_RUNTIME_ENV: env.AOP_RUNTIME_ENV,
    AOP_SIMULATION_MODE: env.AOP_SIMULATION_MODE,
  });
  const authenticatedEmail = authenticatedUser
    ? normalizeIdentityEmail(authenticatedUser.email)
    : null;
  const approvedEmail = env.AOP_OWNER_BOOTSTRAP_EMAIL
    ? normalizeIdentityEmail(env.AOP_OWNER_BOOTSTRAP_EMAIL)
    : null;
  const approved =
    authenticatedEmail !== null &&
    ((approvedEmail !== null && authenticatedEmail === approvedEmail) ||
      (runtimeLab.enabled &&
        authenticatedEmail === FICTIONAL_RUNTIME_IDENTITIES.owner.email));

  return (
    <div className="page-frame page-introduction">
      <p className="eyebrow">Explicit setup</p>
      <h1>Owner bootstrap</h1>
      {installation?.status === "active" ? (
        <>
          <p className="intro-copy">This installation has an owner.</p>
          <Link className="button button-primary" href="/admin">
            Open administration
          </Link>
        </>
      ) : !authenticatedUser ? (
        <>
          <p className="intro-copy">
            Sign in with the identity approved in the server-managed setup
            configuration.
          </p>
          <Link
            className="button button-primary"
            href={chatGPTSignInPath("/setup/owner")}
          >
            Sign in with ChatGPT
          </Link>
        </>
      ) : approved ? (
        <>
          <p className="intro-copy">
            This identity is approved for the one-time owner action.
          </p>
          <OwnerBootstrapControl />
        </>
      ) : (
        <p className="intro-copy">
          Owner bootstrap has not been approved for this identity.
        </p>
      )}
    </div>
  );
}
