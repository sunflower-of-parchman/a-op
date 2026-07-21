import Link from "next/link";
import { TelemetryPageView } from "@/components/telemetry";
import type { PublicArtwork } from "@/db/public-media.ts";
import type { CommerceProductDTO } from "@/lib/commerce/domain.ts";

import styles from "./MembershipLanding.module.css";

export interface MembershipLandingProps {
  readonly images: readonly PublicArtwork[];
  readonly product: CommerceProductDTO | null;
}

const BENEFIT_LINKS = Object.freeze([
  Object.freeze({ label: "Courses", href: "/courses", placement: "courses" }),
  Object.freeze({ label: "Music", href: "/music", placement: "music" }),
  Object.freeze({
    label: "Download credits",
    href: "/account/credits",
    placement: "credits",
  }),
]);

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function cadence(product: CommerceProductDTO): string {
  if (product.billingInterval === "one_time") return "one time";
  const interval = product.billingInterval === "month" ? "month" : "year";
  return product.intervalCount === 1
    ? `per ${interval}`
    : `every ${product.intervalCount} ${interval}s`;
}

export function MembershipLanding({ images, product }: MembershipLandingProps) {
  if (!product) {
    return (
      <div className={`page-frame ${styles.page} ${styles.emptyPage}`}>
        <p className={styles.empty}>No membership is published.</p>
      </div>
    );
  }

  const offerHref = `/commerce#${product.offerAnchorId}`;

  return (
    <div className={`page-frame ${styles.page}`}>
      {product.productType === "membership" ? (
        <TelemetryPageView
          eventName="membership-view"
          resourceId={product.id}
          resourceType="membership"
        />
      ) : null}

      <section className={styles.membership} aria-labelledby="membership-title">
        <div className={styles.offer}>
          <div className={styles.offerIdentity}>
            <h2 id="membership-title">{product.name}</h2>
            <p className={styles.price}>
              {money(product.amountMinor, product.currency)}
              <span>{cadence(product)}</span>
            </p>
            {product.description ? <p>{product.description}</p> : null}
          </div>

          <div className={styles.offerActions}>
            <Link className="button button-primary" href={offerHref}>
              View membership
            </Link>
            <Link className={styles.textLink} href="/account/memberships">
              Manage membership
            </Link>
          </div>
        </div>

        <nav className={styles.benefits} aria-label="Membership benefits">
          {BENEFIT_LINKS.map((benefit, index) => (
            <Link
              className={`${styles.benefitLink} ${styles[benefit.placement]}`}
              href={benefit.href}
              key={benefit.href}
            >
              {images[index] ? (
                // Artwork is artist-approved and delivered by the Site.
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={images[index].url} />
              ) : null}
              <span>{benefit.label}</span>
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}

export default MembershipLanding;
