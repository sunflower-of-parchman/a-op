import { ACCESS_RESOURCE_TYPES } from "@/db/access-read.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import type { AccessExplanationInput, MediaJobRetryInput } from "./types.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const RESOURCE_TYPES = new Set<string>(ACCESS_RESOURCE_TYPES);
const ACTIONS = new Set(["view", "stream", "download"]);

function invalid(message: string): never {
  throw new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide valid diagnostic information.",
  });
}

function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    return invalid("The diagnostic input must be a JSON object.");
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set(keys);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return invalid("The diagnostic input contains unsupported fields.");
  }
  return input;
}

export function requireSafeOperationsId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    return invalid(`${label} must be a safe application identifier.`);
  }
  return value;
}

export function requireAccessExplanationInput(
  value: unknown,
): AccessExplanationInput {
  const input = record(value, [
    "customerUserId",
    "resourceType",
    "resourceId",
    "action",
  ]);
  const customerUserId = requireSafeOperationsId(
    input.customerUserId,
    "Customer user ID",
  );
  const resourceId = requireSafeOperationsId(input.resourceId, "Resource ID");
  if (
    typeof input.resourceType !== "string" ||
    !RESOURCE_TYPES.has(input.resourceType)
  ) {
    return invalid("A supported resource type is required.");
  }
  if (typeof input.action !== "string" || !ACTIONS.has(input.action)) {
    return invalid("A supported protected-read action is required.");
  }
  return {
    customerUserId,
    resourceType: input.resourceType as AccessExplanationInput["resourceType"],
    resourceId,
    action: input.action as AccessExplanationInput["action"],
  };
}

export function requireMediaJobRetryInput(
  jobId: unknown,
  value: unknown,
): MediaJobRetryInput {
  const input = record(value, ["expectedAttemptCount"]);
  if (
    !Number.isSafeInteger(input.expectedAttemptCount) ||
    (input.expectedAttemptCount as number) < 0
  ) {
    return invalid("Expected attempt count must be a nonnegative integer.");
  }
  return {
    jobId: requireSafeOperationsId(jobId, "Media job ID"),
    expectedAttemptCount: input.expectedAttemptCount as number,
  };
}
