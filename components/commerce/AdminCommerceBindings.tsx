"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AdminCommerceBindingIntentDTO } from "@/db/commerce-binding-read.ts";

import styles from "./AdminCommerceProductWorkspace.module.css";
import { useCommerceProductMutation } from "./useCommerceProductMutation";

export interface AdminCommerceBindingsProps {
  readonly bindings: readonly AdminCommerceBindingIntentDTO[];
}

function money(binding: AdminCommerceBindingIntentDTO): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: binding.currency,
  }).format(binding.amountMinor / 100);
}

function cadence(binding: AdminCommerceBindingIntentDTO): string {
  if (binding.billingInterval === "one_time") return "one time";
  return `every ${
    binding.intervalCount === 1 ? "" : `${binding.intervalCount} `
  }${binding.billingInterval}${binding.intervalCount === 1 ? "" : "s"}`;
}

export function AdminCommerceBindings({
  bindings,
}: AdminCommerceBindingsProps) {
  const router = useRouter();
  const mutate = useCommerceProductMutation();
  const [prices, setPrices] = useState<Readonly<Record<string, string>>>({});
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"critical" | "positive" | undefined>();

  async function bindPrice(
    event: FormEvent<HTMLFormElement>,
    binding: AdminCommerceBindingIntentDTO,
  ) {
    event.preventDefault();
    setWorkingKey(binding.intentKey);
    setTone(undefined);
    setMessage(`Connecting ${binding.name} to Stripe Test Mode…`);
    try {
      await mutate(
        `/api/admin/commerce/bindings/${encodeURIComponent(binding.intentKey)}`,
        { stripePriceId: prices[binding.intentKey] ?? "" },
      );
      setTone("positive");
      setMessage(`${binding.name} is active for Stripe Test Checkout.`);
      router.refresh();
    } catch (error) {
      setTone("critical");
      setMessage(
        error instanceof Error
          ? error.message
          : "The Stripe Test price was not connected.",
      );
    } finally {
      setWorkingKey(null);
    }
  }

  return (
    <section
      className={styles.section}
      aria-labelledby="pending-bindings-title"
    >
      <header className={styles.sectionHeading}>
        <h3 id="pending-bindings-title">Connect setup products</h3>
        <p>
          Create the matching product and price in Stripe Test Mode, then paste
          its price ID here. a-op verifies the owner, activates the frozen plan,
          and connects one immutable test product and price.
        </p>
      </header>

      {bindings.length === 0 ? (
        <p className={styles.empty}>No commerce bindings are pending.</p>
      ) : (
        <ol className={styles.productList}>
          {bindings.map((binding) => (
            <li className={styles.productRow} key={binding.intentKey}>
              <div className={styles.productIdentity}>
                <span className={styles.testLabel}>Stripe Test Mode</span>
                <h4>{binding.name}</h4>
                <p>{binding.description}</p>
              </div>
              <dl className={styles.productFacts}>
                <div>
                  <dt>Price</dt>
                  <dd>{money(binding)}</dd>
                </div>
                <div>
                  <dt>Billing</dt>
                  <dd>{cadence(binding)}</dd>
                </div>
              </dl>
              <div className={styles.productFacts}>
                <div>
                  <dt>Type</dt>
                  <dd>{binding.intentKind}</dd>
                </div>
                <div>
                  <dt>Setup revision</dt>
                  <dd>{binding.revision}</dd>
                </div>
              </div>
              <form
                className={styles.productActions}
                onSubmit={(event) => bindPrice(event, binding)}
              >
                <label className={styles.field}>
                  <span>Stripe Test price ID</span>
                  <input
                    autoComplete="off"
                    onChange={(event) =>
                      setPrices((current) => ({
                        ...current,
                        [binding.intentKey]: event.target.value,
                      }))
                    }
                    pattern="price_[A-Za-z0-9]+"
                    placeholder="price_…"
                    required
                    spellCheck={false}
                    value={prices[binding.intentKey] ?? ""}
                  />
                </label>
                <button
                  className="button button-primary"
                  disabled={workingKey !== null}
                  type="submit"
                >
                  {workingKey === binding.intentKey
                    ? "Connecting…"
                    : "Connect test price"}
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
      <p aria-live="polite" className={styles.message} data-tone={tone}>
        {message}
      </p>
    </section>
  );
}
