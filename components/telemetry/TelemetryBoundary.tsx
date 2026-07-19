"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  TelemetryConsentState,
  PublicTelemetryEventInput,
  TelemetryPublicConfiguration,
} from "@/lib/telemetry/index.ts";

const INITIAL_CONFIGURATION: TelemetryPublicConfiguration = Object.freeze({
  active: false,
  collectionMode: "disabled",
  consent: "undecided",
  collecting: false,
  privacySignal: null,
  meaningfulListenSeconds: 10,
  settingsRevision: 1,
});

interface TelemetryContextValue {
  readonly configuration: TelemetryPublicConfiguration;
  readonly ready: boolean;
  readonly pending: boolean;
  readonly message: string;
  readonly record: (input: PublicTelemetryEventInput) => Promise<void>;
  readonly setConsent: (
    decision: Exclude<TelemetryConsentState, "undecided">,
  ) => Promise<void>;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

function validConfiguration(
  value: unknown,
): value is TelemetryPublicConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<TelemetryPublicConfiguration>;
  return (
    typeof candidate.active === "boolean" &&
    (candidate.collectionMode === "disabled" ||
      candidate.collectionMode === "consent_required" ||
      candidate.collectionMode === "anonymous") &&
    (candidate.consent === "granted" ||
      candidate.consent === "denied" ||
      candidate.consent === "undecided") &&
    typeof candidate.collecting === "boolean" &&
    (candidate.privacySignal === null ||
      candidate.privacySignal === "global-privacy-control" ||
      candidate.privacySignal === "do-not-track") &&
    Number.isSafeInteger(candidate.meaningfulListenSeconds) &&
    (candidate.meaningfulListenSeconds ?? 0) >= 5 &&
    (candidate.meaningfulListenSeconds ?? 0) <= 300 &&
    Number.isSafeInteger(candidate.settingsRevision) &&
    (candidate.settingsRevision ?? 0) >= 1
  );
}

async function readConfiguration(): Promise<TelemetryPublicConfiguration> {
  const response = await fetch("/api/telemetry", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Audience controls are unavailable.");
  const body = (await response.json()) as { configuration?: unknown };
  if (!validConfiguration(body.configuration)) {
    throw new Error("Audience controls returned an invalid response.");
  }
  return body.configuration;
}

export function useTelemetry(): TelemetryContextValue {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error("Telemetry controls must be inside TelemetryBoundary.");
  }
  return context;
}

export function TelemetryBoundary({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [configuration, setConfiguration] = useState(INITIAL_CONFIGURATION);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const refreshRef = useRef<Promise<TelemetryPublicConfiguration> | null>(null);

  const refresh = useCallback(async () => {
    if (refreshRef.current) return refreshRef.current;
    const request = readConfiguration()
      .then((next) => {
        setConfiguration(next);
        setReady(true);
        return next;
      })
      .finally(() => {
        refreshRef.current = null;
      });
    refreshRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      setReady(true);
      setMessage("Audience controls are currently unavailable.");
    });
    const onFocus = () => void refresh().catch(() => undefined);
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    const timer = window.setInterval(onFocus, 5_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const record = useCallback(
    async (input: PublicTelemetryEventInput) => {
      try {
        const current = await refresh();
        if (!current.collecting) return;
        await fetch("/api/telemetry/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          keepalive: true,
        });
      } catch {
        // First-party telemetry never interrupts the visitor's product action.
      }
    },
    [refresh],
  );

  const setConsent = useCallback(
    async (decision: "granted" | "denied") => {
      if (pending) return;
      setPending(true);
      setMessage("Saving audience preference…");
      try {
        const response = await fetch("/api/telemetry/consent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        const body = (await response.json()) as {
          configuration?: unknown;
          error?: { message?: string };
        };
        if (!response.ok || !validConfiguration(body.configuration)) {
          throw new Error(
            body.error?.message ??
              "The audience preference could not be saved.",
          );
        }
        setConfiguration(body.configuration);
        setReady(true);
        setMessage(
          decision === "granted"
            ? "Audience activity is allowed."
            : "Audience activity is declined.",
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "The audience preference could not be saved.",
        );
      } finally {
        setPending(false);
      }
    },
    [pending],
  );

  const value = useMemo<TelemetryContextValue>(
    () => ({ configuration, ready, pending, message, record, setConsent }),
    [configuration, message, pending, ready, record, setConsent],
  );
  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}
