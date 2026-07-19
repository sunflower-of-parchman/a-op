import type {
  AccessAction,
  AccessDecision,
} from "@/lib/access/decide-access.ts";
import type {
  AccessResourceType,
  AccessSourceExplanation,
} from "@/db/access-read.ts";
import type { SafeJsonObject } from "@/lib/runtime/index.ts";

export type OperationsStatus = "healthy" | "attention" | "unavailable";

export interface OperationsDatabaseDiagnostic {
  readonly status: OperationsStatus;
  readonly installationStatus: "pending" | "active" | "unavailable";
  readonly schemaVersion: number | null;
  readonly expectedSchemaVersion: number;
  readonly tableCount: number;
}

export interface OperationsStorageDiagnostic {
  readonly status: OperationsStatus;
  readonly objectCount: number | null;
}

export interface OperationsIdentityDiagnostic {
  readonly status: OperationsStatus;
  readonly activeUserCount: number;
  readonly activeOwnerCount: number;
  readonly activeEditorCount: number;
  readonly activeCustomerCount: number;
}

export interface OperationsMediaDiagnostic {
  readonly status: OperationsStatus;
  readonly sourceCount: number;
  readonly readySourceCount: number;
  readonly failedSourceCount: number;
  readonly derivativeCount: number;
  readonly readyDerivativeCount: number;
  readonly failedDerivativeCount: number;
}

export interface OperationsJobDiagnostic {
  readonly status: OperationsStatus;
  readonly totalCount: number;
  readonly pendingCount: number;
  readonly processingCount: number;
  readonly readyCount: number;
  readonly failedCount: number;
  readonly staleCount: number;
}

export interface OperationsMediaJob {
  readonly id: string;
  readonly sourceMediaId: string;
  readonly derivativeKind: string;
  readonly status: "pending" | "processing" | "ready" | "failed";
  readonly attemptCount: number;
  readonly retryable: boolean;
  readonly stale: boolean;
  readonly lastErrorCode: string | null;
  readonly leaseExpiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finishedAt: string | null;
}

export interface OperationsAuditEvent {
  readonly id: string;
  readonly action: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly details: SafeJsonObject;
  readonly result: SafeJsonObject;
  readonly createdAt: string;
}

export interface OperationsFailure {
  readonly id: string;
  readonly component: string;
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly subjectType: string | null;
  readonly subjectId: string | null;
  readonly occurrenceCount: number;
  readonly firstOccurredAt: string;
  readonly lastOccurredAt: string;
  readonly resolvedAt: string | null;
}

export interface OperationsOverview {
  readonly generatedAt: string;
  readonly database: OperationsDatabaseDiagnostic;
  readonly storage: OperationsStorageDiagnostic;
  readonly identity: OperationsIdentityDiagnostic;
  readonly media: OperationsMediaDiagnostic;
  readonly jobs: OperationsJobDiagnostic;
  readonly recentJobs: readonly OperationsMediaJob[];
  readonly recentFailures: readonly OperationsFailure[];
  readonly recentAuditEvents: readonly OperationsAuditEvent[];
}

export interface AccessExplanationInput {
  readonly customerUserId: string;
  readonly resourceType: AccessResourceType;
  readonly resourceId: string;
  readonly action: Extract<AccessAction, "view" | "stream" | "download">;
}

export interface OperationsAccessExplanation {
  readonly customerUserId: string;
  readonly customerStatus: "active";
  readonly resourceType: AccessResourceType;
  readonly resourceId: string;
  readonly resourceStatus: string;
  readonly accessMode: "public" | "account" | "protected" | "unavailable";
  readonly action: AccessExplanationInput["action"];
  readonly decidedAt: string;
  readonly decision: AccessDecision;
  readonly sources: readonly AccessSourceExplanation[];
}

export interface MediaJobRetryInput {
  readonly jobId: string;
  readonly expectedAttemptCount: number;
}

export interface MediaJobRetryReceipt {
  readonly jobId: string;
  readonly previousStatus: "failed" | "stale";
  readonly status: "pending";
  readonly attemptCount: number;
  readonly retriedAt: string;
}

export interface CustomerAdminIdentity {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: "active";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerEntitlementSummary {
  readonly id: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly actions: readonly string[];
  readonly state: string;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly remainingUses: number | null;
  readonly stripeEnvironment: "test" | null;
  readonly livemode: false | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerMembershipSummary {
  readonly id: string;
  readonly planId: string;
  readonly planName: string;
  readonly source: string;
  readonly state: string;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerSubscriptionSummary {
  readonly id: string;
  readonly membershipId: string;
  readonly planId: string;
  readonly planName: string;
  readonly source: string;
  readonly state: string;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly cancelAtPeriodEnd: boolean;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerCreditSummary {
  readonly id: string;
  readonly kind: "download" | "license";
  readonly available: number;
  readonly reserved: number;
  readonly consumed: number;
  readonly lotCount: number;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly updatedAt: string;
}

export interface CustomerOrderSummary {
  readonly id: string;
  readonly status: string;
  readonly productType: string | null;
  readonly productName: string | null;
  readonly totalMinor: number;
  readonly currency: string;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerFulfillmentSummary {
  readonly id: string;
  readonly orderId: string | null;
  readonly kind: string;
  readonly status: string;
  readonly failureCategory: string | null;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface CustomerLicenseSummary {
  readonly requestId: string;
  readonly requestState: string;
  readonly trackId: string;
  readonly trackTitle: string;
  readonly issuedLicenseId: string | null;
  readonly licenseState: string | null;
  readonly licenseSource: string | null;
  readonly documentId: string | null;
  readonly documentState: string | null;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerCourseProgressSummary {
  readonly id: string;
  readonly courseId: string;
  readonly courseTitle: string;
  readonly lessonKey: string;
  readonly state: string;
  readonly completedItemCount: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

export interface CustomerContactSummary {
  readonly id: string;
  readonly category: string;
  readonly subject: string;
  readonly state: string;
  readonly consentedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerAdminDetail {
  readonly stripeTestOnly: true;
  readonly identity: CustomerAdminIdentity;
  readonly entitlements: readonly CustomerEntitlementSummary[];
  readonly memberships: readonly CustomerMembershipSummary[];
  readonly subscriptions: readonly CustomerSubscriptionSummary[];
  readonly credits: readonly CustomerCreditSummary[];
  readonly orders: readonly CustomerOrderSummary[];
  readonly fulfillmentEvents: readonly CustomerFulfillmentSummary[];
  readonly licenses: readonly CustomerLicenseSummary[];
  readonly courseProgress: readonly CustomerCourseProgressSummary[];
  readonly contactSubmissions: readonly CustomerContactSummary[];
}
