import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { LicensingCatalog } from "@/components/licensing";
import { PageHero } from "@/components/public/PageHero";
import { listActiveCommerceProducts } from "@/db/commerce-read.ts";
import { listPublicCommerceIntentPreviews } from "@/db/commerce-preview.ts";
import { readPublicContactForm } from "@/db/contact-read.ts";
import { readPublicMosaicImages } from "@/db/public-mosaic.ts";
import { listActiveLicenseOffers } from "@/db/licensing-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requirePublicModulePresentation } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Licensing",
};

export default async function LicensingPage() {
  await requirePublicModulePresentation(env.DB, "licensing");
  const [
    authenticatedUser,
    offers,
    commerceProducts,
    contactForm,
    mosaicImages,
    pendingLicenseTypes,
  ] = await Promise.all([
    getChatGPTUser(),
    listActiveLicenseOffers(env.DB),
    listActiveCommerceProducts(env.DB),
    readPublicContactForm(env.DB),
    readPublicMosaicImages(env.DB),
    listPublicCommerceIntentPreviews(env.DB, "license"),
  ]);
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const requestAccess = identity?.roles.includes("customer")
    ? "customer"
    : authenticatedUser
      ? "activation-required"
      : "signed-out";

  return (
    <>
      <PageHero hero={null} mosaicImages={mosaicImages} title="Licensing" />
      <LicensingCatalog
        commerceProducts={commerceProducts}
        contactForm={contactForm}
        offers={offers}
        pendingLicenseTypes={pendingLicenseTypes}
        requestAccess={requestAccess}
        signInHref={chatGPTSignInPath("/licensing")}
      />
    </>
  );
}
