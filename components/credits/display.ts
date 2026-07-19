import type {
  CreditGrantOrigin,
  CreditKind,
  CreditLedgerOrigin,
} from "@/lib/benefit-credits/types.ts";

export function creditKindLabel(kind: CreditKind): string {
  return kind === "download" ? "Download credits" : "License credits";
}

export function label(value: string): string {
  return value
    .split(/[_-]/)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function dateTime(value: string | null): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(parsed);
}

export function commerceOrigin(
  origin: CreditGrantOrigin | CreditLedgerOrigin,
): boolean {
  return (
    origin === "membership" || origin === "subscription" || origin === "order"
  );
}
