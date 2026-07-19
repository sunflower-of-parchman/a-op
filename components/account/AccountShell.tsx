import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./AccountShell.module.css";

export interface AccountIdentity {
  name: string;
  email?: string;
}

export interface AccountNavigationItem {
  href: string;
  label: string;
  current?: boolean;
}

export type AccountStatusTone =
  "neutral" | "positive" | "attention" | "critical";

export interface AccountStatus {
  label: string;
  value: string;
  detail?: string;
  tone?: AccountStatusTone;
}

export interface AccountShellProps {
  children: ReactNode;
  identity: AccountIdentity;
  navigation: readonly AccountNavigationItem[];
  description?: string;
  navigationLabel?: string;
  status?: AccountStatus;
  title?: string;
}

export function AccountShell({
  children,
  description,
  identity,
  navigation,
  navigationLabel = "Account navigation",
  status,
  title = "Account",
}: AccountShellProps) {
  return (
    <div className={styles.shell} data-account-shell="">
      <header className={styles.accountHeader}>
        <div className={styles.headingGroup}>
          <h1>{title}</h1>
          {description ? (
            <p className={styles.description}>{description}</p>
          ) : null}
        </div>

        <section
          className={styles.identity}
          aria-label={`Signed in as ${identity.name}`}
        >
          <span className={styles.identityLabel}>Signed in as</span>
          <span className={styles.identityName}>{identity.name}</span>
          {identity.email ? (
            <span className={styles.identityEmail}>{identity.email}</span>
          ) : null}
        </section>
      </header>

      {status ? (
        <section className={styles.statusRegion} aria-label="Account status">
          <dl className={styles.statusList}>
            <div className={styles.statusItem}>
              <dt className={styles.statusLabel}>{status.label}</dt>
              <dd
                className={styles.statusValue}
                data-tone={status.tone ?? "neutral"}
              >
                {status.value}
              </dd>
              {status.detail ? (
                <dd className={styles.statusDetail}>{status.detail}</dd>
              ) : null}
            </div>
          </dl>
        </section>
      ) : null}

      <nav className={styles.navigation} aria-label={navigationLabel}>
        <ul className={styles.navigationList}>
          {navigation.map((item) => (
            <li key={item.href}>
              <Link
                className={`${styles.navigationLink} ${
                  item.current ? styles.navigationLinkCurrent : ""
                }`}
                href={item.href}
                aria-current={item.current ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className={styles.content} aria-label={`${title} content`}>
        {children}
      </section>
    </div>
  );
}

export default AccountShell;
