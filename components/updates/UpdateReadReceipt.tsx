"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./Updates.module.css";

export function UpdateReadReceipt({
  updateId,
  initiallyRead,
}: {
  readonly updateId: string;
  readonly initiallyRead: boolean;
}) {
  const router = useRouter();
  const operationKey = useRef(crypto.randomUUID());
  const [state, setState] = useState<"marking" | "read" | "failed">(
    initiallyRead ? "read" : "marking",
  );

  useEffect(() => {
    if (initiallyRead) return;
    let current = true;
    void fetch(`/api/updates/${encodeURIComponent(updateId)}/read`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": operationKey.current,
      },
      body: "{}",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Read receipt failed.");
        if (current) {
          setState("read");
          router.refresh();
        }
      })
      .catch(() => {
        if (current) setState("failed");
      });
    return () => {
      current = false;
    };
  }, [initiallyRead, router, updateId]);

  return (
    <div className={styles.receipt} aria-live="polite" role="status">
      <span className={styles.eyebrow}>Account read receipt</span>
      <span className={styles.readStatus}>
        {state === "read"
          ? "Read"
          : state === "marking"
            ? "Marking this update read…"
            : "This update remains unread. Reload to try again."}
      </span>
    </div>
  );
}
