import { assertStripeWebhookSecret } from "./environment.ts";
import { CommerceAdapterError } from "./errors.ts";
import {
  parseVerifiedStripeTestEvent,
  type StripeTestEvent,
} from "./stripe-events.ts";

export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export interface StripeWebhookVerificationInput {
  readonly rawBody: Uint8Array;
  readonly signatureHeader: unknown;
  readonly webhookSecret: unknown;
  readonly nowUnix?: () => number;
  readonly toleranceSeconds?: number;
  readonly subtleCrypto?: SubtleCrypto;
}

export interface StripeWebhookVerificationReceipt {
  readonly verified: true;
  readonly timestamp: number;
}

export interface StripeWebhookDigests {
  readonly rawBodyDigest: string;
  readonly factsFingerprint: string;
}

interface ParsedSignatureHeader {
  readonly timestamp: number;
  readonly signatures: readonly Uint8Array[];
}

const MAX_SIGNATURE_HEADER_LENGTH = 4_096;
const MAX_V1_SIGNATURES = 8;
const V1_SIGNATURE = /^[a-f0-9]{64}$/i;

function invalidSignature(): never {
  throw new CommerceAdapterError(
    "STRIPE_WEBHOOK_SIGNATURE_INVALID",
    "The Stripe webhook signature is invalid.",
  );
}

function parseHex(value: string): Uint8Array {
  if (!V1_SIGNATURE.test(value)) invalidSignature();
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function parseSignatureHeader(value: unknown): ParsedSignatureHeader {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SIGNATURE_HEADER_LENGTH ||
    /[\r\n]/.test(value)
  ) {
    invalidSignature();
  }

  let timestamp: number | null = null;
  const signatures: Uint8Array[] = [];

  for (const segment of value.split(",")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) invalidSignature();
    const scheme = segment.slice(0, separator).trim();
    const signature = segment.slice(separator + 1).trim();

    if (scheme === "t") {
      if (
        timestamp !== null ||
        !/^[0-9]{1,16}$/.test(signature) ||
        !Number.isSafeInteger(Number(signature)) ||
        Number(signature) <= 0
      ) {
        invalidSignature();
      }
      timestamp = Number(signature);
    } else if (scheme === "v1") {
      signatures.push(parseHex(signature));
      if (signatures.length > MAX_V1_SIGNATURES) invalidSignature();
    }
  }

  if (timestamp === null || signatures.length === 0) invalidSignature();
  return Object.freeze({ timestamp, signatures: Object.freeze(signatures) });
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

function hexadecimal(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

async function sha256(
  value: Uint8Array,
  subtleCrypto: SubtleCrypto,
): Promise<string> {
  const digest = await subtleCrypto.digest(
    "SHA-256",
    Uint8Array.from(value).buffer,
  );
  return hexadecimal(new Uint8Array(digest));
}

async function expectedSignature(
  rawBody: Uint8Array,
  timestamp: number,
  webhookSecret: string,
  subtleCrypto: SubtleCrypto,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${timestamp}.`);
  const signedPayload = new Uint8Array(prefix.byteLength + rawBody.byteLength);
  signedPayload.set(prefix, 0);
  signedPayload.set(rawBody, prefix.byteLength);

  try {
    const key = await subtleCrypto.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await subtleCrypto.sign("HMAC", key, signedPayload);
    return new Uint8Array(signature);
  } catch {
    return invalidSignature();
  }
}

/** Verifies Stripe's v1 HMAC against the exact bytes supplied by the route. */
export async function verifyStripeWebhookSignature(
  input: StripeWebhookVerificationInput,
): Promise<StripeWebhookVerificationReceipt> {
  assertStripeWebhookSecret(input.webhookSecret);
  if (!(input.rawBody instanceof Uint8Array)) invalidSignature();

  const parsed = parseSignatureHeader(input.signatureHeader);
  const tolerance = input.toleranceSeconds ?? STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  const now = Math.floor((input.nowUnix ?? (() => Date.now() / 1_000))());
  if (
    !Number.isSafeInteger(tolerance) ||
    tolerance <= 0 ||
    !Number.isSafeInteger(now) ||
    Math.abs(now - parsed.timestamp) > tolerance
  ) {
    throw new CommerceAdapterError(
      "STRIPE_WEBHOOK_TIMESTAMP_INVALID",
      "The Stripe webhook timestamp is outside the accepted window.",
    );
  }

  const expected = await expectedSignature(
    input.rawBody,
    parsed.timestamp,
    input.webhookSecret,
    input.subtleCrypto ?? globalThis.crypto.subtle,
  );

  let matches = 0;
  for (const candidate of parsed.signatures) {
    matches |= constantTimeEqual(expected, candidate) ? 1 : 0;
  }
  if (matches !== 1) invalidSignature();

  return Object.freeze({ verified: true, timestamp: parsed.timestamp });
}

/** Verifies the raw body first, then parses and projects the allowlisted event. */
export async function verifyAndParseStripeTestEvent(
  input: StripeWebhookVerificationInput,
): Promise<StripeTestEvent> {
  await verifyStripeWebhookSignature(input);

  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      input.rawBody,
    );
    value = JSON.parse(text) as unknown;
  } catch {
    throw new CommerceAdapterError(
      "STRIPE_WEBHOOK_PAYLOAD_INVALID",
      "The verified Stripe event payload is invalid.",
    );
  }

  return parseVerifiedStripeTestEvent(value);
}

/** Produces only redacted replay identifiers from raw bytes and projected facts. */
export async function digestVerifiedStripeTestEvent(
  rawBody: Uint8Array,
  event: StripeTestEvent,
  subtleCrypto: SubtleCrypto = globalThis.crypto.subtle,
): Promise<StripeWebhookDigests> {
  const canonicalFacts = new TextEncoder().encode(
    `a-op:stripe-test-event:v1\n${JSON.stringify(event)}`,
  );
  const [rawBodyDigest, factsFingerprint] = await Promise.all([
    sha256(rawBody, subtleCrypto),
    sha256(canonicalFacts, subtleCrypto),
  ]);
  return Object.freeze({ rawBodyDigest, factsFingerprint });
}
