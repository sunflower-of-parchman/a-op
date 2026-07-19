import type {
  AccessResourceType,
  ProtectedAccessAction,
} from "@/db/access-read.ts";

export type AccessPlanState = "active" | "archived";
export type AccessGrantSetState = "pending" | "active" | "revoked" | "expired";
export type AccessDownloadDisposition = "inline" | "attachment";
export type AccessPlanResourceType = Extract<
  AccessResourceType,
  "track" | "release" | "collection" | "course"
>;

export interface AccessPlanItemInput {
  readonly resourceType: AccessPlanResourceType;
  readonly resourceId: string;
  readonly actions: readonly ProtectedAccessAction[];
  readonly remainingUses: null;
  readonly downloadDisposition: AccessDownloadDisposition | null;
}

export interface AccessPlanCreateInput {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly items: readonly AccessPlanItemInput[];
}

export interface AccessPlanUpdateInput {
  readonly name: string;
  readonly description: string;
  readonly items: readonly AccessPlanItemInput[];
}

export interface AccessPlanGrantInput {
  readonly accessPlanId: string;
  readonly customerUserId: string;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly reason: string;
}

export interface AdminAccessPlanItemDTO extends AccessPlanItemInput {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly href: string | null;
}

export interface AdminAccessPlanDTO {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly state: AccessPlanState;
  readonly revision: number;
  readonly definitionLocked: boolean;
  readonly grantSetCount: number;
  readonly items: readonly AdminAccessPlanItemDTO[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminAccessResourceOptionDTO {
  readonly resourceType: AccessPlanResourceType;
  readonly resourceId: string;
  readonly title: string;
  readonly href: string;
  readonly allowedActions: readonly ProtectedAccessAction[];
}

export interface AdminAccessCustomerDTO {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly activeGrantSetCount: number;
  readonly totalGrantSetCount: number;
}

export interface AdminAccessGrantSetDTO {
  readonly id: string;
  readonly accessPlanId: string;
  readonly accessPlanRevision: number;
  readonly accessPlanName: string;
  readonly customerUserId: string;
  readonly customerDisplayName: string;
  readonly state: AccessGrantSetState;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly reason: string;
  readonly activatedAt: string | null;
  readonly revokedAt: string | null;
  readonly expiredAt: string | null;
  readonly revision: number;
  readonly entitlementCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminAccessDeliveryDTO {
  readonly id: string;
  readonly customerUserId: string | null;
  readonly customerDisplayName: string | null;
  readonly resourceType: "track" | "release" | "collection";
  readonly resourceId: string;
  readonly resourceTitle: string;
  readonly accessSource:
    | "public"
    | "account"
    | "role"
    | "ownership"
    | "grant"
    | "order"
    | "membership"
    | "subscription"
    | "license"
    | "credit";
  readonly byteLength: number;
  readonly deliveredAt: string;
}

export interface AdminAccessOverviewDTO {
  readonly plans: readonly AdminAccessPlanDTO[];
  readonly resources: readonly AdminAccessResourceOptionDTO[];
  readonly customers: readonly AdminAccessCustomerDTO[];
  readonly grantSets: readonly AdminAccessGrantSetDTO[];
  readonly recentDeliveries: readonly AdminAccessDeliveryDTO[];
}

export interface AccessPlanMutationReceipt {
  readonly accessPlanId: string;
  readonly slug: string;
  readonly state: AccessPlanState;
  readonly revision: number;
  readonly itemCount: number;
  readonly created: boolean;
}

export interface AccessGrantMutationReceipt {
  readonly grantSetId: string;
  readonly accessPlanId: string;
  readonly accessPlanRevision: number;
  readonly customerUserId: string;
  readonly state: Exclude<AccessGrantSetState, "pending">;
  readonly revision: number;
  readonly grantCount: number;
  readonly entitlementCount: number;
}
