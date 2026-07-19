import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CommerceReturnResult } from "@/components/commerce";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { readCustomerCommerceReturn } from "@/db/commerce-surface-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test checkout result",
};

type SearchValue = string | readonly string[] | undefined;

function safeCheckoutId(value: SearchValue): string | null {
  const first = typeof value === "string" ? value : value?.[0];
  return first && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(first) ? first : null;
}

async function CustomerReturn({
  browserCanceled,
  checkoutId,
}: {
  readonly browserCanceled: boolean;
  readonly checkoutId: string | null;
}) {
  const returnTo = checkoutId
    ? `/commerce/return?checkout=${encodeURIComponent(checkoutId)}${browserCanceled ? "&canceled=1" : ""}`
    : "/commerce/return";
  const authenticatedUser = await requireChatGPTUser(returnTo);
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) notFound();

  const result = checkoutId
    ? await readCustomerCommerceReturn(env.DB, identity.userId, checkoutId)
    : null;
  return (
    <CommerceReturnResult browserCanceled={browserCanceled} result={result} />
  );
}

export default async function CommerceReturnPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, SearchValue>>;
}) {
  const values = await searchParams;
  const checkoutId = safeCheckoutId(values.checkout);
  const canceledValue =
    typeof values.canceled === "string"
      ? values.canceled
      : values.canceled?.[0];
  const browserCanceled = canceledValue === "1";
  return (
    <>
      <PublicPageHeader title="Test checkout result" variant="compact" />
      <CustomerReturn
        browserCanceled={browserCanceled}
        checkoutId={checkoutId}
      />
    </>
  );
}
