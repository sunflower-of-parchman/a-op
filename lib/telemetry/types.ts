import type { CapabilityKey } from "@/lib/modules/registry.ts";

export const TELEMETRY_COLLECTION_MODES = [
  "disabled",
  "consent_required",
  "anonymous",
] as const;
export type TelemetryCollectionMode =
  (typeof TELEMETRY_COLLECTION_MODES)[number];

export const TELEMETRY_EVENT_POLICY = Object.freeze({
  "contact-submitted": Object.freeze({
    moduleKey: "contact",
    resourceTypes: Object.freeze(["contact"] as const),
  }),
  "contact-view": Object.freeze({
    moduleKey: "contact",
    resourceTypes: Object.freeze(["contact"] as const),
  }),
  "course-view": Object.freeze({
    moduleKey: "courses",
    resourceTypes: Object.freeze(["course"] as const),
  }),
  "download-delivered": Object.freeze({
    moduleKey: "downloads",
    resourceTypes: Object.freeze(["download"] as const),
  }),
  "favorite-saved": Object.freeze({
    moduleKey: "customer-library",
    resourceTypes: Object.freeze(["track", "release", "collection"] as const),
  }),
  "lesson-completed": Object.freeze({
    moduleKey: "courses",
    resourceTypes: Object.freeze(["lesson"] as const),
  }),
  "license-issued": Object.freeze({
    moduleKey: "licensing",
    resourceTypes: Object.freeze(["license"] as const),
  }),
  "licensing-view": Object.freeze({
    moduleKey: "licensing",
    resourceTypes: Object.freeze(["license"] as const),
  }),
  "meaningful-listen": Object.freeze({
    moduleKey: "streaming",
    resourceTypes: Object.freeze(["track"] as const),
  }),
  "membership-activated": Object.freeze({
    moduleKey: "memberships",
    resourceTypes: Object.freeze(["membership"] as const),
  }),
  "membership-view": Object.freeze({
    moduleKey: "memberships",
    resourceTypes: Object.freeze(["membership"] as const),
  }),
  "music-view": Object.freeze({
    moduleKey: "music",
    resourceTypes: Object.freeze(["site"] as const),
  }),
  "playback-start": Object.freeze({
    moduleKey: "streaming",
    resourceTypes: Object.freeze(["track"] as const),
  }),
  "playlist-updated": Object.freeze({
    moduleKey: "customer-library",
    resourceTypes: Object.freeze(["playlist"] as const),
  }),
  "protected-resource-delivered": Object.freeze({
    moduleKey: "access",
    resourceTypes: Object.freeze(["protected-resource"] as const),
  }),
  "release-view": Object.freeze({
    moduleKey: "catalog",
    resourceTypes: Object.freeze(["release"] as const),
  }),
  "subscription-activated": Object.freeze({
    moduleKey: "subscriptions",
    resourceTypes: Object.freeze(["subscription"] as const),
  }),
  "subscription-canceled": Object.freeze({
    moduleKey: "subscriptions",
    resourceTypes: Object.freeze(["subscription"] as const),
  }),
  "track-view": Object.freeze({
    moduleKey: "catalog",
    resourceTypes: Object.freeze(["track"] as const),
  }),
  "update-read": Object.freeze({
    moduleKey: "whats-new",
    resourceTypes: Object.freeze(["update"] as const),
  }),
  "update-view": Object.freeze({
    moduleKey: "whats-new",
    resourceTypes: Object.freeze(["update"] as const),
  }),
  "video-playback-start": Object.freeze({
    moduleKey: "video",
    resourceTypes: Object.freeze(["video"] as const),
  }),
  "video-view": Object.freeze({
    moduleKey: "video",
    resourceTypes: Object.freeze(["video"] as const),
  }),
} satisfies Readonly<
  Record<
    string,
    {
      readonly moduleKey: CapabilityKey;
      readonly resourceTypes: readonly string[];
    }
  >
>);

