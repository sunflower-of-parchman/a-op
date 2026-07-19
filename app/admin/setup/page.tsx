import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { SetupWorkspace } from "@/components/setup";
import { readSetupSourceState } from "@/db/setup-source-state.ts";
import { readSetupWorkspace } from "@/db/setup-state.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Setup & portability" };

export default async function SetupAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  const [workspace, source] = await Promise.all([
    readSetupWorkspace(env.DB, identity.userId),
    readSetupSourceState(env.DB),
  ]);
  return (
    <SetupWorkspace
      currentSourceFingerprint={source.fingerprint}
      initial={workspace}
    />
  );
}
