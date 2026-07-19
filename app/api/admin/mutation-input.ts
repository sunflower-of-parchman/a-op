import { RuntimeError } from "@/lib/runtime/index.ts";
import { SITE_INPUT_LIMITS } from "@/lib/site/validation.ts";

const SAFE_USER_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalidInput(message: string, details?: unknown): never {
  throw new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide valid information for this change.",
    ...(details === undefined ? {} : { details }),
  });
}

export function requireMutationObject(
  input: unknown,
  allowedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  ) {
    return invalidInput(`${label} must be a JSON object.`);
  }

  const record = input as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  const unexpectedKeys = Object.keys(record).filter((key) => !allowed.has(key));
  if (unexpectedKeys.length > 0) {
    return invalidInput(`${label} contains unsupported fields.`, {
      fields: unexpectedKeys.sort(),
    });
  }

  return record;
}

export function requireExpectedVersion(
  value: unknown,
  options: { readonly allowZero: boolean },
): number {
  const minimum = options.allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    return invalidInput(
      `Expected version must be a safe integer greater than or equal to ${minimum}.`,
    );
  }
  return value as number;
}

export function requireRouteSlug(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > SITE_INPUT_LIMITS.slug ||
    !SAFE_SLUG.test(value)
  ) {
    return invalidInput("Page slug must be a normalized route segment.");
  }
  return value;
}

export function requireSafeUserId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_USER_ID.test(value)) {
    return invalidInput(
      "Editor user ID must be a safe application identifier.",
    );
  }
  return value;
}

export function throwValidationIssues(
  label: string,
  issues: readonly unknown[],
): never {
  return invalidInput(`${label} is invalid.`, { issues });
}
