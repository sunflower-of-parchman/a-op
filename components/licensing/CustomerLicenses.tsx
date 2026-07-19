import Link from "next/link";
import {
  CommerceCheckoutButton,
  CommerceTestModeNotice,
} from "@/components/commerce";
import type { CreditAccountDetailDTO } from "@/lib/benefit-credits/index.ts";
import type {
  CustomerLicenseHistoryDTO,
  LicenseTermsSnapshot,
} from "@/lib/licensing/types.ts";

import styles from "./Licensing.module.css";
import { LicenseCreditRedemptionAction } from "./LicenseCreditRedemptionAction";

export interface CustomerLicensesProps {
  readonly history: CustomerLicenseHistoryDTO;
  readonly licenseCredits: CreditAccountDetailDTO | null;
}

function dateTime(value: string | null): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(parsed);
}

function label(value: string): string {
  return value
    .split("_")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function frozenTerms(snapshot: LicenseTermsSnapshot): string {
  return `${snapshot.terms.title} · frozen version ${snapshot.terms.version}`;
}

export function CustomerLicenses({
  history,
  licenseCredits,
}: CustomerLicensesProps) {
  const licenseById = new Map(
    history.licenses.map((license) => [license.id, license] as const),
  );

  return (
    <div className="account-content">
      <header className="workspace-section-heading">
        <p className="eyebrow">Licensing</p>
        <h2>Your licenses</h2>
        <p>
          Intended-use requests, frozen terms, issued rights, document status,
          and access history stay connected here.
        </p>
      </header>

      <CommerceTestModeNotice detail="Approved offers may continue to Stripe-hosted Test Checkout. Test events exercise licensing and protected-delivery contracts without moving money." />

      <section className={styles.section} aria-labelledby="requests-title">
        <div className={styles.headingGroup}>
          <h3 id="requests-title">Requests</h3>
          <p>Every submission retains the exact offer and intended use.</p>
        </div>
        {history.requests.length === 0 ? (
          <p className={styles.emptyState}>No licensing requests yet.</p>
        ) : (
          <ol className={styles.recordList}>
            {history.requests.map((request) => {
              const creditReservation = licenseCredits?.reservations.find(
                (reservation) =>
                  reservation.purposeType === "license_request" &&
                  reservation.purposeId === request.id,
              );
              const canUseCredits = request.termsSnapshot.option
                .requiresApproval
                ? request.state === "approved"
                : request.state === "submitted";
              return (
                <li className={styles.recordRow} key={request.id}>
                  <div className={styles.recordIdentity}>
                    <span className={styles.testLabel}>Test record</span>
                    <h3>{request.termsSnapshot.track.title}</h3>
                    <span>{request.termsSnapshot.option.label}</span>
                    <span className={styles.recordMeta}>
                      {request.intendedUseSnapshot.projectTitle} ·{" "}
                      {request.intendedUseSnapshot.licenseeName}
                    </span>
                  </div>
                  <div className={styles.recordFacts}>
                    <span>Request state</span>
                    <strong>{label(request.state)}</strong>
                    <span>Revision {request.revision}</span>
                    <span>{dateTime(request.updatedAt)}</span>
                  </div>
                  <div className={styles.recordFacts}>
                    <span>Terms authority</span>
                    <strong>{frozenTerms(request.termsSnapshot)}</strong>
                    <span>{request.termsSnapshot.option.territory}</span>
                    <span>{request.intendedUseSnapshot.intendedUse}</span>
                  </div>
                  {request.state === "approved" ? (
                    <div className={styles.recordActions}>
                      <CommerceCheckoutButton
                        licenseRequestId={request.id}
                        productId={
                          request.termsSnapshot.offer.commerceProductId
                        }
                        productName={`${request.termsSnapshot.track.title} · ${request.termsSnapshot.option.label}`}
                      />
                    </div>
                  ) : null}
                  {canUseCredits ? (
                    <div className={styles.recordActions}>
                      <LicenseCreditRedemptionAction
                        availableCredits={
                          licenseCredits?.account.available ?? 0
                        }
                        hasRecoverableReservation={
                          creditReservation?.state === "reserved" ||
                          creditReservation?.state === "consumed"
                        }
                        licenseCreditCost={
                          request.termsSnapshot.option.licenseCreditCost
                        }
                        licenseRequestId={request.id}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="credits-title">
        <div className={styles.headingGroup}>
          <h3 id="credits-title">License credits</h3>
          <p>
            Available, reserved, and consumed Test-mode credits remain tied to
            their exact license requests and immutable ledger history.
          </p>
        </div>
        {licenseCredits === null ? (
          <p className={styles.emptyState}>No license credits are available.</p>
        ) : (
          <>
            <dl className={styles.summaryList}>
              <div className={styles.summaryItem}>
                <dt>Available</dt>
                <dd>{licenseCredits.account.available}</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>Reserved</dt>
                <dd>{licenseCredits.account.reserved}</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>Consumed</dt>
                <dd>{licenseCredits.account.consumed}</dd>
              </div>
            </dl>
            {licenseCredits.reservations.length === 0 ? (
              <p className={styles.emptyState}>
                No license-credit redemptions recorded.
              </p>
            ) : (
              <ol className={styles.recordList}>
                {licenseCredits.reservations.map((reservation) => (
                  <li className={styles.recordRow} key={reservation.id}>
                    <div className={styles.recordIdentity}>
                      <span className={styles.testLabel}>Test record</span>
                      <h3>{label(reservation.state)}</h3>
                      <span className={styles.recordMeta}>
                        {reservation.purposeId}
                      </span>
                    </div>
                    <div className={styles.recordFacts}>
                      <span>Exact quantity</span>
                      <strong>{reservation.quantity} license credits</strong>
                      <span>Revision {reservation.revision}</span>
                    </div>
                    <div className={styles.recordFacts}>
                      <span>Operation</span>
                      <strong>{reservation.requestId}</strong>
                      <span>{dateTime(reservation.updatedAt)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="issued-title">
        <div className={styles.headingGroup}>
          <h3 id="issued-title">Issued licenses</h3>
          <p>
            The frozen terms and track revision remain attached throughout the
            license lifecycle.
          </p>
        </div>
        {history.licenses.length === 0 ? (
          <p className={styles.emptyState}>No licenses have been issued.</p>
        ) : (
          <ol className={styles.recordList}>
            {history.licenses.map((license) => (
              <li className={styles.recordRow} key={license.id}>
                <div className={styles.recordIdentity}>
                  <span className={styles.testLabel}>Test record</span>
                  <h3>{license.termsSnapshot.track.title}</h3>
                  <span>{license.termsSnapshot.option.label}</span>
                  <span className={styles.recordMeta}>{license.id}</span>
                </div>
                <div className={styles.recordFacts}>
                  <span>License state</span>
                  <strong>{label(license.state)}</strong>
                  <span>Issued {dateTime(license.issuedAt)}</span>
                  <span>
                    {license.expiresAt
                      ? `Expires ${dateTime(license.expiresAt)}`
                      : "No fixed expiry"}
                  </span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Authority</span>
                  <strong>{frozenTerms(license.termsSnapshot)}</strong>
                  <span>Source {label(license.source)}</span>
                  <span>Revision {license.revision}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="documents-title">
        <div className={styles.headingGroup}>
          <h3 id="documents-title">License documents</h3>
          <p>
            Ready files are generated from the frozen issued terms and remain
            behind the same server-owned license entitlement on every download.
          </p>
        </div>
        {history.documents.length === 0 ? (
          <p className={styles.emptyState}>No license documents are queued.</p>
        ) : (
          <ol className={styles.recordList}>
            {history.documents.map((document) => {
              const license = licenseById.get(document.issuedLicenseId);
              return (
                <li className={styles.recordRow} key={document.id}>
                  <div className={styles.recordIdentity}>
                    <span className={styles.testLabel}>Test record</span>
                    <h3>
                      {license?.termsSnapshot.track.title ?? "License document"}
                    </h3>
                    <span className={styles.recordMeta}>{document.id}</span>
                  </div>
                  <div className={styles.recordFacts}>
                    <span>Document state</span>
                    <strong>{label(document.state)}</strong>
                    <span>Revision {document.revision}</span>
                  </div>
                  <div className={styles.recordFacts}>
                    <span>Issued license</span>
                    <strong>{document.issuedLicenseId}</strong>
                    <span>{dateTime(document.updatedAt)}</span>
                    {document.byteLength ? (
                      <span>{document.byteLength} bytes</span>
                    ) : null}
                  </div>
                  {document.state === "ready" && license?.state === "active" ? (
                    <div className={styles.recordActions}>
                      <Link
                        className="button button-secondary"
                        href={`/api/licensing/documents/${encodeURIComponent(document.id)}/download`}
                      >
                        Download license document
                      </Link>
                      <p className={styles.recordMeta}>
                        Stripe Test Mode · No real payment will be accepted.
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="events-title">
        <div className={styles.headingGroup}>
          <h3 id="events-title">License events</h3>
          <p>Submission, decisions, issuance, and terminal changes in order.</p>
        </div>
        {history.events.length === 0 ? (
          <p className={styles.emptyState}>No license events recorded.</p>
        ) : (
          <ol className={styles.timeline}>
            {history.events.map((event) => (
              <li className={styles.timelineRow} key={event.id}>
                <div className={styles.recordIdentity}>
                  <span className={styles.testLabel}>Test record</span>
                  <h3>{label(event.eventType)}</h3>
                  <span className={styles.recordMeta}>
                    Source {label(event.source)}
                  </span>
                </div>
                <div className={styles.timelineFacts}>
                  <span>{dateTime(event.createdAt)}</span>
                  <span>
                    {event.licenseRequestId ?? "No request reference"}
                  </span>
                  <span>{event.issuedLicenseId ?? "No license reference"}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default CustomerLicenses;
