import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { CommerceCatalog } from "@/components/commerce";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { listActiveCommerceProducts } from "@/db/commerce-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commerce",
};

export default async function CommercePage() {
  const [authenticatedUser, products] = await Promise.all([
    getChatGPTUser(),
    listActiveCommerceProducts(env.DB),
  ]);
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const checkoutAccess = identity?.roles.includes("customer")
    ? "customer"
    : authenticatedUser
      ? "activation-required"
      : "signed-out";

  return (
    <>
      <PublicPageHeader title="Commerce" variant="compact" />
      <CommerceCatalog
        checkoutAccess={checkoutAccess}
        products={products}
        signInHref={chatGPTSignInPath("/commerce")}
      />
    </>
  );
}
