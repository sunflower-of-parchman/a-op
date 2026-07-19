"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "aop-theme";
const THEME_CHANGE_EVENT = "aop-theme-change";
const DARK_THEME_COLOR = "#08090B";
const LIGHT_THEME_COLOR = "#F4F6F9";

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

function getColorSchemeQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
}

function getSystemTheme(): Theme {
  const colorScheme = getColorSchemeQuery();
  return colorScheme ? (colorScheme.matches ? "dark" : "light") : "dark";
}

function getStoredTheme(): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function getDocumentTheme(): Theme | null {
  const documentTheme = document.documentElement.dataset.theme;
  return isTheme(documentTheme) ? documentTheme : null;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  let themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );

  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    document.head.appendChild(themeColor);
  }

  themeColor.content = theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
}

function getThemeSnapshot(): Theme {
  if (typeof document === "undefined") return "dark";
  return getDocumentTheme() ?? getStoredTheme() ?? getSystemTheme();
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

function subscribeToTheme(onStoreChange: () => void) {
  const colorScheme = getColorSchemeQuery();
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;

    const nextTheme = isTheme(event.newValue)
      ? event.newValue
      : getSystemTheme();
    applyTheme(nextTheme);
    onStoreChange();
  };
  const handleSystemThemeChange = (event: MediaQueryListEvent) => {
    if (getStoredTheme()) return;

    applyTheme(event.matches ? "dark" : "light");
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  colorScheme?.addEventListener("change", handleSystemThemeChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    colorScheme?.removeEventListener("change", handleSystemThemeChange);
  };
}

export function ThemeToggle() {
  const activeTheme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  const nextTheme: Theme = activeTheme === "dark" ? "light" : "dark";

  const toggleTheme = () => {
    applyTheme(nextTheme);

    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Theme selection still applies when browser storage is unavailable.
    }

    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${nextTheme} theme`}
      data-theme={activeTheme}
      onClick={toggleTheme}
      style={{ minBlockSize: 44, minInlineSize: 44 }}
    >
      <span className="theme-toggle__label">{nextTheme} theme</span>
    </button>
  );
}

export default ThemeToggle;
