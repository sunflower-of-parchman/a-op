import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { MembershipLanding } from "@/components/memberships/MembershipLanding";
import { listActiveCommerceProducts } from "@/db/commerce-read.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Membership",
};

export default async function MembershipPage() {
  await requireActiveModule(env.DB, "memberships");
  const products = await listActiveCommerceProducts(env.DB);
  const membershipProduct =
    products.find(({ productType }) => productType === "subscription") ??
    products.find(({ productType }) => productType === "membership") ??
    null;

  return <MembershipLanding product={membershipProduct} />;
}
