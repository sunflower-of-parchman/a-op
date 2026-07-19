import type {
  TelemetryCollectionMode,
  TelemetryConsentState,
  TelemetryPrivacySignal,
  TelemetryPublicConfiguration,
} from "./types.ts";

export const TELEMETRY_CONSENT_COOKIE = "aop_telemetry_consent";
export const TELEMETRY_SESSION_COOKIE = "aop_telemetry_session";

const SESSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cookieValue(headers: Headers, name: string): string | null {
  const cookie = headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export function readTelemetryConsent(headers: Headers): TelemetryConsentState {
  const value = cookieValue(headers, TELEMETRY_CONSENT_COOKIE);
  return value === "granted" || value === "denied" ? value : "undecided";
}

export function readTelemetrySession(headers: Headers): string | null {
  const value = cookieValue(headers, TELEMETRY_SESSION_COOKIE);
  return value && SESSION_PATTERN.test(value) ? value : null;
}

export function readTelemetryPrivacySignal(
  headers: Headers,
): TelemetryPrivacySignal | null {
  if (headers.get("sec-gpc")?.trim() === "1") {
    return "global-privacy-control";
  }
  if (headers.get("dnt")?.trim() === "1") return "do-not-track";
  return null;
}

export function telemetryCollecting(
  active: boolean,
  collectionMode: TelemetryCollectionMode,
  consent: TelemetryConsentState,
  privacySignal: TelemetryPrivacySignal | null,
): boolean {
  if (!active || collectionMode === "disabled" || privacySignal !== null) {
    return false;
  }
  if (consent === "denied") return false;
  return collectionMode === "anonymous" || consent === "granted";
}

export function makeTelemetryPublicConfiguration(input: {
  readonly active: boolean;
  readonly collectionMode: TelemetryCollectionMode;
  readonly consent: TelemetryConsentState;
  readonly privacySignal: TelemetryPrivacySignal | null;
  readonly meaningfulListenSeconds: number;
  readonly settingsRevision: number;
}): TelemetryPublicConfiguration {
  return Object.freeze({
    ...input,
    collecting: telemetryCollecting(
      input.active,
      input.collectionMode,
      input.consent,
      input.privacySignal,
    ),
  });
}

function cookieSecurity(request: Request): string {
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

export function consentCookie(
  request: Request,
  decision: "granted" | "denied",
): string {
  return `${TELEMETRY_CONSENT_COOKIE}=${decision}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${cookieSecurity(request)}`;
}

export function sessionCookie(request: Request, sessionId: string): string {
  if (!SESSION_PATTERN.test(sessionId)) {
    throw new RangeError("Telemetry session identifiers must be random UUIDs.");
  }
  return `${TELEMETRY_SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${cookieSecurity(request)}`;
}

export function clearSessionCookie(request: Request): string {
  return `${TELEMETRY_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${cookieSecurity(request)}`;
}
