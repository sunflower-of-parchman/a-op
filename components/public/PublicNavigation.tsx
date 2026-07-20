"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";

export type PublicNavigationItem = {
  id: string;
  href: string;
  label: string;
};

type PublicNavigationProps = {
  accountHref: string;
  items: readonly PublicNavigationItem[];
  loginHref: string;
};

export function PublicNavigation({
  accountHref,
  items,
  loginHref,
}: PublicNavigationProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function focusMenuEdge(edge: "first" | "last") {
    const links =
      panelRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]");
    const target = edge === "first" ? links?.[0] : links?.[links.length - 1];
    target?.focus();
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) {
      toggleRef.current?.focus();
    }
  }

  function handleToggleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open || event.key !== "Tab") return;

    event.preventDefault();
    focusMenuEdge(event.shiftKey ? "last" : "first");
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key !== "Tab") return;

    const links =
      panelRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]");
    if (!links?.length) return;

    const first = links[0];
    const last = links[links.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      toggleRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      toggleRef.current?.focus();
    }
  }

  const navigationList = (
    navigationItems: readonly PublicNavigationItem[],
    compact: boolean,
  ) => (
    <ul
      className={compact ? "mobile-navigation__list" : "site-navigation__list"}
    >
      {navigationItems.map((item) => (
        <li key={item.id}>
          <Link
            aria-current={
              item.href === "/"
                ? pathname === "/"
                  ? "page"
                  : undefined
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? "page"
                  : undefined
            }
            className={
              compact ? "mobile-navigation__link" : "site-navigation__link"
            }
            href={item.href}
            onClick={compact ? () => closeMenu() : undefined}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
  const compactItems = [
    ...items,
    { id: "login", href: loginHref, label: "Log in" },
    { id: "account", href: accountHref, label: "Account" },
  ];

  return (
    <div className="public-navigation">
      <nav className="site-navigation" aria-label="Primary navigation">
        {navigationList(items, false)}
      </nav>

      <div className="site-header__actions">
        <Link className="site-header__login" href={loginHref}>
          Log in
        </Link>
        <Link className="site-header__account" href={accountHref}>
          Account
        </Link>
      </div>

      <button
        ref={toggleRef}
        className="mobile-navigation__toggle"
        type="button"
        aria-controls="mobile-menu"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleToggleKeyDown}
      >
        <span />
        <span />
        <span />
      </button>

      <button
        className="mobile-navigation__backdrop"
        type="button"
        tabIndex={-1}
        aria-label="Close menu"
        data-open={open ? "true" : "false"}
        onClick={() => closeMenu()}
      />

      <div
        ref={panelRef}
        id="mobile-menu"
        className="mobile-navigation__panel"
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
        inert={!open}
        onKeyDown={handlePanelKeyDown}
      >
        <nav aria-label="Primary navigation compact">
          {navigationList(compactItems, true)}
        </nav>
      </div>
    </div>
  );
}
