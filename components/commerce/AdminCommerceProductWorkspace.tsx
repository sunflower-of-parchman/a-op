"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { AdminCommerceProductDTO } from "@/db/commerce-admin-read.ts";
import type { CommerceProductType } from "@/lib/commerce/domain.ts";

import styles from "./AdminCommerceProductWorkspace.module.css";
import { useCommerceProductMutation } from "./useCommerceProductMutation";

export interface AdminCommerceProductWorkspaceProps {
  readonly products: readonly AdminCommerceProductDTO[];
}

const PRODUCT_OPTIONS: readonly {
  readonly value: CommerceProductType;
  readonly label: string;
}[] = Object.freeze([
  { value: "track", label: "Track access" },
  { value: "release", label: "Release access" },
  { value: "collection", label: "Collection access" },
  { value: "membership", label: "One-time membership" },
  { value: "subscription", label: "Recurring subscription" },
  { value: "license", label: "Approved-request license" },
  { value: "download-credits", label: "Download credits" },
  { value: "license-credits", label: "License credits" },
]);

function productTypeLabel(productType: CommerceProductType): string {
  return (
    PRODUCT_OPTIONS.find(({ value }) => value === productType)?.label ??
    productType
  );
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function billingLabel(product: AdminCommerceProductDTO): string {
  if (product.billingInterval === "one_time") return "One-time test price";
  return `Every ${
    product.intervalCount === 1 ? "" : `${product.intervalCount} `
  }${product.billingInterval}${product.intervalCount === 1 ? "" : "s"}`;
}

function subjectLabel(product: AdminCommerceProductDTO): string {
  const { subject } = product;
  if (subject.resourceType && subject.resourceId) {
    return `${subject.resourceType} ${subject.resourceId}`;
  }
  if (subject.membershipPlanId) {
    return `membership plan ${subject.membershipPlanId}, revision ${subject.membershipPlanRevision}`;
  }
  if (subject.subscriptionPlanId) {
    return `subscription plan ${subject.subscriptionPlanId}`;
  }
  if (subject.creditKind && subject.creditQuantity) {
    return `${subject.creditQuantity} ${subject.creditKind} credit${
      subject.creditQuantity === 1 ? "" : "s"
    }`;
  }
  return "Definition reference unavailable";
}

function operationError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The test product change did not finish.";
}

