import Link from "next/link";
import { CommerceTestModeNotice } from "@/components/commerce";
import { STRIPE_TEST_MODE_LABEL } from "@/lib/commerce/domain.ts";
import type {
  CustomerAccessEffectiveState,
  CustomerAccessLibraryDTO,
  CustomerAccessResourceDTO,
} from "@/lib/customer-access/types.ts";
import styles from "./CustomerAccessLibrary.module.css";

export interface CustomerAccessLibraryProps {
  readonly data: CustomerAccessLibraryDTO;
  readonly title?: string;
  readonly description?: string;
}

function dateLabel(value: string | null): string | null {
  if (value === null) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function byteLabel(value: number): string {
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} KB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

function resourceTypeLabel(value: CustomerAccessResourceDTO["resourceType"]) {
  return value === "license-document"
    ? "License document"
    : `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function Resource({
  resource,
}: {
  readonly resource: CustomerAccessResourceDTO;
}) {
  return (
    <div className={styles.resource}>
      {resource.available && resource.href ? (
        <Link className={styles.title} href={resource.href}>
          {resource.title}
        </Link>
      ) : (
        <span className={styles.title}>{resource.title}</span>
      )}
      <span className={styles.meta}>
        {resourceTypeLabel(resource.resourceType)}
        {resource.available ? "" : " · Currently unavailable"}
      </span>
    </div>
  );
}

function State({ value }: { readonly value: CustomerAccessEffectiveState }) {
  return (
    <span className={styles.state} data-state={value}>
      {value}
    </span>
  );
}

function TestModeRecordLabel({ visible }: { readonly visible: boolean }) {
  if (!visible) return null;
  return (
    <span className={styles.testRecordLabel}>{STRIPE_TEST_MODE_LABEL}</span>
  );
}

export function CustomerAccessLibrary({
  data,
  title = "Library",
  description = "Music and resources available to this account, with the artist-owned access source that currently makes each one available.",
}: CustomerAccessLibraryProps) {
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>

      <CommerceTestModeNotice detail="Commerce-derived memberships, subscriptions, licenses, credits, entitlements, and deliveries are marked below from their stored test provenance." />

      <section className={styles.section} aria-labelledby="available-title">
        <div className={styles.sectionHeading}>
          <h3 id="available-title">Available now</h3>
          <p>Every action below is decided again from current server state.</p>
        </div>
        {data.resources.length === 0 ? (
          <p className={styles.empty}>No protected resources are available.</p>
        ) : (
          <ul className={styles.rows}>
            {data.resources.map((item) => (
              <li
                className={styles.row}
                key={`${item.resource.resourceType}:${item.resource.resourceId}`}
              >
                <Resource resource={item.resource} />
                <div className={styles.details}>
                  <div className={styles.availableActions}>
                    <span className={styles.actions}>
                      {item.actions.join(" · ")}
                    </span>
                    {item.downloadUrl ? (
                      <a
                        aria-label={`Download ${item.resource.title}`}
                        className={styles.downloadAction}
                        href={item.downloadUrl}
                      >
                        Download
                      </a>
                    ) : null}
                  </div>
                  <ul className={styles.sources} aria-label="Access sources">
                    {item.sources.map((source) => (
                      <li
                        className={styles.source}
                        key={`${source.sourceType}:${source.entitlementId ?? "direct"}:${source.expiresAt ?? "open"}`}
                      >
                        <span className={styles.recordTitleLine}>
                          <strong>{source.explanation}</strong>
                          <TestModeRecordLabel
                            visible={source.commerceTestMode}
                          />
                        </span>
                        <span className={styles.sourceDetails}>
                          {source.expiresAt
                            ? `Available through ${dateLabel(source.expiresAt)}`
                            : "No scheduled expiry"}
                          {source.remainingUses === null
                            ? ""
                            : ` · ${source.remainingUses} use${source.remainingUses === 1 ? "" : "s"} remaining`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="grant-history-title">
        <div className={styles.sectionHeading}>
          <h3 id="grant-history-title">Grant history</h3>
          <p>Direct artist grants remain visible after their state changes.</p>
        </div>
        {data.grantHistory.length === 0 ? (
          <p className={styles.empty}>No direct access grants yet.</p>
        ) : (
          <ul className={styles.rows}>
            {data.grantHistory.map((grant) => (
              <li className={styles.row} key={grant.id}>
                <Resource resource={grant.resource} />
                <div className={styles.details}>
                  <strong>{grant.explanation}</strong>
                  <State value={grant.effectiveState} />
                  <span className={styles.meta}>
                    {grant.actions.join(" · ")}
                    {grant.expiresAt
                      ? ` · Expires ${dateLabel(grant.expiresAt)}`
                      : ""}
                    {grant.revokedAt
                      ? ` · Revoked ${dateLabel(grant.revokedAt)}`
                      : ""}
                    {grant.expiredAt
                      ? ` · Marked expired ${dateLabel(grant.expiredAt)}`
                      : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className={styles.section}
        aria-labelledby="entitlement-history-title"
      >
        <div className={styles.sectionHeading}>
          <h3 id="entitlement-history-title">Entitlement history</h3>
          <p>
            Membership, subscription, license, credit, and grant entitlements
            are shown from their durable records.
          </p>
        </div>
        {data.entitlementHistory.length === 0 ? (
          <p className={styles.empty}>No entitlement history yet.</p>
        ) : (
          <ul className={styles.rows}>
            {data.entitlementHistory.map((entitlement) => (
              <li className={styles.row} key={entitlement.id}>
                <Resource resource={entitlement.resource} />
                <div className={styles.details}>
                  <span className={styles.recordTitleLine}>
                    <strong>{entitlement.explanation}</strong>
                    <TestModeRecordLabel
                      visible={entitlement.commerceTestMode}
                    />
                  </span>
                  <State value={entitlement.effectiveState} />
                  <span className={styles.meta}>
                    {entitlement.actions.join(" · ")}
                    {entitlement.expiresAt
                      ? ` · Expires ${dateLabel(entitlement.expiresAt)}`
                      : ""}
                    {entitlement.remainingUses === null
                      ? ""
                      : ` · ${entitlement.remainingUses} use${entitlement.remainingUses === 1 ? "" : "s"} remaining`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className={styles.section}
        aria-labelledby="delivery-history-title"
      >
        <div className={styles.sectionHeading}>
          <h3 id="delivery-history-title">Delivery history</h3>
          <p>Successful customer downloads appear after delivery completes.</p>
        </div>
        {data.downloadHistory.length === 0 ? (
          <p className={styles.empty}>No downloads have been delivered.</p>
        ) : (
          <ul className={styles.rows}>
            {data.downloadHistory.map((delivery) => (
              <li className={styles.row} key={delivery.id}>
                <Resource resource={delivery.resource} />
                <div className={styles.details}>
                  <span className={styles.recordTitleLine}>
                    <strong>Delivered {dateLabel(delivery.deliveredAt)}</strong>
                    <TestModeRecordLabel visible={delivery.commerceTestMode} />
                  </span>
                  <span className={styles.meta}>
                    {byteLabel(delivery.byteLength)} · Access source:{" "}
                    {delivery.accessSource}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
