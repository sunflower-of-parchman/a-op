import { env } from "cloudflare:workers";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerActivationControl, ProfileEditor } from "@/components/account";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";

interface ProfileRow {
  display_name: string;
  revision: number;
}

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const authenticatedUser = await requireChatGPTUser("/account/profile");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity) {
    return (
      <div className="account-content">
        <h2>Profile</h2>
        <p>Activate this signed-in identity to create your customer profile.</p>
        <CustomerActivationControl />
      </div>
    );
  }

  const profile = await env.DB.prepare(
    `SELECT display_name, revision FROM profiles WHERE user_id = ?1 LIMIT 1`,
  )
    .bind(identity.userId)
    .first<ProfileRow>();

  if (!profile) return null;

  return (
    <div className="account-content">
      <h2>Profile</h2>
      <p>Choose the name shown inside your account.</p>
      <ProfileEditor
        displayName={profile.display_name}
        revision={profile.revision}
      />
    </div>
  );
}
