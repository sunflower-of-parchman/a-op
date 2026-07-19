"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CommerceTestModeNotice } from "@/components/commerce";
import type {
  MembershipDTO,
  MembershipPlanDTO,
  SubscriptionDTO,
  SubscriptionPlanDTO,
} from "@/lib/memberships/types.ts";
import styles from "./Memberships.module.css";
import type { AdminMembershipSurfaceDTO } from "./types.ts";
import { useMembershipMutation } from "./useMembershipMutation";

export interface AdminMembershipsProps {
  readonly data: AdminMembershipSurfaceDTO;
  readonly subscriptionsActive: boolean;
}

type RelationshipKind = "membership" | "subscription";
type RelationshipAction =
  | "pause"
  | "resume"
  | "schedule-cancellation"
  | "clear-cancellation"
  | "apply-cancellation"
  | "expire"
  | "renew";

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function stateLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The membership change did not finish.";
}

function integer(
  value: string,
  label: string,
  options: { readonly minimum: number; readonly maximum: number },
): number {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < options.minimum ||
    parsed > options.maximum
  ) {
    throw new Error(
      `${label} must be a whole number from ${options.minimum} to ${options.maximum}.`,
    );
  }
  return parsed;
}

function optionalDuration(value: string): number | null {
  if (value.trim() === "") return null;
  return integer(value, "Duration", { minimum: 1, maximum: 36_500 });
}

function isoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Choose a valid start time.");
  return new Date(parsed).toISOString();
}

function customerCreditLabel(
  data: AdminMembershipSurfaceDTO,
  customerUserId: string,
): string {
  const download = data.credits.find(
    (account) =>
      account.customerUserId === customerUserId &&
      account.creditKind === "download",
  );
  const license = data.credits.find(
    (account) =>
      account.customerUserId === customerUserId &&
      account.creditKind === "license",
  );
  return `${download?.available ?? 0} download · ${license?.available ?? 0} license credits available`;
}

function planRevisionLabel(plan: MembershipPlanDTO): string {
  return `revision ${plan.revision} · ${plan.downloadCredits} download · ${plan.licenseCredits} license credits`;
}

function subscriptionCadence(plan: SubscriptionPlanDTO): string {
  return `Every ${plan.intervalCount} ${plan.billingInterval}${
    plan.intervalCount === 1 ? "" : "s"
  }`;
}

