import { SetupContractError } from "./errors.ts";

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function canonicalValue(value: unknown, path: string): CanonicalJson {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SetupContractError(
        "SETUP_INPUT_INVALID",
        "Canonical setup data must contain only finite numbers.",
        [
          {
            path,
            code: "finite-number-required",
            message: "Use a finite JSON number.",
          },
        ],
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      canonicalValue(entry, `${path}[${index}]`),
    );
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new SetupContractError(
        "SETUP_INPUT_INVALID",
        "Canonical setup data must use plain JSON objects.",
        [
          {
            path,
            code: "plain-object-required",
            message: "Use a plain JSON object.",
          },
        ],
      );
    }

    const source = value as Record<string, unknown>;
    const sorted: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) {
        throw new SetupContractError(
          "SETUP_INPUT_INVALID",
          "Canonical setup data cannot contain undefined fields.",
          [
            {
              path: `${path}.${key}`,
              code: "json-value-required",
              message: "Use an explicit JSON value.",
            },
          ],
        );
      }
      sorted[key] = canonicalValue(entry, `${path}.${key}`);
    }
    return sorted;
  }

  throw new SetupContractError(
    "SETUP_INPUT_INVALID",
    "Canonical setup data must contain only JSON values.",
    [
      {
        path,
        code: "json-value-required",
        message: "Use a JSON string, number, boolean, null, array, or object.",
      },
    ],
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, "$"));
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

export async function canonicalSha256(value: unknown): Promise<string> {
  return sha256(canonicalJson(value));
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}
