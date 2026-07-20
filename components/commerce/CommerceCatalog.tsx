import Link from "next/link";
import type { CommerceProductDTO } from "@/lib/commerce/domain.ts";
import { TelemetryPageView } from "@/components/telemetry";

import styles from "./Commerce.module.css";
import { CommerceCheckoutButton } from "./CommerceCheckoutButton";

export type CommerceCheckoutAccess =
  "customer" | "signed-out" | "activation-required";

export interface CommerceCatalogProps {
  readonly checkoutAccess: CommerceCheckoutAccess;
  readonly products: readonly CommerceProductDTO[];
  readonly signInHref: string;
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function productTypeLabel(value: CommerceProductDTO["productType"]): string {
  const labels: Record<CommerceProductDTO["productType"], string> = {
    track: "Track",
    release: "Release",
    collection: "Collection",
    membership: "Membership",
    subscription: "Subscription",
    license: "License",
    "download-credits": "Download credits",
    "license-credits": "License credits",
  };
  return labels[value];
}

function cadence(product: CommerceProductDTO): string {
  if (product.billingInterval === "one_time") return "One-time test checkout";
  const interval = product.billingInterval === "month" ? "month" : "year";
  return product.intervalCount === 1
    ? `Every ${interval}`
    : `Every ${product.intervalCount} ${interval}s`;
}

function ProductAction({
  checkoutAccess,
  product,
  signInHref,
}: {
  readonly checkoutAccess: CommerceCheckoutAccess;
  readonly product: CommerceProductDTO;
  readonly signInHref: string;
}) {
  if (product.productType === "license") {
    return (
      <div className={styles.productAction}>
        <p className={styles.supportingText}>
          An approved licensing request is required before test checkout.
        </p>
        <Link className={styles.inlineLink} href="/licensing">
          Start a licensing request
        </Link>
      </div>
    );
  }
  if (checkoutAccess === "customer") {
    return (
      <CommerceCheckoutButton
        productId={product.id}
        productName={product.name}
      />
    );
  }
  if (checkoutAccess === "signed-out") {
    return (
      <div className={styles.productAction}>
        <Link className="button button-primary" href={signInHref}>
          Sign in for Test Checkout
        </Link>
      </div>
    );
  }
  return (
    <div className={styles.productAction}>
      <Link className="button button-primary" href="/account">
        Activate customer account
      </Link>
    </div>
  );
}

export function CommerceCatalog({
  checkoutAccess,
  products,
  signInHref,
}: CommerceCatalogProps) {
  return (
    <div className={`page-frame ${styles.page}`}>
      <section className={styles.section} aria-labelledby="test-products-title">
        <div className={styles.headingGroup}>
          <h2 id="test-products-title">Available test products</h2>
          <p>
            Choose an active product, continue to Stripe-hosted Test Checkout,
            and return here after the signed test event is processed.
          </p>
        </div>

        {products.length === 0 ? (
          <p className={styles.emptyState}>
            No test products are available. The artist can activate products
            when their catalog and access terms are ready.
          </p>
        ) : (
          <ul className={styles.productList}>
            {products.map((product) => (
              <li
                className={styles.productRow}
                id={product.offerAnchorId}
                key={product.id}
              >
                {product.productType === "membership" ? (
                  <TelemetryPageView
                    eventName="membership-view"
                    resourceId={product.id}
                    resourceType="membership"
                  />
                ) : null}
                <div className={styles.productIdentity}>
                  <span className={styles.productType}>
                    {productTypeLabel(product.productType)}
                  </span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                </div>
                <div className={styles.productTerms}>
                  <span className={styles.productPrice}>
                    {money(product.amountMinor, product.currency)}
                  </span>
                  <span className={styles.productCadence}>
                    {cadence(product)}
                  </span>
                  <span className={styles.testRecordLabel}>Test only</span>
                </div>
                <ProductAction
                  checkoutAccess={checkoutAccess}
                  product={product}
                  signInHref={signInHref}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default CommerceCatalog;
