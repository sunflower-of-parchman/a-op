import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { EditorWorkspace } from "@/components/admin";
import { readActiveEditors } from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function EditorsAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!hasApplicationRole(identity, "owner")) notFound();

  const editors = await readActiveEditors(env.DB);
  return (
    <EditorWorkspace
      initialEditors={editors.map((editor) => ({
        userId: editor.userId,
        email: editor.email,
        displayName: editor.displayName,
        permissions: editor.permissions.map(({ permissionKey, scopeId }) => ({
          permissionKey,
          scopeId,
        })),
      }))}
    />
  );
}
