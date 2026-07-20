import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { LicensingCatalog } from "@/components/licensing";
import { listActiveCommerceProducts } from "@/db/commerce-read.ts";
import { readPublicContactForm } from "@/db/contact-read.ts";
import { listActiveLicenseOffers } from "@/db/licensing-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Licensing",
};

export default async function LicensingPage() {
  await requireActiveModule(env.DB, "licensing");
  const [authenticatedUser, offers, commerceProducts, contactForm] =
    await Promise.all([
      getChatGPTUser(),
      listActiveLicenseOffers(env.DB),
      listActiveCommerceProducts(env.DB),
      readPublicContactForm(env.DB),
    ]);
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const requestAccess = identity?.roles.includes("customer")
    ? "customer"
    : authenticatedUser
      ? "activation-required"
      : "signed-out";

  return (
    <LicensingCatalog
      commerceProducts={commerceProducts}
      contactForm={contactForm}
      offers={offers}
      requestAccess={requestAccess}
      signInHref={chatGPTSignInPath("/licensing")}
    />
  );
}
