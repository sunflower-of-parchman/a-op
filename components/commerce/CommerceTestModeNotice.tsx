import {
  NO_REAL_PAYMENT_STATEMENT,
  STRIPE_TEST_MODE_LABEL,
} from "@/lib/commerce/domain.ts";

import styles from "./Commerce.module.css";

export interface CommerceTestModeNoticeProps {
  readonly detail?: string;
}

export function CommerceTestModeNotice({
  detail = "Stripe test objects simulate the commerce journey. This Site cannot accept a real payment.",
}: CommerceTestModeNoticeProps) {
  return (
    <aside
      className={styles.testModeBoundary}
      aria-label={STRIPE_TEST_MODE_LABEL}
    >
      <strong className={styles.testModeLabel}>{STRIPE_TEST_MODE_LABEL}</strong>
      <p className={styles.testModeStatement}>{NO_REAL_PAYMENT_STATEMENT}</p>
      <p className={styles.testModeDetail}>{detail}</p>
    </aside>
  );
}

export default CommerceTestModeNotice;
