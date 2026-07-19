import Link from "next/link";
import type { CustomerAdminDetail } from "@/lib/operations/types.ts";
import styles from "./CustomerDetailWorkspace.module.css";

export interface CustomerDetailWorkspaceProps {
  readonly detail: CustomerAdminDetail;
}

function dateTime(value: string | null): string {
  if (value === null) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${minor} ${currency}`;
  }
}

export function CustomerDetailWorkspace({
  detail,
}: CustomerDetailWorkspaceProps) {
  return (
    <div className={styles.workspace}>
      <aside
        className={styles.testModeNotice}
        aria-label="Stripe Test Mode"
        data-stripe-test-mode="true"
      >
        <strong>Stripe Test Mode</strong>
        <span>No real payment will be accepted.</span>
      </aside>

      <header className={styles.heading}>
        <p className="eyebrow">Customer relationship</p>
        <h2>{detail.identity.displayName}</h2>
        <p>{detail.identity.email}</p>
        <dl className={styles.identityFacts}>
          <div>
            <dt>User ID</dt>
            <dd>
              <code>{detail.identity.userId}</code>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{detail.identity.status}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{dateTime(detail.identity.createdAt)}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{dateTime(detail.identity.updatedAt)}</dd>
          </div>
        </dl>
      </header>

      <section
        className={styles.section}
        aria-labelledby="entitlements-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="entitlements-heading">Entitlements</h3>
            <p>
              Current and historical access authority for this exact user ID.
            </p>
          </div>
          <Link className="text-link" href="/admin/access">
            Manage access
          </Link>
        </div>
        {detail.entitlements.length === 0 ? (
          <p className={styles.empty}>No entitlements recorded.</p>
        ) : (
          <ul className={styles.records}>
            {detail.entitlements.map((item) => (
              <li key={item.id}>
                <code>{item.id}</code>
                <strong>
                  {item.resourceType}:{item.resourceId}
                </strong>
                <span>{item.actions.join(", ")}</span>
                <span data-state={item.state}>{item.state}</span>
                <span>{item.sourceType}</span>
                <time dateTime={item.updatedAt}>
                  {dateTime(item.updatedAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className={styles.section}
        aria-labelledby="relationships-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="relationships-heading">Memberships and subscriptions</h3>
            <p>Recurring access state and frozen plan relationships.</p>
          </div>
          <Link className="text-link" href="/admin/memberships">
            Manage relationships
          </Link>
        </div>
        {detail.memberships.length === 0 &&
        detail.subscriptions.length === 0 ? (
          <p className={styles.empty}>
            No membership or subscription relationships recorded.
          </p>
        ) : (
          <ul className={styles.relationships}>
            {detail.memberships.map((item) => (
              <li key={item.id} data-stripe-test-mode="true">
                <span>Membership</span>
                <code>{item.id}</code>
                <strong>{item.planName}</strong>
                <span data-state={item.state}>{item.state}</span>
                <span>
                  {dateTime(item.currentPeriodStart)} to{" "}
                  {dateTime(item.currentPeriodEnd)}
                </span>
                <span>
                  {item.stripeEnvironment} · live mode {String(item.livemode)}
                </span>
              </li>
            ))}
            {detail.subscriptions.map((item) => (
              <li key={item.id} data-stripe-test-mode="true">
                <span>Subscription</span>
                <code>{item.id}</code>
                <strong>{item.planName}</strong>
                <span data-state={item.state}>{item.state}</span>
                <span>
                  {dateTime(item.currentPeriodStart)} to{" "}
                  {dateTime(item.currentPeriodEnd)}
                </span>
                <span>
                  {item.stripeEnvironment} · live mode {String(item.livemode)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="credits-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="credits-heading">Credits</h3>
            <p>Download and license balances from the durable credit ledger.</p>
          </div>
          <Link
            className="text-link"
            href={`/admin/credits?customer=${encodeURIComponent(detail.identity.userId)}`}
          >
            Open credit ledger
          </Link>
        </div>
        {detail.credits.length === 0 ? (
          <p className={styles.empty}>No credit accounts recorded.</p>
        ) : (
          <dl className={styles.creditFacts}>
            {detail.credits.map((credit) => (
              <div key={credit.id} data-stripe-test-mode="true">
                <dt>{credit.kind} credits</dt>
                <dd>{credit.available} available</dd>
                <dd>{credit.reserved} reserved</dd>
                <dd>{credit.consumed} consumed</dd>
                <dd>{credit.lotCount} durable lots</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className={styles.section} aria-labelledby="orders-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="orders-heading">Test orders and fulfillment</h3>
            <p>
              Signed test events, exactly-once orders, and fulfillment evidence.
            </p>
          </div>
          <Link className="text-link" href="/admin/commerce">
            Open commerce
          </Link>
        </div>
        {detail.orders.length === 0 ? (
          <p className={styles.empty}>No test orders recorded.</p>
        ) : (
          <ul className={styles.orders}>
            {detail.orders.map((order) => (
              <li key={order.id} data-stripe-test-mode="true">
                <code>{order.id}</code>
                <strong>{order.productName ?? "Recorded test product"}</strong>
                <span>{order.productType ?? "product"}</span>
                <span data-state={order.status}>{order.status}</span>
                <span>{money(order.totalMinor, order.currency)}</span>
                <time dateTime={order.createdAt}>
                  {dateTime(order.createdAt)}
                </time>
                <span>
                  {order.stripeEnvironment} · live mode {String(order.livemode)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {detail.fulfillmentEvents.length > 0 ? (
          <ul className={styles.subrecords} aria-label="Fulfillment events">
            {detail.fulfillmentEvents.map((event) => (
              <li key={event.id} data-stripe-test-mode="true">
                <code>{event.id}</code>
                <span>{event.kind}</span>
                <span data-state={event.status}>{event.status}</span>
                <time dateTime={event.createdAt}>
                  {dateTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="licenses-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="licenses-heading">Licenses and documents</h3>
            <p>Requests, issued rights, and protected document state.</p>
          </div>
          <Link className="text-link" href="/admin/licensing">
            Open licensing
          </Link>
        </div>
        {detail.licenses.length === 0 ? (
          <p className={styles.empty}>No license relationships recorded.</p>
        ) : (
          <ul className={styles.relationships}>
            {detail.licenses.map((license) => (
              <li key={license.requestId} data-stripe-test-mode="true">
                <code>{license.requestId}</code>
                <strong>{license.trackTitle}</strong>
                <span>{license.requestState}</span>
                <span>
                  {license.issuedLicenseId
                    ? `${license.licenseState} license`
                    : "not issued"}
                </span>
                <span>
                  {license.documentId
                    ? `${license.documentState} document`
                    : "no document"}
                </span>
                <time dateTime={license.updatedAt}>
                  {dateTime(license.updatedAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="course-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="course-heading">Course progress</h3>
            <p>Lesson progress joined through this customer user ID.</p>
          </div>
          <Link className="text-link" href="/admin/courses">
            Open Courses
          </Link>
        </div>
        {detail.courseProgress.length === 0 ? (
          <p className={styles.empty}>No Course progress recorded.</p>
        ) : (
          <ul className={styles.records}>
            {detail.courseProgress.map((progress) => (
              <li key={progress.id}>
                <code>{progress.id}</code>
                <strong>{progress.courseTitle}</strong>
                <span>{progress.lessonKey}</span>
                <span data-state={progress.state}>{progress.state}</span>
                <span>{progress.completedItemCount} completed items</span>
                <time dateTime={progress.updatedAt}>
                  {dateTime(progress.updatedAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="contact-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="contact-heading">Contact history</h3>
            <p>Signed-in inquiries joined only through submitter_user_id.</p>
          </div>
          <Link className="text-link" href="/admin/contact">
            Open contact
          </Link>
        </div>
        {detail.contactSubmissions.length === 0 ? (
          <p className={styles.empty}>
            No signed-in contact submissions recorded.
          </p>
        ) : (
          <ul className={styles.records}>
            {detail.contactSubmissions.map((submission) => (
              <li key={submission.id}>
                <code>{submission.id}</code>
                <strong>{submission.subject}</strong>
                <span>{submission.category}</span>
                <span data-state={submission.state}>{submission.state}</span>
                <span>consented {dateTime(submission.consentedAt)}</span>
                <time dateTime={submission.createdAt}>
                  {dateTime(submission.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="button button-secondary" href="/admin/customers">
        Back to customers
      </Link>
    </div>
  );
}
