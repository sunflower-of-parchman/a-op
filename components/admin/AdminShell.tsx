"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import styles from "./AdminShell.module.css";

export interface AdminNavigationItem {
  href: string;
  label: string;
  current?: boolean;
}

export interface AdminShellProps {
  children: ReactNode;
  navigation: readonly AdminNavigationItem[];
  title: string;
  description?: string;
  homeHref?: string;
  navigationLabel?: string;
  productName?: string;
}

export function AdminShell({
  children,
  description,
  homeHref = "/",
  navigation,
  navigationLabel = "Administration navigation",
  productName = "a-op",
  title,
}: AdminShellProps) {
  const pathname = usePathname();
  const currentNavigationItem =
    navigation.find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)),
    ) ?? navigation.find((item) => item.href === "/admin");
  const workspaceTitle = currentNavigationItem?.label ?? title;

  return (
    <div className={styles.shell} data-admin-shell="">
      <aside className={styles.rail} aria-label="Administration">
        <Link
          className={styles.administrationHome}
          href={homeHref}
          aria-label={`Back to ${productName} account`}
        >
          <span aria-hidden="true">←</span>
          <span>Back to account</span>
        </Link>

        <nav className={styles.navigation} aria-label={navigationLabel}>
          <ul className={styles.navigationList}>
            {navigation.map((item) => {
              const current =
                pathname === item.href ||
                (item.href !== "/admin" &&
                  pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    className={`${styles.navigationLink} ${
                      current ? styles.navigationLinkCurrent : ""
                    }`}
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div className={styles.headingGroup}>
            <h1>{workspaceTitle}</h1>
            {description ? (
              <p className={styles.description}>{description}</p>
            ) : null}
          </div>
        </header>

        <section className={styles.content} aria-label={`${title} workspace`}>
          {children}
        </section>
      </div>
    </div>
  );
}

export default AdminShell;
