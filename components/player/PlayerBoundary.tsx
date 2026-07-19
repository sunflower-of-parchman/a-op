"use client";

import type { ReactNode } from "react";
import {
  TelemetryBoundary,
  TelemetryConsentControl,
} from "@/components/telemetry";
import { PersistentAudioPlayer } from "./PersistentAudioPlayer";
import { PlayerProvider, usePlayer } from "./PlayerProvider";
import styles from "./Player.module.css";

function PlayerBoundaryContent({ children }: { readonly children: ReactNode }) {
  const { currentTrack } = usePlayer();

  return (
    <>
      <div
        className={styles.routeBoundary}
        data-player-visible={currentTrack ? "true" : "false"}
      >
        {children}
        <TelemetryConsentControl />
      </div>
      {currentTrack ? <PersistentAudioPlayer /> : null}
    </>
  );
}

export interface PlayerBoundaryProps {
  readonly children: ReactNode;
  readonly historyEnabled?: boolean;
}

export function PlayerBoundary({
  children,
  historyEnabled = false,
}: PlayerBoundaryProps) {
  return (
    <TelemetryBoundary>
      <PlayerProvider historyEnabled={historyEnabled}>
        <PlayerBoundaryContent>{children}</PlayerBoundaryContent>
      </PlayerProvider>
    </TelemetryBoundary>
  );
}

export default PlayerBoundary;
