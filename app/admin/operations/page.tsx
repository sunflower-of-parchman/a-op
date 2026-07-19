import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { OperationsWorkspace } from "@/components/operations";
import { readOperationsOverview } from "@/db/operations-read.ts";
import { readActiveModuleKeys } from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operations" };

export default async function OperationsPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  const [overview, activeModules] = await Promise.all([
    readOperationsOverview(env.DB, env.MEDIA, identity.userId),
    readActiveModuleKeys(env.DB),
  ]);
  return (
    <OperationsWorkspace
      overview={overview}
      telemetryActive={activeModules.includes("telemetry")}
    />
  );
}
