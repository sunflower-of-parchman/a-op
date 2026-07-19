import type { LicenseValidationResult } from "@/lib/licensing/validation.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export function requireLicensingInput<T>(
  result: LicenseValidationResult<T>,
  label: string,
): T {
  if (result.ok) return result.value;

  throw new RuntimeError("INVALID_INPUT", `${label} is invalid.`, {
    status: 400,
    publicMessage: "Provide valid licensing information.",
    details: { issues: result.issues },
  });
}
