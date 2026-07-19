import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerLicenses } from "@/components/licensing";
import { readCustomerCreditAccountDetail } from "@/db/credit-ledger-read.ts";
import { readCustomerLicenseHistory } from "@/db/licensing-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your licenses",
};

export default async function CustomerLicensesPage() {
  const authenticatedUser = await requireChatGPTUser("/account/licenses");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) notFound();
  await requireActiveModule(env.DB, "licensing");

  const [history, licenseCredits] = await Promise.all([
    readCustomerLicenseHistory(env.DB, identity.userId),
    readCustomerCreditAccountDetail(env.DB, "license", identity.userId),
  ]);
  return <CustomerLicenses history={history} licenseCredits={licenseCredits} />;
}
