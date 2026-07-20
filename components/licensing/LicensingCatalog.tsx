import Link from "next/link";
import { ContactForm } from "@/components/contact";
import { TelemetryPageView } from "@/components/telemetry";
import type { PublicContactFormDTO } from "@/lib/contact/index.ts";
import type { CommerceProductDTO } from "@/lib/commerce/domain.ts";
import type { LicenseOfferDTO } from "@/lib/licensing/types.ts";

import { LicenseRequestForm } from "./LicenseRequestForm";
import styles from "./Licensing.module.css";

export type LicensingRequestAccess =
  "customer" | "signed-out" | "activation-required";

export interface LicensingCatalogProps {
  readonly commerceProducts: readonly CommerceProductDTO[];
  readonly contactForm: PublicContactFormDTO | null;
  readonly offers: readonly LicenseOfferDTO[];
  readonly requestAccess: LicensingRequestAccess;
  readonly signInHref: string;
}

interface PreviewPlan {
  readonly id: string;
  readonly name: string;
  readonly price: "Price";
  readonly benefits: readonly string[];
}

const PREVIEW_ONE_TIME_LICENSES = Object.freeze([
  Object.freeze({
    id: "student-license",
    name: "Student License",
    price: "Price",
    benefits: Object.freeze(["Benefit", "Benefit", "Benefit"]),
  }),
  Object.freeze({
    id: "one-time-license",
    name: "One-Time License",
    price: "Price",
    benefits: Object.freeze(["Benefit", "Benefit", "Benefit"]),
  }),
  Object.freeze({
    id: "extended-license",
    name: "Extended License",
    price: "Price",
    benefits: Object.freeze(["Benefit", "Benefit", "Benefit"]),
  }),
] satisfies readonly PreviewPlan[]);

const PREVIEW_LICENSE_SUBSCRIPTIONS = Object.freeze([
  Object.freeze({
    id: "license-subscription-1",
    name: "License Subscription",
    price: "Price",
    benefits: Object.freeze(["Benefit", "Benefit", "Benefit"]),
  }),
  Object.freeze({
    id: "license-subscription-2",
    name: "License Subscription",
    price: "Price",
    benefits: Object.freeze(["Benefit", "Benefit", "Benefit"]),
  }),
] satisfies readonly PreviewPlan[]);

const PREVIEW_EDUCATION_PLANS = Object.freeze([
  Object.freeze({
    id: "education-plan-1",
    name: "Education Plan",
    price: "Price",
    benefits: Object.freeze(["Benefit", "Benefit", "Benefit"]),
  }),
  Object.freeze({
    id: "education-plan-2",
    name: "Education Plan",
    price: "Price",
    benefits: Object.freeze(["Benefit", "Benefit", "Benefit"]),
  }),
  Object.freeze({
    id: "education-plan-3",
    name: "Education Plan",
    price: "Price",
    benefits: Object.freeze(["Benefit", "Benefit", "Benefit"]),
  }),
] satisfies readonly PreviewPlan[]);

const PREVIEW_FAQS = Object.freeze([
  "licensing-faq-1",
  "licensing-faq-2",
  "licensing-faq-3",
  "licensing-faq-4",
  "licensing-faq-5",
]);

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

function PreviewPlanList({
  plans,
}: {
  readonly plans: readonly PreviewPlan[];
}) {
  return (
    <ol className={styles.planGrid} data-preview="true">
      {plans.map((plan) => (
        <li className={styles.planTile} key={plan.id}>
          <div className={styles.planIdentity}>
            <h3>{plan.name}</h3>
            <p>{plan.price}</p>
          </div>
          <ul className={styles.benefitList}>
            {plan.benefits.map((benefit, index) => (
              <li key={`${plan.id}-${index}`}>{benefit}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function PublishedPlanList({
  products,
}: {
  readonly products: readonly CommerceProductDTO[];
}) {
  return (
    <ol className={styles.planGrid}>
      {products.map((product) => (
        <li className={styles.planTile} key={product.id}>
          {product.productType === "membership" ? (
            <TelemetryPageView
              eventName="membership-view"
              resourceId={product.id}
              resourceType="membership"
            />
          ) : null}
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
        </li>
      ))}
    </ol>
  );
}

function CustomLicensingPreview() {
  return (
    <section className={styles.customPreview} aria-labelledby="custom-title">
      <h2 id="custom-title">Custom Licensing</h2>
      <form className={styles.customForm} aria-label="Custom Licensing form">
        <div className={styles.customFieldGrid}>
          <label className={styles.customField}>
            <span>Name</span>
            <input disabled name="name" />
          </label>
          <label className={styles.customField}>
            <span>Email</span>
            <input disabled name="email" type="email" />
          </label>
        </div>
        <div className={styles.customFieldGrid}>
          <label className={styles.customField}>
            <span>Company</span>
            <input disabled name="company" />
          </label>
          <label className={styles.customField}>
            <span>Project</span>
            <input disabled name="project" />
          </label>
        </div>
        <label className={styles.customField}>
          <span>Message</span>
          <textarea disabled name="message" rows={7} />
        </label>
        <label className={styles.customConsent}>
          <input disabled name="consent" type="checkbox" />
          <span>Consent</span>
        </label>
        <button className="button button-primary" disabled type="submit">
          Send inquiry
        </button>
      </form>
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
  requestAccess,
  signInHref,
}: LicensingCatalogProps) {
  const educationPattern = /education|student|school|academic/i;
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
      product.productType === "subscription",
  );

  return (
    <main className={`page-frame ${styles.page}`}>
      <h1 className="sr-only">Licensing</h1>
      <section
        className={styles.section}
        aria-labelledby="license-offers-title"
      >
        <h2 id="license-offers-title">One-Time Licenses</h2>

        {offers.length === 0 ? (
          <PreviewPlanList plans={PREVIEW_ONE_TIME_LICENSES} />
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

      <section className={styles.section} aria-labelledby="subscriptions-title">
        <h2 id="subscriptions-title">Licensing Subscriptions</h2>
        {licensingSubscriptions.length > 0 ? (
          <PublishedPlanList products={licensingSubscriptions} />
        ) : (
          <PreviewPlanList plans={PREVIEW_LICENSE_SUBSCRIPTIONS} />
        )}
      </section>

      <section className={styles.section} aria-labelledby="education-title">
        <h2 id="education-title">Education Plans</h2>
        {educationProducts.length > 0 ? (
          <PublishedPlanList products={educationProducts} />
        ) : (
          <PreviewPlanList plans={PREVIEW_EDUCATION_PLANS} />
        )}
      </section>

      {contactForm ? (
        <section className={styles.section} aria-label="Custom Licensing">
          <ContactForm
            defaultCategory="licens"
            description={null}
            embedded
            form={contactForm}
            title="Custom Licensing"
          />
        </section>
      ) : (
        <section className={styles.section} aria-label="Custom Licensing">
          <CustomLicensingPreview />
        </section>
      )}

      <section className={styles.section} aria-labelledby="faq-title">
        <h2 id="faq-title">Licensing FAQ</h2>
        <div className={styles.faqList}>
          {PREVIEW_FAQS.map((id) => (
            <details className={styles.faqItem} key={id}>
              <summary>
                <span>Question</span>
                <span aria-hidden="true" className={styles.faqMarker}>
                  +
                </span>
              </summary>
              <p>Answer</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}

export default LicensingCatalog;
