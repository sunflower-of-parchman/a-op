import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AdminLicensing } from "@/components/licensing";
import { readLicenseAdministration } from "@/db/licensing-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Licensing administration",
};

export default async function LicensingAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  await requireActiveModule(env.DB, "licensing");

  const administration = await readLicenseAdministration(
    env.DB,
    identity.userId,
  );
  return <AdminLicensing administration={administration} />;
}
