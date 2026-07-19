import {
  readTelemetryConsent,
  readTelemetryPrivacySignal,
  readTelemetrySession,
} from "./privacy.ts";
import type { TelemetryConsentState, TelemetryPrivacySignal } from "./types.ts";

/** Privacy facts carried from an exact browser request into a durable mutation. */
export interface TelemetryMutationRequestContext {
  readonly sessionId: string;
  readonly consent: TelemetryConsentState;
  readonly privacySignal: TelemetryPrivacySignal | null;
}

/**
 * Reads only first-party audience cookies and browser privacy signals. A fresh
 * random session is scoped to this request when no telemetry session exists;
 * server-owned facts never invent a stable browser identifier.
 */
export function telemetryMutationRequestContext(
  request: Request,
): TelemetryMutationRequestContext {
  return Object.freeze({
    sessionId: readTelemetrySession(request.headers) ?? crypto.randomUUID(),
    consent: readTelemetryConsent(request.headers),
    privacySignal: readTelemetryPrivacySignal(request.headers),
  });
}
