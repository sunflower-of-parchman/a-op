import Link from "next/link";
import { TelemetryPageView } from "@/components/telemetry";
import type { CommerceProductDTO } from "@/lib/commerce/domain.ts";

import styles from "./MembershipLanding.module.css";

export interface MembershipLandingProps {
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

const ACCOUNT_LINKS = Object.freeze([
  Object.freeze({ label: "Playlists", href: "/account/playlists" }),
  Object.freeze({ label: "Favorites", href: "/account/favorites" }),
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

export function MembershipLanding({ product }: MembershipLandingProps) {
  const offerHref = product
    ? `/commerce#${product.offerAnchorId}`
    : "/account/memberships";

  return (
    <div className={`page-frame ${styles.page}`}>
      <h1 className="sr-only">Membership</h1>
      {product?.productType === "membership" ? (
        <TelemetryPageView
          eventName="membership-view"
          resourceId={product.id}
          resourceType="membership"
        />
      ) : null}

      <section className={styles.membership} aria-labelledby="membership-title">
        <div className={styles.offer}>
          <div className={styles.offerIdentity}>
            <h2 id="membership-title">{product?.name ?? "Membership"}</h2>
            <p className={styles.price}>
              {product ? money(product.amountMinor, product.currency) : "Price"}
              {product ? <span>{cadence(product)}</span> : null}
            </p>
            {product?.description ? <p>{product.description}</p> : null}
          </div>

          <div className={styles.offerActions}>
            <Link className="button button-primary" href={offerHref}>
              {product ? "View membership" : "Manage membership"}
            </Link>
            {product ? (
              <Link className={styles.textLink} href="/account/memberships">
                Manage membership
              </Link>
            ) : null}
          </div>

          <p className={styles.licensingNote}>
            Licensing is managed separately.{" "}
            <Link href="/licensing">Licensing</Link>
          </p>
        </div>

        <nav className={styles.benefits} aria-label="Membership benefits">
          {BENEFIT_LINKS.map((benefit) => (
            <Link
              className={`${styles.benefitLink} ${styles[benefit.placement]}`}
              href={benefit.href}
              key={benefit.href}
            >
              <span>{benefit.label}</span>
            </Link>
          ))}
          <div className={styles.accountLinks}>
            {ACCOUNT_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </section>
    </div>
  );
}

export default MembershipLanding;
