import { CommerceTestModeNotice } from "@/components/commerce";
import type { CreditKind } from "@/lib/benefit-credits/types.ts";
import type { CustomerMembershipSurfaceDTO } from "./types.ts";
import styles from "./Memberships.module.css";

export interface CustomerMembershipsProps {
  readonly data: CustomerMembershipSurfaceDTO;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function stateLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function creditLabel(kind: CreditKind): string {
  return kind === "download" ? "Download credits" : "License credits";
}

export function CustomerMemberships({ data }: CustomerMembershipsProps) {
  const providerBacked =
    data.directMemberships.some(
      ({ membership }) => membership.source === "stripe_test",
    ) ||
    data.subscriptions.some(
      ({ subscription }) => subscription.source === "stripe_test",
    );
  const history = data.subscriptions
    .flatMap(({ subscription, subscriptionPlan, history: events }) =>
      events.map((event) => ({ event, subscription, subscriptionPlan })),
    )
    .sort(
      (left, right) =>
        Date.parse(right.event.createdAt) - Date.parse(left.event.createdAt),
    );

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <p className="eyebrow">Artist-provided access</p>
        <h2>Memberships and subscriptions</h2>
        <p>
          Current benefits, access periods, credit balances, and retained
          relationship history from this artist.
        </p>
      </header>

      <CommerceTestModeNotice
        detail={
          providerBacked
            ? "Records marked Stripe Test Mode came from verified test events. No real payment was accepted."
            : "This installation keeps commerce records in the test-only environment and cannot accept a real payment."
        }
      />

      <section className={styles.section} aria-labelledby="credit-title">
        <header className={styles.sectionHeading}>
          <p className="eyebrow">Available benefits</p>
          <h3 id="credit-title">Credits</h3>
        </header>
        <dl className={styles.creditGrid}>
          {(["download", "license"] as const).map((kind) => {
            const account = data.credits.find(
              ({ creditKind }) => creditKind === kind,
            );
            return (
              <div key={kind}>
                <dt>{creditLabel(kind)}</dt>
                <dd>{account?.available ?? 0}</dd>
                <dd className={styles.meta}>
                  {account?.reserved ?? 0} reserved · {account?.consumed ?? 0}{" "}
                  used
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="relationship-title">
        <header className={styles.sectionHeading}>
          <p className="eyebrow">Current and retained</p>
          <h3 id="relationship-title">Relationships</h3>
        </header>
        {data.directMemberships.length === 0 &&
        data.subscriptions.length === 0 ? (
          <p className={styles.empty}>
            No membership or subscription relationship has been created for this
            account.
          </p>
        ) : (
          <ul className={styles.relationshipList}>
            {data.directMemberships.map(({ membership, plan }) => (
              <li className={styles.relationshipRow} key={membership.id}>
                <div className={styles.relationshipIdentity}>
                  <div className={styles.titleLine}>
                    <h4>{plan.name}</h4>
                    <span
                      className={styles.state}
                      data-state={membership.state}
                    >
                      {stateLabel(membership.state)}
                    </span>
                    {membership.source === "stripe_test" ? (
                      <span className={styles.testRecordLabel}>
                        Stripe Test Mode
                      </span>
                    ) : null}
                  </div>
                  <p>{plan.description}</p>
                  <span className={styles.meta}>
                    Membership · plan revision{" "}
                    {membership.membershipPlanRevision}
                  </span>
                </div>
                <dl className={styles.periodFacts}>
                  <div>
                    <dt>Started</dt>
                    <dd>
                      <time dateTime={membership.currentPeriodStart}>
                        {dateLabel(membership.currentPeriodStart)}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Access through</dt>
                    <dd>
                      <time dateTime={membership.currentPeriodEnd}>
                        {dateLabel(membership.currentPeriodEnd)}
                      </time>
                    </dd>
                  </div>
                  {membership.cancelAt ? (
                    <div>
                      <dt>Cancellation boundary</dt>
                      <dd>
                        <time dateTime={membership.cancelAt}>
                          {dateLabel(membership.cancelAt)}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className={styles.benefits}>
                  <span>Included benefits</span>
                  {plan.benefits.length > 0 ? (
                    <ul>
                      {plan.benefits.map((benefit) => (
                        <li key={benefit}>{benefit}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.meta}>No labeled benefits.</p>
                  )}
                  <p className={styles.meta}>
                    {plan.downloadCredits} download · {plan.licenseCredits}{" "}
                    license credits at activation
                  </p>
                </div>
              </li>
            ))}
            {data.subscriptions.map(
              ({ subscription, subscriptionPlan, membershipPlan }) => (
                <li className={styles.relationshipRow} key={subscription.id}>
                  <div className={styles.relationshipIdentity}>
                    <div className={styles.titleLine}>
                      <h4>{subscriptionPlan.name}</h4>
                      <span
                        className={styles.state}
                        data-state={subscription.state}
                      >
                        {stateLabel(subscription.state)}
                      </span>
                      {subscription.source === "stripe_test" ? (
                        <span className={styles.testRecordLabel}>
                          Stripe Test Mode
                        </span>
                      ) : null}
                    </div>
                    <p>{subscriptionPlan.description}</p>
                    <span className={styles.meta}>
                      Every {subscriptionPlan.intervalCount}{" "}
                      {subscriptionPlan.billingInterval}
                      {subscriptionPlan.intervalCount === 1 ? "" : "s"} ·
                      subscription revision {subscription.revision}
                    </span>
                  </div>
                  <dl className={styles.periodFacts}>
                    <div>
                      <dt>Current period</dt>
                      <dd>
                        <time dateTime={subscription.currentPeriodStart}>
                          {dateLabel(subscription.currentPeriodStart)}
                        </time>
                        {" – "}
                        <time dateTime={subscription.currentPeriodEnd}>
                          {dateLabel(subscription.currentPeriodEnd)}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>Renewal date</dt>
                      <dd>
                        <time dateTime={subscription.currentPeriodEnd}>
                          {dateLabel(subscription.currentPeriodEnd)}
                        </time>
                      </dd>
                    </div>
                    {subscription.cancelAt ? (
                      <div>
                        <dt>Cancellation boundary</dt>
                        <dd>
                          <time dateTime={subscription.cancelAt}>
                            {dateLabel(subscription.cancelAt)}
                          </time>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className={styles.benefits}>
                    <span>Included benefits</span>
                    {membershipPlan.benefits.length > 0 ? (
                      <ul>
                        {membershipPlan.benefits.map((benefit) => (
                          <li key={benefit}>{benefit}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.meta}>No labeled benefits.</p>
                    )}
                    <p className={styles.meta}>
                      {membershipPlan.downloadCredits} download ·{" "}
                      {membershipPlan.licenseCredits} license credits each
                      period
                    </p>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="history-title">
        <header className={styles.sectionHeading}>
          <p className="eyebrow">Durable record</p>
          <h3 id="history-title">Subscription history</h3>
        </header>
        {history.length === 0 ? (
          <p className={styles.empty}>No subscription events yet.</p>
        ) : (
          <ol className={styles.historyList}>
            {history.map(({ event, subscription, subscriptionPlan }) => (
              <li key={event.id}>
                <div>
                  <strong>{subscriptionPlan.name}</strong>
                  <span>{stateLabel(event.eventType)}</span>
                </div>
                <span>
                  {event.fromState ? `${stateLabel(event.fromState)} → ` : ""}
                  {stateLabel(event.toState)}
                </span>
                <time dateTime={event.createdAt}>
                  {dateLabel(event.createdAt)}
                </time>
                {subscription.source === "stripe_test" ? (
                  <span className={styles.testRecordLabel}>
                    Stripe Test Mode
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default CustomerMemberships;
