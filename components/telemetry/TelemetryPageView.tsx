"use client";

import { useEffect, useRef } from "react";
import type { PublicTelemetryEventInput } from "@/lib/telemetry/index.ts";
import { useTelemetry } from "./TelemetryBoundary";

type PageViewInput = Omit<PublicTelemetryEventInput, "playedTimeMs">;

/** Records one exact, allowlisted page view for each mounted resource identity. */
export function TelemetryPageView(input: PageViewInput) {
  const { configuration, record } = useTelemetry();
  const recordedKey = useRef<string | null>(null);
  const { eventName, resourceId, resourceType } = input;

  useEffect(() => {
    if (!configuration.collecting) return;
    const key = `${eventName}:${resourceType}:${resourceId}`;
    if (recordedKey.current === key) return;
    recordedKey.current = key;
    void record({ eventName, resourceType, resourceId });
  }, [configuration.collecting, eventName, record, resourceId, resourceType]);

  return null;
}
