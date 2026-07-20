import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./AccountShell.module.css";

export interface AccountIdentity {
  name: string;
}

export interface AccountShellProps {
  administrationHref?: string;
  children: ReactNode;
  identity: AccountIdentity;
}

export function AccountShell({
  administrationHref,
  children,
  identity,
}: AccountShellProps) {
  return (
    <div className={styles.shell} data-account-shell="">
      <header className={styles.accountHeader}>
        <div className={styles.headingGroup}>
          <h1>Hello {identity.name}</h1>
        </div>

        {administrationHref ? (
          <Link className={styles.administrationLink} href={administrationHref}>
            Admin Dashboard
          </Link>
        ) : null}
      </header>

      <section className={styles.content} aria-label="Account content">
        {children}
      </section>
    </div>
  );
}

export default AccountShell;
