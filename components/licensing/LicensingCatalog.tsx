import Link from "next/link";
import { CommerceTestModeNotice } from "@/components/commerce";
import { TelemetryPageView } from "@/components/telemetry";
import type { LicenseOfferDTO } from "@/lib/licensing/types.ts";

import { LicenseRequestForm } from "./LicenseRequestForm";
import styles from "./Licensing.module.css";

export type LicensingRequestAccess =
  "customer" | "signed-out" | "activation-required";

export interface LicensingCatalogProps {
  readonly offers: readonly LicenseOfferDTO[];
  readonly requestAccess: LicensingRequestAccess;
  readonly signInHref: string;
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function termLabel(months: number | null): string {
  if (months === null) return "No fixed term";
  return months === 1 ? "1 month" : `${months} months`;
}

function RequestAction({
  access,
  offer,
  signInHref,
}: {
  readonly access: LicensingRequestAccess;
  readonly offer: LicenseOfferDTO;
  readonly signInHref: string;
}) {
  if (access === "customer") {
    return (
      <LicenseRequestForm
        licenseOfferId={offer.id}
        optionLabel={offer.snapshot.option.label}
      />
    );
  }
  if (access === "signed-out") {
    return (
      <div className="action-row">
        <Link className="button button-primary" href={signInHref}>
          Sign in to request this license
        </Link>
      </div>
    );
  }
  return (
    <div className="action-row">
      <Link className="button button-primary" href="/account">
        Activate customer account
      </Link>
    </div>
  );
}

export function LicensingCatalog({
  offers,
  requestAccess,
  signInHref,
}: LicensingCatalogProps) {
  return (
    <div className={`page-frame ${styles.page}`}>
      <section
        className={styles.section}
        aria-labelledby="license-offers-title"
      >
        <div className={styles.headingGroup}>
          <h2 id="license-offers-title">License music directly</h2>
          <p>
            Each offer connects one published track revision to artist-authored
            terms, an exact intended-use request, and protected delivery.
          </p>
        </div>

        <CommerceTestModeNotice detail="The Build Week licensing journey uses simulated Stripe Test Checkout after artist approval. Card fields never enter a-op." />

        {offers.length === 0 ? (
          <p className={styles.emptyState}>
            No licensing offers are active. The artist can publish an offer when
            its track and terms are ready.
          </p>
        ) : (
          <ol className={styles.offerList}>
            {offers.map((offer) => {
              const { option, terms, testPrice, track } = offer.snapshot;
              return (
                <li
                  className={styles.offerRow}
                  id={`offer-${offer.slug}`}
                  key={offer.id}
                >
                  <TelemetryPageView
                    eventName="licensing-view"
                    resourceId={offer.id}
                    resourceType="license"
                  />
                  <div className={styles.offerIdentity}>
                    <span className={styles.testLabel}>Test offer</span>
                    <h3>{track.title}</h3>
                    <strong>{option.label}</strong>
                    <p className={styles.supportingText}>
                      {option.description}
                    </p>
                    <span className={styles.recordMeta}>
                      {option.usageCategory} · {option.allowedMedia.join(", ")}
                    </span>
                  </div>
                  <div className={styles.offerTerms}>
                    <strong>
                      {money(testPrice.amountMinor, testPrice.currency)}
                    </strong>
                    <span>Simulated one-time checkout</span>
                    <span>{termLabel(option.termMonths)}</span>
                    <span>{option.territory}</span>
                    <span>
                      {option.requiresApproval
                        ? "Artist approval required"
                        : "Published terms apply"}
                    </span>
                    <span>
                      {terms.title} · version {terms.version}
                    </span>
                  </div>
                  <div className={styles.offerAction}>
                    <RequestAction
                      access={requestAccess}
                      offer={offer}
                      signInHref={signInHref}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

export default LicensingCatalog;
