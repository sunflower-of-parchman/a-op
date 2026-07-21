import Link from "next/link";
import { TelemetryPageView } from "@/components/telemetry";
import type { PublicContactFormDTO } from "@/lib/contact/index.ts";
import type { CommerceProductDTO } from "@/lib/commerce/domain.ts";
import type { PublicCommerceIntentPreview } from "@/db/commerce-preview.ts";
import type { LicenseOfferDTO } from "@/lib/licensing/types.ts";

import { LicenseRequestForm } from "./LicenseRequestForm";
import styles from "./Licensing.module.css";

export type LicensingRequestAccess =
  "customer" | "signed-out" | "activation-required";

export interface LicensingCatalogProps {
  readonly commerceProducts: readonly CommerceProductDTO[];
  readonly contactForm: PublicContactFormDTO | null;
  readonly offers: readonly LicenseOfferDTO[];
  readonly pendingLicenseTypes: readonly PublicCommerceIntentPreview[];
  readonly pendingPlans: readonly PublicCommerceIntentPreview[];
  readonly requestAccess: LicensingRequestAccess;
  readonly signInHref: string;
}

function previewCadence(product: PublicCommerceIntentPreview): string {
  if (product.billingInterval === "one_time") return "One time";
  const unit = product.billingInterval === "month" ? "month" : "year";
  return product.intervalCount === 1
    ? `Per ${unit}`
    : `Every ${product.intervalCount} ${unit}s`;
}

function PreviewPlanList({
  actionHref = "#custom-licensing",
  actionLabel = "Ask about this option",
  actionStyle = "text",
  products,
}: {
  readonly actionHref?: string;
  readonly actionLabel?: string;
  readonly actionStyle?: "button" | "text";
  readonly products: readonly PublicCommerceIntentPreview[];
}) {
  return (
    <ol className={styles.planGrid}>
      {products.map((product) => (
        <li
          className={`${styles.planTile} ${styles.planTilePlain}`}
          key={product.id}
        >
          <div className={styles.planPanel}>
            <div className={styles.planIdentity}>
              <h3>{product.name}</h3>
              <p>{money(product.amountMinor, product.currency)}</p>
              <span>{previewCadence(product)}</span>
            </div>
            {product.description ? <p>{product.description}</p> : null}
            <Link
              className={
                actionStyle === "button"
                  ? "button button-primary"
                  : styles.textAction
              }
              href={actionHref}
            >
              {actionLabel}
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
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

function cadence(product: CommerceProductDTO): string {
  if (product.billingInterval === "one_time") return "One time";
  const unit = product.billingInterval === "month" ? "month" : "year";
  return product.intervalCount === 1
    ? `Every ${unit}`
    : `Every ${product.intervalCount} ${unit}s`;
}

function PublishedPlanList({
  products,
}: {
  readonly products: readonly CommerceProductDTO[];
}) {
  return (
    <ol className={styles.planGrid}>
      {products.map((product) => (
        <li
          className={`${styles.planTile} ${styles.planTilePlain}`}
          key={product.id}
        >
          {product.productType === "membership" ? (
            <TelemetryPageView
              eventName="membership-view"
              resourceId={product.id}
              resourceType="membership"
            />
          ) : null}
          <div className={styles.planPanel}>
            <div className={styles.planIdentity}>
              <h3>{product.name}</h3>
              <p>{money(product.amountMinor, product.currency)}</p>
              <span>{cadence(product)}</span>
            </div>
            {product.description ? <p>{product.description}</p> : null}
            <Link
              className="button button-primary"
              href={`/commerce#${product.offerAnchorId}`}
            >
              View plan
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CustomLicensingCallout({
  available,
}: {
  readonly available: boolean;
}) {
  return (
    <section className={styles.customCard} aria-labelledby="custom-title">
      <div className={styles.customPanel}>
        <h2 id="custom-title">Custom Licensing</h2>
        {available ? (
          <Link className="button button-primary" href="/contact">
            Contact for Custom Licensing
          </Link>
        ) : (
          <span>Contact is not currently available.</span>
        )}
      </div>
    </section>
  );
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
  commerceProducts,
  contactForm,
  offers,
  pendingLicenseTypes,
  pendingPlans,
  requestAccess,
  signInHref,
}: LicensingCatalogProps) {
  const educationPattern = /education|school|academic/i;
  const membershipPattern = /\bmembership\b/i;
  const recurringProducts = commerceProducts.filter(
    (product) =>
      product.productType === "subscription" ||
      product.productType === "membership",
  );
  const educationProducts = recurringProducts.filter((product) =>
    educationPattern.test(`${product.slug} ${product.name}`),
  );
  const licensingSubscriptions = recurringProducts.filter(
    (product) =>
      !educationPattern.test(`${product.slug} ${product.name}`) &&
      !membershipPattern.test(`${product.slug} ${product.name}`) &&
      product.productType === "subscription",
  );
  const pendingEducationPlans = pendingPlans.filter((product) =>
    educationPattern.test(product.name),
  );
  const pendingLicensingPlans = pendingPlans.filter(
    (product) =>
      !educationPattern.test(product.name) &&
      !membershipPattern.test(product.name),
  );

  return (
    <main className={`page-frame ${styles.page}`}>
      <section
        className={styles.section}
        aria-labelledby="license-offers-title"
      >
        <h2 id="license-offers-title">One-Time Licenses</h2>

        {offers.length === 0 ? (
          pendingLicenseTypes.length > 0 ? (
            <PreviewPlanList
              actionHref="/music?view=tracks"
              actionLabel="Buy License"
              actionStyle="button"
              products={pendingLicenseTypes}
            />
          ) : (
            <p>No one-time licenses are published.</p>
          )
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
                  <div className={styles.offerPanel}>
                    <div className={styles.offerIdentity}>
                      <h3>{track.title}</h3>
                      <strong>{option.label}</strong>
                      <p className={styles.supportingText}>
                        {option.description}
                      </p>
                      <span className={styles.recordMeta}>
                        {option.usageCategory} ·{" "}
                        {option.allowedMedia.join(", ")}
                      </span>
                    </div>
                    <div className={styles.offerTerms}>
                      <strong>
                        {money(testPrice.amountMinor, testPrice.currency)}
                      </strong>
                      <span>{termLabel(option.termMonths)}</span>
                      <span>{option.territory}</span>
                      <span>
                        {option.requiresApproval
                          ? "Artist approval required"
                          : "Published terms apply"}
                      </span>
                      <span>{terms.title}</span>
                    </div>
                    <div className={styles.offerAction}>
                      <RequestAction
                        access={requestAccess}
                        offer={offer}
                        signInHref={signInHref}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="subscriptions-title">
        <h2 id="subscriptions-title">Licensing Plans</h2>
        {licensingSubscriptions.length > 0 ? (
          <PublishedPlanList products={licensingSubscriptions} />
        ) : pendingLicensingPlans.length > 0 ? (
          <PreviewPlanList products={pendingLicensingPlans} />
        ) : (
          <p>No licensing plans are published.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="education-title">
        <h2 id="education-title">Education</h2>
        {educationProducts.length > 0 ? (
          <PublishedPlanList products={educationProducts} />
        ) : pendingEducationPlans.length > 0 ? (
          <PreviewPlanList products={pendingEducationPlans} />
        ) : (
          <p>No education plans are published.</p>
        )}
      </section>

      <section
        className={styles.section}
        id="custom-licensing"
        aria-label="Custom Licensing"
      >
        <CustomLicensingCallout available={contactForm !== null} />
      </section>
    </main>
  );
}

export default LicensingCatalog;
