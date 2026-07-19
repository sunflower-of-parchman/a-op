import type {
  AccessResourceType,
  EntitlementSourceType,
  ProtectedAccessAction,
} from "@/db/access-read.ts";
import type { AccessSource } from "@/lib/access/decide-access.ts";

export type CustomerAccessEffectiveState =
  "active" | "scheduled" | "expired" | "exhausted" | "revoked";

export interface CustomerAccessResourceDTO {
  readonly resourceType: AccessResourceType;
  readonly resourceId: string;
  readonly available: boolean;
  readonly title: string;
  readonly href: string | null;
}

export interface CustomerAccessSourceDTO {
  readonly sourceType: EntitlementSourceType;
  readonly explanation: string;
  readonly entitlementId: string | null;
  /** True only when D1 identifies the exact entitlement as test commerce. */
  readonly commerceTestMode: boolean;
  readonly expiresAt: string | null;
  readonly remainingUses: number | null;
}

export interface CustomerAccessibleResourceDTO {
  readonly resource: CustomerAccessResourceDTO;
  readonly actions: readonly ProtectedAccessAction[];
  readonly sources: readonly CustomerAccessSourceDTO[];
  /**
   * Same-origin delivery route projected from current server authority,
   * module state, and the exact published track revision.
   */
  readonly downloadUrl: string | null;
}

interface CustomerAccessHistoryBaseDTO {
  readonly id: string;
  readonly resource: CustomerAccessResourceDTO;
  readonly actions: readonly ProtectedAccessAction[];
  readonly effectiveState: CustomerAccessEffectiveState;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly remainingUses: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerGrantHistoryDTO extends CustomerAccessHistoryBaseDTO {
  readonly storedState: "active" | "revoked" | "expired";
  readonly explanation: "Artist access grant";
  readonly revokedAt: string | null;
  readonly expiredAt: string | null;
}

export interface CustomerEntitlementHistoryDTO extends CustomerAccessHistoryBaseDTO {
  readonly storedState: "active" | "revoked" | "expired" | "exhausted";
  readonly sourceType: EntitlementSourceType;
  /** Provider-neutral UI provenance derived from stored environment facts. */
  readonly commerceTestMode: boolean;
  readonly explanation:
    | "Artist access grant"
    | "Test order entitlement"
    | "Membership entitlement"
    | "Subscription entitlement"
    | "License entitlement"
    | "Credit entitlement";
}

export interface CustomerDownloadHistoryDTO {
  readonly id: string;
  readonly resource: CustomerAccessResourceDTO;
  readonly entitlementId: string | null;
  readonly accessSource: Exclude<AccessSource, "none">;
  /** True when this delivery used an exact Stripe Test Mode entitlement. */
  readonly commerceTestMode: boolean;
  readonly byteLength: number;
  readonly deliveredAt: string;
}

export interface CustomerAccessLibraryDTO {
  readonly resources: readonly CustomerAccessibleResourceDTO[];
  readonly grantHistory: readonly CustomerGrantHistoryDTO[];
  readonly entitlementHistory: readonly CustomerEntitlementHistoryDTO[];
  readonly downloadHistory: readonly CustomerDownloadHistoryDTO[];
}