export type TelemetryEventName = keyof typeof TELEMETRY_EVENT_POLICY;
export type TelemetryResourceType =
  (typeof TELEMETRY_EVENT_POLICY)[TelemetryEventName]["resourceTypes"][number];

export interface TelemetryEventInput {
  readonly eventName: TelemetryEventName;
  readonly resourceType: TelemetryResourceType;
  readonly resourceId: string;
  /** Fixed, validation-only evidence for meaningful-listen. Never persisted. */
  readonly playedTimeMs?: number;
}

/** Events a browser can directly observe without claiming a server-side fact. */
export const PUBLIC_TELEMETRY_EVENT_NAMES = Object.freeze([
  "contact-view",
  "course-view",
  "licensing-view",
  "meaningful-listen",
  "membership-view",
  "music-view",
  "playback-start",
  "release-view",
  "track-view",
  "update-view",
  "video-playback-start",
  "video-view",
] as const satisfies readonly TelemetryEventName[]);

export type PublicTelemetryEventName =
  (typeof PUBLIC_TELEMETRY_EVENT_NAMES)[number];
export type PublicTelemetryEventInput = TelemetryEventInput & {
  readonly eventName: PublicTelemetryEventName;
};

export interface TelemetrySettingsDTO {
  readonly collectionMode: TelemetryCollectionMode;
  readonly retentionDays: number;
  readonly meaningfulListenSeconds: number;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface TelemetrySettingsInput {
  readonly collectionMode: TelemetryCollectionMode;
  readonly retentionDays: number;
  readonly meaningfulListenSeconds: number;
  readonly expectedRevision: number;
}

export type TelemetryConsentState = "granted" | "denied" | "undecided";
export type TelemetryPrivacySignal = "global-privacy-control" | "do-not-track";

export interface TelemetryPublicConfiguration {
  readonly active: boolean;
  readonly collectionMode: TelemetryCollectionMode;
  readonly consent: TelemetryConsentState;
  readonly collecting: boolean;
  readonly privacySignal: TelemetryPrivacySignal | null;
  readonly meaningfulListenSeconds: number;
  readonly settingsRevision: number;
}

export interface TelemetryRecordReceipt {
  readonly recorded: boolean;
  readonly reason:
    | "recorded"
    | "module-inactive"
    | "collection-disabled"
    | "consent-required"
    | "consent-denied"
    | "privacy-signal"
    | "below-threshold"
    | "settings-changed";
}

export type TelemetrySettingsReceipt = TelemetrySettingsDTO;

export interface TelemetryAggregateReceipt {
  readonly dayUtc: string;
  readonly sourceEventCount: number;
  readonly groupCount: number;
  readonly sessionCount: number;
  readonly linkedUserCount: number;
  readonly finalizedAt: string;
}

export interface TelemetryPruneReceipt {
  readonly cutoffDayUtc: string;
  readonly deletedEventCount: number;
  readonly retentionDays: number;
  readonly prunedAt: string;
}

export interface TelemetryAggregateRowDTO {
  readonly dayUtc: string;
  readonly eventName: TelemetryEventName;
  readonly resourceType: TelemetryResourceType;
  readonly resourceId: string;
  readonly eventCount: number;
  readonly sessionCount: number;
  readonly linkedUserCount: number;
  readonly state: "finalized" | "live";
}

export interface TelemetryAdminWorkspaceDTO {
  readonly settings: TelemetrySettingsDTO;
  readonly range: { readonly fromDayUtc: string; readonly toDayUtc: string };
  readonly totals: {
    readonly eventCount: number;
    readonly sessionCount: number;
    readonly linkedUserCount: number;
  };
  readonly rows: readonly TelemetryAggregateRowDTO[];
  readonly finalizedDays: readonly TelemetryAggregateReceipt[];
}

export interface TelemetryConsentInput {
  readonly decision: "granted" | "denied";
}
