import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { MembershipLanding } from "@/components/memberships/MembershipLanding";
import { PageHero } from "@/components/public/PageHero";
import { listActiveCommerceProducts } from "@/db/commerce-read.ts";
import { readPublicArtwork } from "@/db/public-media.ts";
import { readPublicMosaicImages } from "@/db/public-mosaic.ts";
import { requirePublicModulePresentation } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Membership",
};

export default async function MembershipPage() {
  await requirePublicModulePresentation(env.DB, "memberships");
  const [products, mosaicImages, pianoArtwork, teachingArtwork] =
    await Promise.all([
      listActiveCommerceProducts(env.DB),
      readPublicMosaicImages(env.DB),
      readPublicArtwork(
        env.DB,
        "media-course-piano-artwork",
        "Piano course artwork",
      ),
      readPublicArtwork(
        env.DB,
        "media-course-teaching-music-for-dance-artwork",
        "Teaching Music for Dance course artwork",
      ),
    ]);
  const membershipProduct =
    products.find(({ productType }) => productType === "subscription") ??
    products.find(({ productType }) => productType === "membership") ??
    null;
  const membershipImages = [pianoArtwork, teachingArtwork, ...mosaicImages]
    .filter((image) => image !== null)
    .filter(
      (image, index, images) =>
        images.findIndex(({ url }) => url === image.url) === index,
    );

  return (
    <>
      <PageHero hero={null} mosaicImages={mosaicImages} title="Membership" />
      <MembershipLanding
        images={membershipImages}
        product={membershipProduct}
      />
    </>
  );
}
