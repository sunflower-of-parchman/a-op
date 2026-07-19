"use client";

import { useTelemetry } from "./TelemetryBoundary";
import styles from "./Telemetry.module.css";

export function TelemetryConsentControl() {
  const { configuration, message, pending, ready, setConsent } = useTelemetry();
  let summary = "Loading first-party audience controls…";
  if (ready) {
    if (!configuration.active || configuration.collectionMode === "disabled") {
      summary = "First-party audience measurement is off.";
    } else if (configuration.privacySignal === "global-privacy-control") {
      summary =
        "Global Privacy Control is active. Audience activity is not collected.";
    } else if (configuration.privacySignal === "do-not-track") {
      summary = "Do Not Track is active. Audience activity is not collected.";
    } else if (configuration.consent === "denied") {
      summary = "You declined first-party audience measurement.";
    } else if (configuration.collectionMode === "anonymous") {
      summary =
        "This Site records allowlisted anonymous audience actions. It records no URL, search text, contact details, payment information, or provider payload.";
    } else if (configuration.consent === "granted") {
      summary =
        "You allowed first-party audience measurement for allowlisted Site actions.";
    } else {
      summary =
        "Choose whether this Site may record allowlisted first-party audience actions. It records no URL, search text, contact details, payment information, or provider payload.";
    }
  }

  const canChoose =
    ready &&
    configuration.active &&
    configuration.collectionMode !== "disabled" &&
    configuration.privacySignal === null;

  return (
    <aside aria-label="Audience measurement privacy" className={styles.consent}>
      <div>
        <p className={styles.label}>Audience privacy</p>
        <p>{summary}</p>
      </div>
      {canChoose ? (
        <div className={styles.consentActions}>
          {configuration.consent !== "granted" ? (
            <button
              className="button button-secondary"
              disabled={pending}
              onClick={() => void setConsent("granted")}
              type="button"
            >
              Allow audience activity
            </button>
          ) : null}
          {configuration.consent !== "denied" ? (
            <button
              className="button button-secondary"
              disabled={pending}
              onClick={() => void setConsent("denied")}
              type="button"
            >
              Decline audience activity
            </button>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className={styles.message} role="status">
        {message}
      </p>
    </aside>
  );
}
