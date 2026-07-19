export const MEMBERSHIP_STATES = Object.freeze([
  "pending",
  "active",
  "paused",
  "cancellation_scheduled",
  "canceled",
  "expired",
] as const);

export type MembershipState = (typeof MEMBERSHIP_STATES)[number];
export type SubscriptionState = MembershipState;
export type MembershipPlanState = "draft" | "active" | "archived";
export type SubscriptionPlanState = MembershipPlanState;
export type BillingInterval = "month" | "year";
export type MembershipEventType =
  | "activated"
  | "renewed"
  | "paused"
  | "resumed"
  | "cancellation_scheduled"
  | "cancellation_cleared"
  | "canceled"
  | "expired";

export interface MembershipPlanDefinitionInput {
  readonly name: string;
  readonly description: string;
  readonly benefits: readonly string[];
  readonly accessPlanId: string | null;
  readonly accessPlanRevision: number | null;
  readonly downloadCredits: number;
  readonly licenseCredits: number;
  readonly durationDays: number | null;
}

export interface MembershipPlanCreateInput extends MembershipPlanDefinitionInput {
  readonly slug: string;
  readonly state: Exclude<MembershipPlanState, "archived">;
}

export type MembershipPlanRevisionInput = MembershipPlanDefinitionInput;

export interface SubscriptionPlanCreateInput {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly membershipPlanId: string;
  readonly membershipPlanRevision: number;
  readonly billingInterval: BillingInterval;
  readonly intervalCount: number;
  readonly state: Exclude<SubscriptionPlanState, "archived">;
}

export type SubscriptionPlanRevisionInput = Omit<
  SubscriptionPlanCreateInput,
  "slug" | "state"
>;

export interface MembershipActivationInput {
  readonly membershipPlanId: string;
  readonly membershipPlanRevision: number;
  readonly customerUserId: string;
  readonly startsAt: string;
}

export interface SubscriptionActivationInput {
  readonly subscriptionPlanId: string;
  readonly subscriptionPlanRevision: number;
  readonly customerUserId: string;
  readonly startsAt: string;
}

/**
 * Minimal durable facts projected by the verified Stripe Test webhook path.
 * The membership repository matches every value against D1 again inside the
 * same batch that creates or changes customer access.
 */
export interface StripeTestProviderReferenceInput {
  readonly customerUserId: string;
  readonly commerceProductId: string;
  readonly commercePriceId: string;
  readonly commerceEventId: string;
  readonly fulfillmentEventId: string;
  readonly factsFingerprint: string;
  readonly stripeEventId: string;
  readonly stripeObjectId: string;
  readonly fulfillmentProviderObjectId: string;
  readonly providerEventCreatedAt: string;
}

export interface StripeTestFulfillmentReferenceInput extends StripeTestProviderReferenceInput {
  readonly orderId: string;
}

export interface StripeTestSubscriptionStateReferenceInput extends StripeTestProviderReferenceInput {
  readonly orderId: null;
}

export type StripeTestMembershipActivationInput =
  StripeTestFulfillmentReferenceInput;

export interface StripeTestSubscriptionActivationInput extends StripeTestFulfillmentReferenceInput {
  readonly billingReason: "subscription_create";
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface StripeTestSubscriptionRenewalInput extends StripeTestFulfillmentReferenceInput {
  readonly billingReason: "subscription_cycle";
  readonly subscriptionId: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly expectedRevision: number;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export type StripeTestSubscriptionReconcileState =
  "active" | "paused" | "cancellation_scheduled" | "canceled" | "expired";

export interface StripeTestSubscriptionReconciliationInput extends StripeTestSubscriptionStateReferenceInput {
  readonly subscriptionId: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly expectedRevision: number;
  readonly targetState: StripeTestSubscriptionReconcileState;
}

export interface MembershipPlanMutationReceipt {
  readonly membershipPlanId: string;
  readonly slug: string;
  readonly state: MembershipPlanState;
  readonly revisionId: string;
  readonly revision: number;
  readonly created: boolean;
}

export interface SubscriptionPlanMutationReceipt {
  readonly subscriptionPlanId: string;
  readonly slug: string;
  readonly state: SubscriptionPlanState;
  readonly revision: number;
  readonly created: boolean;
}

export interface MembershipMutationReceipt {
  readonly membershipId: string;
  readonly customerUserId: string;
  readonly membershipPlanId: string;
  readonly membershipPlanRevisionId: string;
  readonly membershipPlanRevision: number;
  readonly state: MembershipState;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly cancelAt: string | null;
  readonly revision: number;
  readonly entitlementCount: number;
  readonly downloadCreditsGranted: number;
  readonly licenseCreditsGranted: number;
}

export interface SubscriptionMutationReceipt {
  readonly subscriptionId: string;
  readonly membershipId: string;
  readonly customerUserId: string;
  readonly subscriptionPlanId: string;
  readonly state: SubscriptionState;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly cancelAt: string | null;
  readonly revision: number;
  readonly membershipRevision: number;
  readonly entitlementCount: number;
  readonly downloadCreditsGranted: number;
  readonly licenseCreditsGranted: number;
  readonly eventType: MembershipEventType;
}

export interface MembershipPlanDTO extends MembershipPlanDefinitionInput {
  readonly id: string;
  readonly slug: string;
  readonly state: MembershipPlanState;
  readonly revisionId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubscriptionPlanDTO {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly membershipPlanId: string;
  readonly membershipPlanRevisionId: string;
  readonly membershipPlanRevision: number;
  readonly billingInterval: BillingInterval;
  readonly intervalCount: number;
  readonly state: SubscriptionPlanState;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MembershipDTO {
  readonly id: string;
  readonly customerUserId: string;
  readonly membershipPlanId: string;
  readonly membershipPlanRevisionId: string;
  readonly membershipPlanRevision: number;
  readonly source: "owner" | "stripe_test";
  readonly state: MembershipState;
  readonly startsAt: string;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly cancelAt: string | null;
  readonly canceledAt: string | null;
  readonly expiredAt: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubscriptionDTO {
  readonly id: string;
  readonly customerUserId: string;
  readonly membershipId: string;
  readonly subscriptionPlanId: string;
  readonly source: "owner" | "stripe_test";
  readonly state: SubscriptionState;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly cancelAt: string | null;
  readonly canceledAt: string | null;
  readonly expiredAt: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubscriptionEventDTO {
  readonly id: string;
  readonly subscriptionId: string;
  readonly customerUserId: string;
  readonly eventType: MembershipEventType;
  readonly source: "owner" | "stripe_test";
  readonly fromState: SubscriptionState | null;
  readonly toState: SubscriptionState;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface CustomerMembershipOverviewDTO {
  readonly memberships: readonly MembershipDTO[];
  readonly subscriptions: readonly SubscriptionDTO[];
  readonly subscriptionEvents: readonly SubscriptionEventDTO[];
}
