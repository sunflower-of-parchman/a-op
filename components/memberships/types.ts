import type { CreditAccountDTO } from "@/lib/benefit-credits/types.ts";
import type {
  MembershipDTO,
  MembershipPlanDTO,
  SubscriptionDTO,
  SubscriptionEventDTO,
  SubscriptionPlanDTO,
} from "@/lib/memberships/types.ts";

export interface MembershipCustomerDTO {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly active: boolean;
}

export interface MembershipAccessPlanOptionDTO {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
}

export interface MembershipPlanSurfaceDTO {
  readonly plan: MembershipPlanDTO;
  readonly relationshipCount: number;
}

export interface SubscriptionPlanSurfaceDTO {
  readonly plan: SubscriptionPlanDTO;
  readonly relationshipCount: number;
}

export interface DirectMembershipSurfaceDTO {
  readonly membership: MembershipDTO;
  readonly plan: MembershipPlanDTO;
  readonly customer?: MembershipCustomerDTO;
}

export interface SubscriptionSurfaceDTO {
  readonly subscription: SubscriptionDTO;
  readonly membership: MembershipDTO;
  readonly subscriptionPlan: SubscriptionPlanDTO;
  readonly membershipPlan: MembershipPlanDTO;
  readonly history: readonly SubscriptionEventDTO[];
  readonly customer?: MembershipCustomerDTO;
}

export interface CustomerMembershipSurfaceDTO {
  readonly directMemberships: readonly DirectMembershipSurfaceDTO[];
  readonly subscriptions: readonly SubscriptionSurfaceDTO[];
  readonly credits: readonly CreditAccountDTO[];
}

export interface AdminMembershipSurfaceDTO {
  readonly readAt: string;
  readonly membershipPlans: readonly MembershipPlanSurfaceDTO[];
  readonly subscriptionPlans: readonly SubscriptionPlanSurfaceDTO[];
  readonly directMemberships: readonly DirectMembershipSurfaceDTO[];
  readonly subscriptions: readonly SubscriptionSurfaceDTO[];
  readonly customers: readonly MembershipCustomerDTO[];
  readonly credits: readonly CreditAccountDTO[];
  readonly accessPlans: readonly MembershipAccessPlanOptionDTO[];
}
