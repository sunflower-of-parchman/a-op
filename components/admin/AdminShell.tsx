import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./AdminShell.module.css";

export interface AdminNavigationItem {
  href: string;
  label: string;
  current?: boolean;
}

export type AdminStatusTone = "neutral" | "positive" | "attention" | "critical";

export interface AdminStatusItem {
  label: string;
  value: string;
  detail?: string;
  tone?: AdminStatusTone;
}

export interface AdminIdentity {
  name: string;
  role: "owner" | "editor";
  email?: string;
}

export interface AdminShellProps {
  children: ReactNode;
  identity: AdminIdentity;
  navigation: readonly AdminNavigationItem[];
  status: readonly AdminStatusItem[];
  title: string;
  actions?: ReactNode;
  description?: string;
  homeHref?: string;
  navigationLabel?: string;
  productName?: string;
  statusHeading?: string;
}

function identityRoleLabel(role: AdminIdentity["role"]) {
  return role === "owner" ? "Owner" : "Editor";
}

export function AdminShell({
  actions,
  children,
  description,
  homeHref = "/",
  identity,
  navigation,
  navigationLabel = "Administration navigation",
  productName = "a-op",
  status,
  statusHeading = "Site status",
  title,
}: AdminShellProps) {
  return (
    <div className={styles.shell} data-admin-shell="">
      <aside className={styles.rail} aria-label="Administration">
        <Link
          className={styles.administrationHome}
          href={homeHref}
          aria-label={`${productName} home`}
        >
          <span className={styles.productName}>{productName}</span>
          <span className={styles.administrationLabel}>Administration</span>
        </Link>

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

        <section className={styles.statusRegion} aria-label={statusHeading}>
          <h2 className={styles.statusHeading}>{statusHeading}</h2>
          <dl className={styles.statusList}>
            {status.map((item) => (
              <div className={styles.statusItem} key={item.label}>
                <dt className={styles.statusLabel}>{item.label}</dt>
                <dd
                  className={styles.statusValue}
                  data-tone={item.tone ?? "neutral"}
                >
                  {item.value}
                </dd>
                {item.detail ? (
                  <dd className={styles.statusDetail}>{item.detail}</dd>
                ) : null}
              </div>
            ))}
          </dl>
        </section>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div className={styles.headingRow}>
            <div className={styles.headingGroup}>
              <h1>{title}</h1>
              {description ? (
                <p className={styles.description}>{description}</p>
              ) : null}
            </div>

            <section
              className={styles.identity}
              aria-label={`Signed in as ${identity.name}, ${identityRoleLabel(
                identity.role,
              )}`}
            >
              <span className={styles.identityName}>{identity.name}</span>
              <span className={styles.identityRole}>
                {identityRoleLabel(identity.role)}
              </span>
              {identity.email ? (
                <span className={styles.identityEmail}>{identity.email}</span>
              ) : null}
            </section>
          </div>

          {actions ? (
            <div
              className={styles.actions}
              role="group"
              aria-label="Page actions"
            >
              {actions}
            </div>
          ) : null}
        </header>

        <section className={styles.content} aria-label={`${title} workspace`}>
          {children}
        </section>
      </div>
    </div>
  );
}

export default AdminShell;
