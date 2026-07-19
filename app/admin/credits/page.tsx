import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AdminCredits } from "@/components/credits";
import {
  readOwnerCreditAccountDetail,
  readOwnerCreditAccounts,
} from "@/db/credit-ledger-read.ts";
import { readCreditCustomers } from "@/db/credit-surface-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import type { CreditAccountDetailDTO } from "@/lib/benefit-credits/types.ts";

type SearchValue = string | readonly string[] | undefined;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Credit administration",
};

function firstValue(value: SearchValue): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

export default async function CreditAdministrationPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, SearchValue>>;
}) {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();

  const customers = await readCreditCustomers(env.DB, identity.userId);
  const requestedCustomerId = firstValue((await searchParams).customer);
  const selectedCustomerId =
    customers.find(({ userId }) => userId === requestedCustomerId)?.userId ??
    customers[0]?.userId ??
    null;
  const accounts = selectedCustomerId
    ? await readOwnerCreditAccounts(env.DB, identity.userId, selectedCustomerId)
    : [];
  const accountResults = await Promise.all(
    accounts.map(({ id }) =>
      readOwnerCreditAccountDetail(env.DB, id, identity.userId),
    ),
  );
  const accountDetails = accountResults.filter(
    (detail): detail is CreditAccountDetailDTO => detail !== null,
  );

  return (
    <AdminCredits
      accountDetails={accountDetails}
      customers={customers}
      selectedCustomerId={selectedCustomerId}
    />
  );
}