export function AdminMemberships({
  data,
  subscriptionsActive,
}: AdminMembershipsProps) {
  const router = useRouter();
  const mutate = useMembershipMutation();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const [membershipEditingId, setMembershipEditingId] = useState<string | null>(
    null,
  );
  const [membershipExpectedRevision, setMembershipExpectedRevision] = useState<
    number | null
  >(null);
  const [membershipSlug, setMembershipSlug] = useState("");
  const [membershipName, setMembershipName] = useState("");
  const [membershipDescription, setMembershipDescription] = useState("");
  const [membershipBenefits, setMembershipBenefits] = useState("");
  const [membershipAccessPlanId, setMembershipAccessPlanId] = useState("");
  const [membershipDownloadCredits, setMembershipDownloadCredits] =
    useState("0");
  const [membershipLicenseCredits, setMembershipLicenseCredits] = useState("0");
  const [membershipDurationDays, setMembershipDurationDays] = useState("");

  const [subscriptionEditingId, setSubscriptionEditingId] = useState<
    string | null
  >(null);
  const [subscriptionExpectedRevision, setSubscriptionExpectedRevision] =
    useState<number | null>(null);
  const [subscriptionSlug, setSubscriptionSlug] = useState("");
  const [subscriptionName, setSubscriptionName] = useState("");
  const [subscriptionDescription, setSubscriptionDescription] = useState("");
  const [subscriptionMembershipPlanId, setSubscriptionMembershipPlanId] =
    useState("");
  const [subscriptionBillingInterval, setSubscriptionBillingInterval] =
    useState<"month" | "year">("month");
  const [subscriptionIntervalCount, setSubscriptionIntervalCount] =
    useState("1");

  const activeMembershipPlans = useMemo(
    () =>
      data.membershipPlans
        .map(({ plan }) => plan)
        .filter(({ state }) => state === "active"),
    [data.membershipPlans],
  );
  const directMembershipPlans = useMemo(
    () => activeMembershipPlans.filter(({ durationDays }) => durationDays),
    [activeMembershipPlans],
  );
  const activeSubscriptionPlans = useMemo(
    () =>
      data.subscriptionPlans
        .map(({ plan }) => plan)
        .filter(({ state }) => state === "active"),
    [data.subscriptionPlans],
  );
  const activeCustomers = useMemo(
    () => data.customers.filter(({ active }) => active),
    [data.customers],
  );
  const [relationshipKind, setRelationshipKind] =
    useState<RelationshipKind>("membership");
  const [relationshipPlanId, setRelationshipPlanId] = useState(
    directMembershipPlans[0]?.id ?? "",
  );
  const [relationshipCustomerId, setRelationshipCustomerId] = useState(
    activeCustomers[0]?.userId ?? "",
  );
  const [relationshipStartsAt, setRelationshipStartsAt] = useState("");

  function resetMembershipEditor() {
    setMembershipEditingId(null);
    setMembershipExpectedRevision(null);
    setMembershipSlug("");
    setMembershipName("");
    setMembershipDescription("");
    setMembershipBenefits("");
    setMembershipAccessPlanId("");
    setMembershipDownloadCredits("0");
    setMembershipLicenseCredits("0");
    setMembershipDurationDays("");
  }

  function editMembershipPlan(plan: MembershipPlanDTO) {
    if (plan.state === "archived") return;
    setMembershipEditingId(plan.id);
    setMembershipExpectedRevision(plan.revision);
    setMembershipSlug(plan.slug);
    setMembershipName(plan.name);
    setMembershipDescription(plan.description);
    setMembershipBenefits(plan.benefits.join("\n"));
    setMembershipAccessPlanId(plan.accessPlanId ?? "");
    setMembershipDownloadCredits(String(plan.downloadCredits));
    setMembershipLicenseCredits(String(plan.licenseCredits));
    setMembershipDurationDays(
      plan.durationDays === null ? "" : String(plan.durationDays),
    );
    setMessage(`Editing ${plan.name}.`);
  }

  async function saveMembershipPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessPlan = data.accessPlans.find(
      ({ id }) => id === membershipAccessPlanId,
    );
    const definition = {
      name: membershipName,
      description: membershipDescription,
      benefits: membershipBenefits
        .split(/\r?\n/)
        .map((benefit) => benefit.trim())
        .filter(Boolean),
      accessPlanId: accessPlan?.id ?? null,
      accessPlanRevision: accessPlan?.revision ?? null,
      downloadCredits: integer(membershipDownloadCredits, "Download credits", {
        minimum: 0,
        maximum: 100_000,
      }),
      licenseCredits: integer(membershipLicenseCredits, "License credits", {
        minimum: 0,
        maximum: 100_000,
      }),
      durationDays: optionalDuration(membershipDurationDays),
    };
    setWorking(true);
    setMessage(
      membershipEditingId
        ? "Saving membership plan…"
        : "Creating membership plan…",
    );
    try {
      if (membershipEditingId !== null && membershipExpectedRevision !== null) {
        await mutate(
          `/api/admin/memberships/plans/membership/${encodeURIComponent(membershipEditingId)}`,
          "PUT",
          {
            expectedRevision: membershipExpectedRevision,
            plan: definition,
          },
        );
        setMessage("Membership plan saved as a new revision.");
      } else {
        await mutate("/api/admin/memberships/plans/membership", "POST", {
          plan: {
            slug: membershipSlug,
            state: "active",
            ...definition,
          },
        });
        setMessage("Membership plan created and active.");
      }
      resetMembershipEditor();
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function resetSubscriptionEditor() {
    setSubscriptionEditingId(null);
    setSubscriptionExpectedRevision(null);
    setSubscriptionSlug("");
    setSubscriptionName("");
    setSubscriptionDescription("");
    setSubscriptionMembershipPlanId("");
    setSubscriptionBillingInterval("month");
    setSubscriptionIntervalCount("1");
  }

  function editSubscriptionPlan(plan: SubscriptionPlanDTO) {
    const entry = data.subscriptionPlans.find(
      ({ plan: candidate }) => candidate.id === plan.id,
    );
    if (plan.state === "archived" || (entry?.relationshipCount ?? 0) > 0)
      return;
    setSubscriptionEditingId(plan.id);
    setSubscriptionExpectedRevision(plan.revision);
    setSubscriptionSlug(plan.slug);
    setSubscriptionName(plan.name);
    setSubscriptionDescription(plan.description);
    setSubscriptionMembershipPlanId(plan.membershipPlanId);
    setSubscriptionBillingInterval(plan.billingInterval);
    setSubscriptionIntervalCount(String(plan.intervalCount));
    setMessage(`Editing ${plan.name}.`);
  }

  async function saveSubscriptionPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const membershipPlan = activeMembershipPlans.find(
      ({ id }) => id === subscriptionMembershipPlanId,
    );
    if (!membershipPlan) {
      setMessage("Choose an active membership plan.");
      return;
    }
    const definition = {
      name: subscriptionName,
      description: subscriptionDescription,
      membershipPlanId: membershipPlan.id,
      membershipPlanRevision: membershipPlan.revision,
      billingInterval: subscriptionBillingInterval,
      intervalCount: integer(subscriptionIntervalCount, "Billing interval", {
        minimum: 1,
        maximum: 120,
      }),
    };
    setWorking(true);
    setMessage(
      subscriptionEditingId
        ? "Saving subscription plan…"
        : "Creating subscription plan…",
    );
    try {
      if (
        subscriptionEditingId !== null &&
        subscriptionExpectedRevision !== null
      ) {
        await mutate(
          `/api/admin/memberships/plans/subscription/${encodeURIComponent(subscriptionEditingId)}`,
          "PUT",
          {
            expectedRevision: subscriptionExpectedRevision,
            plan: definition,
          },
        );
        setMessage("Subscription plan saved.");
      } else {
        await mutate("/api/admin/memberships/plans/subscription", "POST", {
          plan: {
            slug: subscriptionSlug,
            state: "active",
            ...definition,
          },
        });
        setMessage("Subscription plan created and active.");
      }
      resetSubscriptionEditor();
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function chooseRelationshipKind(kind: RelationshipKind) {
    setRelationshipKind(kind);
    setRelationshipPlanId(
      kind === "membership"
        ? (directMembershipPlans[0]?.id ?? "")
        : (activeSubscriptionPlans[0]?.id ?? ""),
    );
  }

  async function activateRelationship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = isoTimestamp(relationshipStartsAt);
    const plan =
      relationshipKind === "membership"
        ? directMembershipPlans.find(({ id }) => id === relationshipPlanId)
        : activeSubscriptionPlans.find(({ id }) => id === relationshipPlanId);
    if (!plan || relationshipCustomerId === "") {
      setMessage("Choose an active plan and customer.");
      return;
    }
    const activation =
      relationshipKind === "membership"
        ? {
            membershipPlanId: plan.id,
            membershipPlanRevision: plan.revision,
            customerUserId: relationshipCustomerId,
            startsAt,
          }
        : {
            subscriptionPlanId: plan.id,
            subscriptionPlanRevision: plan.revision,
            customerUserId: relationshipCustomerId,
            startsAt,
          };
    setWorking(true);
    setMessage(`Activating ${relationshipKind}…`);
    try {
      await mutate(
        `/api/admin/memberships/relationships/${relationshipKind}`,
        "POST",
        { activation },
      );
      setRelationshipStartsAt("");
      setMessage(
        relationshipKind === "membership"
          ? "Membership activated with access and credits."
          : "Subscription activated with its first period, access, and credits.",
      );
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function transitionRelationship(
    kind: RelationshipKind,
    relationship: MembershipDTO | SubscriptionDTO,
    action: RelationshipAction,
  ) {
    setWorking(true);
    setMessage(`${stateLabel(action)}…`);
    try {
      const boundaryAction =
        action === "apply-cancellation" || action === "expire";
      await mutate(
        `/api/admin/memberships/relationships/${kind}/${encodeURIComponent(
          relationship.id,
        )}/${action}`,
        "POST",
        boundaryAction
          ? {
              expectedRevision: relationship.revision,
              effectiveAt: new Date().toISOString(),
            }
          : { expectedRevision: relationship.revision },
      );
      setMessage(
        `${kind === "membership" ? "Membership" : "Subscription"} updated.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function relationshipActions(
    kind: RelationshipKind,
    relationship: MembershipDTO | SubscriptionDTO,
  ): ReactNode {
    if (relationship.source === "stripe_test") {
      return (
        <p className={styles.providerMessage}>
          Follows verified Test Mode events.
        </p>
      );
    }
    const readAt = Date.parse(data.readAt);
    const boundaryReached = Date.parse(relationship.currentPeriodEnd) <= readAt;
    const cancellationReached =
      relationship.cancelAt !== null &&
      Date.parse(relationship.cancelAt) <= readAt;
    const terminal =
      relationship.state === "canceled" || relationship.state === "expired";
    return (
      <div className={styles.relationshipActions}>
        {relationship.state === "active" ? (
          <>
            <button
              className="button button-secondary"
              type="button"
              disabled={working}
              onClick={() =>
                transitionRelationship(kind, relationship, "pause")
              }
            >
              Pause
            </button>
            <button
              className="text-link"
              type="button"
              disabled={working}
              onClick={() =>
                transitionRelationship(
                  kind,
                  relationship,
                  "schedule-cancellation",
                )
              }
            >
              Schedule cancellation
            </button>
            {kind === "subscription" ? (
              <button
                className="text-link"
                type="button"
                disabled={working}
                onClick={() =>
                  transitionRelationship(kind, relationship, "renew")
                }
              >
                Renew period
              </button>
            ) : null}
          </>
        ) : null}
        {relationship.state === "paused" ? (
          <button
            className="button button-secondary"
            type="button"
            disabled={working}
            onClick={() => transitionRelationship(kind, relationship, "resume")}
          >
            Resume
          </button>
        ) : null}
        {relationship.state === "cancellation_scheduled" ? (
          <>
            <button
              className="button button-secondary"
              type="button"
              disabled={working}
              onClick={() =>
                transitionRelationship(kind, relationship, "clear-cancellation")
              }
            >
              Clear cancellation
            </button>
            {cancellationReached ? (
              <button
                className="text-link"
                type="button"
                disabled={working}
                onClick={() =>
                  transitionRelationship(
                    kind,
                    relationship,
                    "apply-cancellation",
                  )
                }
              >
                Apply cancellation
              </button>
            ) : null}
          </>
        ) : null}
        {!terminal && boundaryReached ? (
          <button
            className="text-link"
            type="button"
            disabled={working}
            onClick={() => transitionRelationship(kind, relationship, "expire")}
          >
            Expire access
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <p className="eyebrow">Artist-controlled access</p>
        <h2>Memberships and subscriptions</h2>
        <p>
          Define benefits, activate customer relationships, and operate each
          durable access period from server-owned records.
        </p>
      </header>

      <CommerceTestModeNotice detail="There is no live-commerce control. Provider-backed records follow verified Test Mode events." />

      <p className={styles.message} aria-live="polite" role="status">
        {message}
      </p>

      <section className={styles.section} aria-labelledby="plans-title">
        <header className={styles.sectionHeading}>
          <p className="eyebrow">Definitions</p>
          <h3 id="plans-title">Plans</h3>
          <p>
            Membership revisions pin benefits, access, credits, and duration.
            Subscription plans pin one membership revision and cadence.
          </p>
        </header>

        <div className={styles.definitionGroup}>
          <h4>Membership plans</h4>
          {data.membershipPlans.length === 0 ? (
            <p className={styles.empty}>No membership plans yet.</p>
          ) : (
            <ul className={styles.definitionList}>
              {data.membershipPlans.map(({ plan, relationshipCount }) => (
                <li className={styles.definitionRow} key={plan.id}>
                  <div className={styles.rowPrimary}>
                    <div className={styles.titleLine}>
                      <strong>{plan.name}</strong>
                      <span className={styles.state} data-state={plan.state}>
                        {plan.state}
                      </span>
                    </div>
                    <span className={styles.meta}>
                      {planRevisionLabel(plan)} · {relationshipCount}{" "}
                      relationship{relationshipCount === 1 ? "" : "s"}
                    </span>
                    {plan.description ? <p>{plan.description}</p> : null}
                    <span className={styles.meta}>
                      {plan.durationDays
                        ? `${plan.durationDays} day direct period`
                        : "Subscription use"}
                      {plan.accessPlanId
                        ? ` · access plan revision ${plan.accessPlanRevision}`
                        : " · no protected access plan"}
                    </span>
                    {plan.benefits.length > 0 ? (
                      <ul className={styles.inlineList}>
                        {plan.benefits.map((benefit) => (
                          <li key={benefit}>{benefit}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={working || plan.state === "archived"}
                      onClick={() => editMembershipPlan(plan)}
                    >
                      Edit revision
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.definitionGroup}>
          <h4>Subscription plans</h4>
          {!subscriptionsActive ? (
            <p className={styles.empty}>
              Activate the Subscriptions module to define recurring periods.
            </p>
          ) : data.subscriptionPlans.length === 0 ? (
            <p className={styles.empty}>No subscription plans yet.</p>
          ) : (
            <ul className={styles.definitionList}>
              {data.subscriptionPlans.map(({ plan, relationshipCount }) => (
                <li className={styles.definitionRow} key={plan.id}>
                  <div className={styles.rowPrimary}>
                    <div className={styles.titleLine}>
                      <strong>{plan.name}</strong>
                      <span className={styles.state} data-state={plan.state}>
                        {plan.state}
                      </span>
                    </div>
                    <span className={styles.meta}>
                      {subscriptionCadence(plan)} · revision {plan.revision} ·{" "}
                      {relationshipCount} relationship
                      {relationshipCount === 1 ? "" : "s"}
                    </span>
                    {plan.description ? <p>{plan.description}</p> : null}
                    <span className={styles.meta}>
                      Membership plan revision {plan.membershipPlanRevision}
                      {relationshipCount > 0 ? " · definition locked" : ""}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={
                        working ||
                        plan.state === "archived" ||
                        relationshipCount > 0
                      }
                      onClick={() => editSubscriptionPlan(plan)}
                    >
                      Edit definition
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        className={styles.section}
        aria-labelledby="membership-plan-editor-title"
      >
        <header className={styles.sectionHeading}>
          <p className="eyebrow">{membershipEditingId ? "Revise" : "Create"}</p>
          <h3 id="membership-plan-editor-title">
            {membershipEditingId
              ? "Revise membership plan"
              : "New membership plan"}
          </h3>
          <p>
            Leave duration empty for subscription-only benefits. A direct
            membership requires a fixed duration.
          </p>
        </header>
        <form className={styles.form} onSubmit={saveMembershipPlan}>
          <div className={styles.fieldGrid}>
            <label>
              <span>Name</span>
              <input
                required
                maxLength={120}
                value={membershipName}
                onChange={(event) => setMembershipName(event.target.value)}
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                required
                maxLength={80}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                disabled={membershipEditingId !== null}
                value={membershipSlug}
                onChange={(event) =>
                  setMembershipSlug(event.target.value.toLowerCase())
                }
              />
            </label>
          </div>
          <label>
            <span>Description</span>
            <textarea
              maxLength={4000}
              rows={3}
              value={membershipDescription}
              onChange={(event) => setMembershipDescription(event.target.value)}
            />
          </label>
          <label>
            <span>Benefits, one per line</span>
            <textarea
              maxLength={5152}
              rows={4}
              value={membershipBenefits}
              onChange={(event) => setMembershipBenefits(event.target.value)}
            />
          </label>
          <div className={styles.fieldGrid}>
            <label>
              <span>Protected access plan</span>
              <select
                value={membershipAccessPlanId}
                onChange={(event) =>
                  setMembershipAccessPlanId(event.target.value)
                }
              >
                <option value="">No protected access plan</option>
                {data.accessPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · revision {plan.revision}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Duration in days</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={36500}
                value={membershipDurationDays}
                onChange={(event) =>
                  setMembershipDurationDays(event.target.value)
                }
              />
            </label>
            <label>
              <span>Download credits</span>
              <input
                required
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                value={membershipDownloadCredits}
                onChange={(event) =>
                  setMembershipDownloadCredits(event.target.value)
                }
              />
            </label>
            <label>
              <span>License credits</span>
              <input
                required
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                value={membershipLicenseCredits}
                onChange={(event) =>
                  setMembershipLicenseCredits(event.target.value)
                }
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button
              className="button button-primary"
              type="submit"
              disabled={working}
            >
              {membershipEditingId ? "Save revision" : "Create active plan"}
            </button>
            {membershipEditingId ? (
              <button
                className="button button-secondary"
                type="button"
                disabled={working}
                onClick={resetMembershipEditor}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section
        className={styles.section}
        aria-labelledby="subscription-plan-editor-title"
      >
        <header className={styles.sectionHeading}>
          <p className="eyebrow">
            {subscriptionEditingId ? "Revise" : "Create"}
          </p>
          <h3 id="subscription-plan-editor-title">
            {subscriptionEditingId
              ? "Revise subscription plan"
              : "New subscription plan"}
          </h3>
          <p>
            The selected membership revision supplies benefits and credits for
            each retained subscription period.
          </p>
        </header>
        {!subscriptionsActive ? (
          <p className={styles.empty}>
            Subscription plan controls follow the active Subscriptions module.
          </p>
        ) : (
          <form className={styles.form} onSubmit={saveSubscriptionPlan}>
            <div className={styles.fieldGrid}>
              <label>
                <span>Name</span>
                <input
                  required
                  maxLength={120}
                  value={subscriptionName}
                  onChange={(event) => setSubscriptionName(event.target.value)}
                />
              </label>
              <label>
                <span>Slug</span>
                <input
                  required
                  maxLength={80}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  disabled={subscriptionEditingId !== null}
                  value={subscriptionSlug}
                  onChange={(event) =>
                    setSubscriptionSlug(event.target.value.toLowerCase())
                  }
                />
              </label>
            </div>
            <label>
              <span>Description</span>
              <textarea
                maxLength={4000}
                rows={3}
                value={subscriptionDescription}
                onChange={(event) =>
                  setSubscriptionDescription(event.target.value)
                }
              />
            </label>
            <div className={styles.fieldGrid}>
              <label>
                <span>Membership benefits</span>
                <select
                  required
                  value={subscriptionMembershipPlanId}
                  onChange={(event) =>
                    setSubscriptionMembershipPlanId(event.target.value)
                  }
                >
                  <option value="">Choose an active membership plan</option>
                  {activeMembershipPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · revision {plan.revision}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Billing interval</span>
                <select
                  value={subscriptionBillingInterval}
                  onChange={(event) =>
                    setSubscriptionBillingInterval(
                      event.target.value as "month" | "year",
                    )
                  }
                >
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </label>
              <label>
                <span>Intervals per period</span>
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  value={subscriptionIntervalCount}
                  onChange={(event) =>
                    setSubscriptionIntervalCount(event.target.value)
                  }
                />
              </label>
            </div>
            <div className={styles.actions}>
              <button
                className="button button-primary"
                type="submit"
                disabled={working || activeMembershipPlans.length === 0}
              >
                {subscriptionEditingId
                  ? "Save subscription plan"
                  : "Create active subscription plan"}
              </button>
              {subscriptionEditingId ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={working}
                  onClick={resetSubscriptionEditor}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        )}
      </section>

      <section className={styles.section} aria-labelledby="activate-title">
        <header className={styles.sectionHeading}>
          <p className="eyebrow">Customer relationship</p>
          <h3 id="activate-title">Activate access</h3>
          <p>
            Activation atomically creates the relationship, exact entitlements,
            credits, and first period from the selected revision.
          </p>
        </header>
        <form className={styles.form} onSubmit={activateRelationship}>
          <div className={styles.fieldGrid}>
            <label>
              <span>Relationship</span>
              <select
                value={relationshipKind}
                onChange={(event) =>
                  chooseRelationshipKind(event.target.value as RelationshipKind)
                }
              >
                <option value="membership">Membership</option>
                {subscriptionsActive ? (
                  <option value="subscription">Subscription</option>
                ) : null}
              </select>
            </label>
            <label>
              <span>Plan</span>
              <select
                required
                value={relationshipPlanId}
                onChange={(event) => setRelationshipPlanId(event.target.value)}
              >
                <option value="">Choose an active plan</option>
                {(relationshipKind === "membership"
                  ? directMembershipPlans
                  : activeSubscriptionPlans
                ).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · revision {plan.revision}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Customer</span>
              <select
                required
                value={relationshipCustomerId}
                onChange={(event) =>
                  setRelationshipCustomerId(event.target.value)
                }
              >
                <option value="">Choose an active customer</option>
                {activeCustomers.map((customer) => (
                  <option key={customer.userId} value={customer.userId}>
                    {customer.displayName} · {customer.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Starts at</span>
              <input
                required
                type="datetime-local"
                value={relationshipStartsAt}
                onChange={(event) =>
                  setRelationshipStartsAt(event.target.value)
                }
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button
              className="button button-primary"
              type="submit"
              disabled={
                working ||
                activeCustomers.length === 0 ||
                (relationshipKind === "membership"
                  ? directMembershipPlans.length === 0
                  : activeSubscriptionPlans.length === 0)
              }
            >
              Activate {relationshipKind}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="relationships-title">
        <header className={styles.sectionHeading}>
          <p className="eyebrow">Durable state</p>
          <h3 id="relationships-title">Customer relationships</h3>
          <p>
            Manual controls enforce revision and period boundaries on the
            server. Test provider records remain event-controlled.
          </p>
        </header>
        {data.directMemberships.length === 0 &&
        data.subscriptions.length === 0 ? (
          <p className={styles.empty}>No customer relationships yet.</p>
        ) : (
          <ul className={styles.adminRelationshipList}>
            {data.directMemberships.map(({ membership, plan, customer }) => (
              <li className={styles.adminRelationshipRow} key={membership.id}>
                <div className={styles.rowPrimary}>
                  <div className={styles.titleLine}>
                    <strong>{plan.name}</strong>
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
                  <span>
                    {customer?.displayName ?? membership.customerUserId}
                  </span>
                  {customer ? (
                    <span className={styles.meta}>{customer.email}</span>
                  ) : null}
                  <span className={styles.meta}>
                    Direct membership · plan revision{" "}
                    {membership.membershipPlanRevision} · relationship revision{" "}
                    {membership.revision}
                  </span>
                  <span className={styles.meta}>
                    {customerCreditLabel(data, membership.customerUserId)}
                  </span>
                </div>
                <dl className={styles.periodFacts}>
                  <div>
                    <dt>Current period</dt>
                    <dd>
                      {dateTimeLabel(membership.currentPeriodStart)} –{" "}
                      {dateTimeLabel(membership.currentPeriodEnd)}
                    </dd>
                  </div>
                  {membership.cancelAt ? (
                    <div>
                      <dt>Cancellation boundary</dt>
                      <dd>{dateTimeLabel(membership.cancelAt)}</dd>
                    </div>
                  ) : null}
                </dl>
                {relationshipActions("membership", membership)}
              </li>
            ))}
            {data.subscriptions.map(
              ({
                subscription,
                subscriptionPlan,
                membershipPlan,
                history,
                customer,
              }) => (
                <li
                  className={styles.adminRelationshipRow}
                  key={subscription.id}
                >
                  <div className={styles.rowPrimary}>
                    <div className={styles.titleLine}>
                      <strong>{subscriptionPlan.name}</strong>
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
                    <span>
                      {customer?.displayName ?? subscription.customerUserId}
                    </span>
                    {customer ? (
                      <span className={styles.meta}>{customer.email}</span>
                    ) : null}
                    <span className={styles.meta}>
                      {subscriptionCadence(subscriptionPlan)} · relationship
                      revision {subscription.revision} · benefits revision{" "}
                      {membershipPlan.revision}
                    </span>
                    <span className={styles.meta}>
                      {customerCreditLabel(data, subscription.customerUserId)}
                    </span>
                  </div>
                  <dl className={styles.periodFacts}>
                    <div>
                      <dt>Current period</dt>
                      <dd>
                        {dateTimeLabel(subscription.currentPeriodStart)} –{" "}
                        {dateTimeLabel(subscription.currentPeriodEnd)}
                      </dd>
                    </div>
                    {subscription.cancelAt ? (
                      <div>
                        <dt>Cancellation boundary</dt>
                        <dd>{dateTimeLabel(subscription.cancelAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {relationshipActions("subscription", subscription)}
                  <ol
                    className={styles.compactHistory}
                    aria-label={`${subscriptionPlan.name} history`}
                  >
                    {history.map((event) => (
                      <li key={event.id}>
                        <span>{stateLabel(event.eventType)}</span>
                        <time dateTime={event.createdAt}>
                          {dateTimeLabel(event.createdAt)}
                        </time>
                        {event.source === "stripe_test" ? (
                          <span className={styles.testRecordLabel}>
                            Stripe Test Mode
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