export function AdminCommerceProductWorkspace({
  products,
}: AdminCommerceProductWorkspaceProps) {
  const router = useRouter();
  const mutate = useCommerceProductMutation();
  const [productType, setProductType] = useState<CommerceProductType>("track");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [resourceRevisionId, setResourceRevisionId] = useState("");
  const [resourceVersion, setResourceVersion] = useState("1");
  const [accessPlanId, setAccessPlanId] = useState("");
  const [accessPlanRevision, setAccessPlanRevision] = useState("1");
  const [membershipPlanId, setMembershipPlanId] = useState("");
  const [membershipPlanRevision, setMembershipPlanRevision] = useState("1");
  const [subscriptionPlanId, setSubscriptionPlanId] = useState("");
  const [subscriptionPlanRevision, setSubscriptionPlanRevision] = useState("1");
  const [trackId, setTrackId] = useState("");
  const [trackRevisionId, setTrackRevisionId] = useState("");
  const [trackVersion, setTrackVersion] = useState("1");
  const [creditQuantity, setCreditQuantity] = useState("1");
  const [stripePriceId, setStripePriceId] = useState("");
  const [amountMinor, setAmountMinor] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [billingInterval, setBillingInterval] = useState<
    "one_time" | "month" | "year"
  >("one_time");
  const [intervalCount, setIntervalCount] = useState("1");
  const [selectedOffers, setSelectedOffers] = useState<
    Readonly<Record<string, string>>
  >({});
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"critical" | "positive" | undefined>();

  const productCounts = useMemo(
    () => ({
      draft: products.filter(({ state }) => state === "draft").length,
      active: products.filter(({ state }) => state === "active").length,
      archived: products.filter(({ state }) => state === "archived").length,
    }),
    [products],
  );

  const catalogProduct =
    productType === "track" ||
    productType === "release" ||
    productType === "collection";
  const creditProduct =
    productType === "download-credits" || productType === "license-credits";

  function changeProductType(nextType: CommerceProductType) {
    setProductType(nextType);
    setBillingInterval(nextType === "subscription" ? "month" : "one_time");
    setIntervalCount("1");
  }

  function resetForm() {
    setSlug("");
    setName("");
    setDescription("");
    setResourceId("");
    setResourceRevisionId("");
    setResourceVersion("1");
    setAccessPlanId("");
    setAccessPlanRevision("1");
    setMembershipPlanId("");
    setMembershipPlanRevision("1");
    setSubscriptionPlanId("");
    setSubscriptionPlanRevision("1");
    setTrackId("");
    setTrackRevisionId("");
    setTrackVersion("1");
    setCreditQuantity("1");
    setStripePriceId("");
    setAmountMinor("");
    setCurrency("USD");
    setBillingInterval(productType === "subscription" ? "month" : "one_time");
    setIntervalCount("1");
  }

  function subjectInput(): Record<string, unknown> {
    if (catalogProduct) {
      return {
        resourceId,
        resourceRevisionId,
        resourceVersion: Number(resourceVersion),
        accessPlanId,
        accessPlanRevision: Number(accessPlanRevision),
      };
    }
    if (productType === "membership") {
      return {
        membershipPlanId,
        membershipPlanRevision: Number(membershipPlanRevision),
      };
    }
    if (productType === "subscription") {
      return {
        subscriptionPlanId,
        subscriptionPlanRevision: Number(subscriptionPlanRevision),
      };
    }
    if (productType === "license") {
      return {
        trackId,
        trackRevisionId,
        trackVersion: Number(trackVersion),
      };
    }
    return { quantity: Number(creditQuantity) };
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setTone(undefined);
    setMessage("Creating the immutable Test Mode product definition…");
    try {
      await mutate("/api/admin/commerce/products", {
        product: {
          slug,
          name,
          description,
          productType,
          subject: subjectInput(),
          price: {
            stripePriceId,
            amountMinor: Number(amountMinor),
            currency,
            billingInterval,
            intervalCount: Number(intervalCount),
          },
        },
      });
      resetForm();
      setTone("positive");
      setMessage(
        "Draft test product created. Its definition and test price are now immutable.",
      );
      router.refresh();
    } catch (error) {
      setTone("critical");
      setMessage(operationError(error));
    } finally {
      setWorking(false);
    }
  }

  async function transitionProduct(
    product: AdminCommerceProductDTO,
    transition: "activate" | "archive",
  ) {
    const selectedOfferId =
      selectedOffers[product.id] ??
      product.licenseOffers.find(({ state }) => state !== "archived")?.id;
    const offer = product.licenseOffers.find(
      ({ id, state }) => id === selectedOfferId && state !== "archived",
    );
    if (
      transition === "activate" &&
      product.productType === "license" &&
      !offer
    ) {
      setTone("critical");
      setMessage(
        "Create a draft license offer for this product before activation.",
      );
      return;
    }
    setWorking(true);
    setTone(undefined);
    setMessage(
      `${transition === "activate" ? "Activating" : "Archiving"} ${
        product.name
      }…`,
    );
    try {
      await mutate(
        `/api/admin/commerce/products/${encodeURIComponent(product.id)}/${transition}`,
        transition === "activate"
          ? {
              expectedRevision: product.revision,
              licenseOffer:
                product.productType === "license" && offer
                  ? {
                      licenseOfferId: offer.id,
                      licenseOfferRevision: offer.revision,
                    }
                  : null,
            }
          : { expectedRevision: product.revision },
      );
      setTone("positive");
      setMessage(
        transition === "activate"
          ? `${product.name} is active for Stripe Test Checkout.`
          : `${product.name} is archived. Existing test order history remains intact.`,
      );
      router.refresh();
    } catch (error) {
      setTone("critical");
      setMessage(operationError(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="product-setup-title">
      <header className={styles.heading}>
        <p className="eyebrow">Test product catalog</p>
        <h2 id="product-setup-title">Create checkout definitions</h2>
        <p>
          Register one server-owned product and one immutable Stripe test price,
          then activate its sale state. Test checkout uses these saved facts and
          never accepts price, customer, access, or entitlement authority from
          the browser.
        </p>
      </header>

      <dl className={styles.summary}>
        <div>
          <dt>Draft</dt>
          <dd>{productCounts.draft}</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{productCounts.active}</dd>
        </div>
        <div>
          <dt>Archived</dt>
          <dd>{productCounts.archived}</dd>
        </div>
      </dl>

      <section className={styles.section} aria-labelledby="new-product-title">
        <header className={styles.sectionHeading}>
          <h3 id="new-product-title">New Test Mode product</h3>
          <p id="reference-help">
            Product references use stable application IDs and exact current
            revisions. Copy them from Music, Access, Memberships, or Licensing
            administration. The server verifies every reference again when the
            draft is created and activated.
          </p>
        </header>

        <form
          aria-describedby="reference-help"
          className={styles.form}
          onSubmit={createProduct}
        >
          <fieldset className={styles.formSection}>
            <legend>Definition</legend>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Product type</span>
                <select
                  onChange={(event) =>
                    changeProductType(event.target.value as CommerceProductType)
                  }
                  value={productType}
                >
                  {PRODUCT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Slug</span>
                <input
                  autoComplete="off"
                  maxLength={80}
                  onChange={(event) => setSlug(event.target.value)}
                  required
                  spellCheck={false}
                  value={slug}
                />
                <small>Lowercase words separated by hyphens.</small>
              </label>
              <label className={styles.field}>
                <span>Name</span>
                <input
                  maxLength={160}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label className={`${styles.field} ${styles.fullWidth}`}>
                <span>Description</span>
                <textarea
                  maxLength={4000}
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>Server-owned subject</legend>
            <div className={styles.fieldGrid}>
              {catalogProduct ? (
                <>
                  <IdentifierField
                    label={`${productTypeLabel(productType)} resource ID`}
                    onChange={setResourceId}
                    value={resourceId}
                  />
                  <IdentifierField
                    label="Published resource revision ID"
                    onChange={setResourceRevisionId}
                    value={resourceRevisionId}
                  />
                  <NumberField
                    label="Resource version"
                    onChange={setResourceVersion}
                    value={resourceVersion}
                  />
                  <IdentifierField
                    label="Access plan ID"
                    onChange={setAccessPlanId}
                    value={accessPlanId}
                  />
                  <NumberField
                    label="Access plan revision"
                    onChange={setAccessPlanRevision}
                    value={accessPlanRevision}
                  />
                </>
              ) : null}
              {productType === "membership" ? (
                <>
                  <IdentifierField
                    label="Membership plan ID"
                    onChange={setMembershipPlanId}
                    value={membershipPlanId}
                  />
                  <NumberField
                    label="Membership plan revision"
                    onChange={setMembershipPlanRevision}
                    value={membershipPlanRevision}
                  />
                </>
              ) : null}
              {productType === "subscription" ? (
                <>
                  <IdentifierField
                    label="Subscription plan ID"
                    onChange={setSubscriptionPlanId}
                    value={subscriptionPlanId}
                  />
                  <NumberField
                    label="Subscription plan revision"
                    onChange={setSubscriptionPlanRevision}
                    value={subscriptionPlanRevision}
                  />
                </>
              ) : null}
              {productType === "license" ? (
                <>
                  <IdentifierField
                    label="Track ID"
                    onChange={setTrackId}
                    value={trackId}
                  />
                  <IdentifierField
                    label="Published track revision ID"
                    onChange={setTrackRevisionId}
                    value={trackRevisionId}
                  />
                  <NumberField
                    label="Track version"
                    onChange={setTrackVersion}
                    value={trackVersion}
                  />
                </>
              ) : null}
              {creditProduct ? (
                <NumberField
                  label="Credit quantity"
                  maximum={100000}
                  onChange={setCreditQuantity}
                  value={creditQuantity}
                />
              ) : null}
            </div>
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>Immutable Stripe test price</legend>
            <p className={styles.fieldsetHelp}>
              Create the price in Stripe Test mode first. Enter its public
              price_ identifier here. No API key or payment detail belongs in
              this form.
            </p>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Stripe test price ID</span>
                <input
                  autoComplete="off"
                  maxLength={255}
                  onChange={(event) => setStripePriceId(event.target.value)}
                  pattern="price_[A-Za-z0-9]{6,255}"
                  required
                  spellCheck={false}
                  value={stripePriceId}
                />
                <small>Must begin with price_.</small>
              </label>
              <NumberField
                label="Amount in minor units"
                maximum={999999999}
                onChange={setAmountMinor}
                value={amountMinor}
              />
              <label className={styles.field}>
                <span>Currency</span>
                <input
                  autoComplete="off"
                  maxLength={3}
                  minLength={3}
                  onChange={(event) =>
                    setCurrency(event.target.value.toUpperCase())
                  }
                  pattern="[A-Za-z]{3}"
                  required
                  spellCheck={false}
                  value={currency}
                />
              </label>
              <label className={styles.field}>
                <span>Billing interval</span>
                <select
                  disabled={productType !== "subscription"}
                  onChange={(event) =>
                    setBillingInterval(
                      event.target.value as "month" | "one_time" | "year",
                    )
                  }
                  value={billingInterval}
                >
                  {productType === "subscription" ? (
                    <>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </>
                  ) : (
                    <option value="one_time">One time</option>
                  )}
                </select>
              </label>
              <NumberField
                label="Interval count"
                maximum={120}
                onChange={setIntervalCount}
                value={intervalCount}
              />
            </div>
          </fieldset>

          <div className={styles.actions}>
            <button
              className="button button-primary"
              disabled={working}
              type="submit"
            >
              {working ? "Creating…" : "Create draft test product"}
            </button>
          </div>
        </form>
      </section>

      <section
        className={styles.section}
        aria-labelledby="saved-products-title"
      >
        <header className={styles.sectionHeading}>
          <h3 id="saved-products-title">Saved product definitions</h3>
          <p>
            Activation opens a definition to hosted Stripe Test Checkout.
            Archiving closes its sale state and preserves test order history.
            There is no definition-edit or live-mode control.
          </p>
        </header>

        <p
          aria-live="polite"
          className={styles.message}
          data-tone={tone}
          role="status"
        >
          {message}
        </p>

        {products.length === 0 ? (
          <p className={styles.empty}>No test products have been created.</p>
        ) : (
          <ol className={styles.productList}>
            {products.map((product) => {
              const availableOffers = product.licenseOffers.filter(
                ({ state }) => state !== "archived",
              );
              const selectedOfferId =
                selectedOffers[product.id] ?? availableOffers[0]?.id ?? "";
              return (
                <li className={styles.productRow} key={product.id}>
                  <div className={styles.productIdentity}>
                    <div className={styles.titleLine}>
                      <span className={styles.testLabel}>Test product</span>
                      <span className={styles.state} data-state={product.state}>
                        {product.state}
                      </span>
                    </div>
                    <h4>{product.name}</h4>
                    <p>{product.description || "No product description."}</p>
                    <span className={styles.identifier}>{product.id}</span>
                  </div>

                  <dl className={styles.productFacts}>
                    <div>
                      <dt>Type</dt>
                      <dd>{productTypeLabel(product.productType)}</dd>
                    </div>
                    <div>
                      <dt>Subject</dt>
                      <dd>{subjectLabel(product)}</dd>
                    </div>
                    <div>
                      <dt>Product revision</dt>
                      <dd>{product.revision}</dd>
                    </div>
                  </dl>

                  <dl className={styles.productFacts}>
                    <div>
                      <dt>Test price</dt>
                      <dd>{money(product.amountMinor, product.currency)}</dd>
                    </div>
                    <div>
                      <dt>Cadence</dt>
                      <dd>{billingLabel(product)}</dd>
                    </div>
                    <div>
                      <dt>Stripe price</dt>
                      <dd className={styles.identifier}>
                        {product.stripePriceId}
                      </dd>
                    </div>
                  </dl>

                  <div className={styles.productActions}>
                    {product.state === "draft" &&
                    product.productType === "license" ? (
                      availableOffers.length > 0 ? (
                        <label className={styles.compactField}>
                          <span>License offer revision</span>
                          <select
                            onChange={(event) =>
                              setSelectedOffers((current) => ({
                                ...current,
                                [product.id]: event.target.value,
                              }))
                            }
                            value={selectedOfferId}
                          >
                            {availableOffers.map((offer) => (
                              <option key={offer.id} value={offer.id}>
                                {offer.slug} · revision {offer.revision} ·{" "}
                                {offer.state}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className={styles.actionHelp}>
                          A draft license offer must reference this product and
                          test price before activation. Configure it in{" "}
                          <Link href="/admin/licensing">Licensing</Link>.
                        </p>
                      )
                    ) : null}
                    <div className={styles.actionButtons}>
                      {product.state === "draft" ? (
                        <button
                          className="button button-primary"
                          disabled={
                            working ||
                            (product.productType === "license" &&
                              availableOffers.length === 0)
                          }
                          onClick={() => transitionProduct(product, "activate")}
                          type="button"
                        >
                          Activate test product
                        </button>
                      ) : null}
                      {product.state !== "archived" ? (
                        <button
                          className="button button-secondary"
                          disabled={working}
                          onClick={() => transitionProduct(product, "archive")}
                          type="button"
                        >
                          Archive
                        </button>
                      ) : (
                        <span className={styles.actionHelp}>
                          Archived sale state is terminal.
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </section>
  );
}

interface IdentifierFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

function IdentifierField({ label, onChange, value }: IdentifierFieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        autoComplete="off"
        maxLength={128}
        onChange={(event) => onChange(event.target.value)}
        required
        spellCheck={false}
        value={value}
      />
    </label>
  );
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maximum?: number;
}

function NumberField({
  label,
  maximum = Number.MAX_SAFE_INTEGER,
  onChange,
  value,
}: NumberFieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        inputMode="numeric"
        max={maximum}
        min={1}
        onChange={(event) => onChange(event.target.value)}
        required
        step={1}
        type="number"
        value={value}
      />
    </label>
  );
}

export default AdminCommerceProductWorkspace;
