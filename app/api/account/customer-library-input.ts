import type { CustomerLibraryValidationResult } from "@/lib/customer-library/validation.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export function requireCustomerLibraryInput<T>(
  result: CustomerLibraryValidationResult<T>,
  label: string,
): T {
  if (result.ok) return result.value;

  throw new RuntimeError("INVALID_INPUT", `${label} is invalid.`, {
    status: 400,
    publicMessage: "Provide valid customer library information.",
    details: { issues: result.issues },
  });
}

export function requirePlaylistId(value: unknown): string {
  if (typeof value === "string" && SAFE_ID.test(value)) return value;

  throw new RuntimeError(
    "INVALID_INPUT",
    "Playlist ID must be a safe application identifier.",
    {
      status: 400,
      publicMessage: "The requested playlist identifier is invalid.",
    },
  );
}
