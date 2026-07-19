import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerCredits } from "@/components/credits";
import { readCustomerCreditAccountDetail } from "@/db/credit-ledger-read.ts";
import { readCustomerDownloadCreditTargets } from "@/db/download-credit-redemption.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your credits",
};

export default async function CustomerCreditsPage() {
  const authenticatedUser = await requireChatGPTUser("/account/credits");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) notFound();

  const [download, license, downloadTargets] = await Promise.all([
    readCustomerCreditAccountDetail(env.DB, "download", identity.userId),
    readCustomerCreditAccountDetail(env.DB, "license", identity.userId),
    readCustomerDownloadCreditTargets(env.DB, identity.userId),
  ]);
  return (
    <CustomerCredits
      accounts={[
        { kind: "download", detail: download },
        { kind: "license", detail: license },
      ]}
      downloadTargets={downloadTargets}
    />
  );
}
