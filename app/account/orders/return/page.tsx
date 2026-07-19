import { redirect } from "next/navigation";

type SearchValue = string | readonly string[] | undefined;

function safeCheckoutId(value: SearchValue): string | null {
  const first = typeof value === "string" ? value : value?.[0];
  return first && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(first) ? first : null;
}

export default async function LegacyCommerceReturnPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, SearchValue>>;
}) {
  const checkoutId = safeCheckoutId((await searchParams).checkout);
  redirect(
    checkoutId
      ? `/commerce/return?checkout=${encodeURIComponent(checkoutId)}`
      : "/commerce/return",
  );
}
