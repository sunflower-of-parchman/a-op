export type SafeJsonPrimitive = boolean | number | string | null;

export type SafeJsonValue =
  | SafeJsonPrimitive
  | readonly SafeJsonValue[]
  | { readonly [key: string]: SafeJsonValue };

export type SafeJsonObject = { readonly [key: string]: SafeJsonValue };

export const REDACTED_VALUE = "[REDACTED]";
export const REQUEST_ID_HEADER = "x-request-id";
export const RUNTIME_ENVIRONMENT_VARIABLE = "AOP_RUNTIME_ENV";

const CIRCULAR_VALUE = "[CIRCULAR]";
const MAX_DEPTH_VALUE = "[MAX_DEPTH]";
const UNSERIALIZABLE_VALUE = "[UNSERIALIZABLE]";
const MAX_DEPTH = 8;
const MAX_STRING_LENGTH = 2_048;
const REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{7,127}$/i;
const DEFAULT_ERROR_CODE = "INTERNAL_ERROR";
const DEFAULT_ERROR_MESSAGE = "The request could not be completed.";
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;

const SENSITIVE_KEY_PARTS = new Set([
  "address",
  "authorization",
  "billing",
  "card",
  "checkout",
  "cookie",
  "credential",
  "customer",
  "email",
  "password",
  "passwd",
  "pan",
  "payment",
  "phone",
  "provider",
  "secret",
  "signature",
  "token",
]);

const SENSITIVE_COMPOUND_KEYS = new Set([
  "accesskey",
  "accesstoken",
  "apikey",
  "clientsecret",
  "customerdata",
  "filepath",
  "localpath",
  "objectkey",
  "privatekey",
  "refreshtoken",
  "setcookie",
  "signedurl",
]);

const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const BEARER_PATTERN = /\bbearer\s+[a-z0-9._~+/=-]{8,}/i;
const BASIC_AUTH_PATTERN = /\bbasic\s+[a-z0-9+/=]{8,}/i;
const JWT_PATTERN = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/i;
const NAMED_SECRET_PATTERN =
  /\b(?:api[_-]?key|password|secret|signature|token|x-amz-signature)\s*[=:]\s*[^\s&,;]+/i;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const PROVIDER_TOKEN_PATTERN =
  /\b(?:gh[opsu]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})\b/i;
const STRIPE_CREDENTIAL_PATTERN =
  /\b(?:pk|rk|sk)_(?:live|test)_[a-z0-9]{4,}\b/i;
const STRIPE_WEBHOOK_SECRET_PATTERN = /\bwhsec_[a-z0-9]{4,}\b/i;
const STRIPE_OBJECT_PATTERN =
  /\b(?:(?:acct|ba|card|ch|cus|evt|in|li|pi|pm|price|prod|seti|src|sub|tok)_[a-z0-9]{10,}|cs_(?:live|test)_[a-z0-9]{10,})\b/i;
const STRIPE_CLIENT_SECRET_PATTERN =
  /\b(?:pi_|seti_)[a-z0-9_]{6,}_secret_[a-z0-9]{6,}\b/i;
const STRIPE_CHECKOUT_URL_PATTERN = /https:\/\/checkout\.stripe\.com\//i;
const STRIPE_SIGNATURE_VALUE_PATTERN =
  /(?:^|[,\s])t=\d{8,},v1=[a-f0-9]{16,}(?:[,\s]|$)/i;
const PAN_LIKE_PATTERN = /(?:^|[^\d])(?:\d[ -]?){12,18}\d(?:$|[^\d])/;
const UNIX_LOCAL_PATH_PATTERN =
  /(?:^|[\s"'(])\/(?:Users|Volumes|home|private|tmp|var\/folders)\/[^\s"')]+/;
const WINDOWS_LOCAL_PATH_PATTERN = /(?:^|[\s"'(])[a-z]:\\[^\s"')]+/i;

function keyParts(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isSensitiveFieldName(key: string): boolean {
  const parts = keyParts(key);
  const compound = parts.join("");

  return (
    parts.some((part) => SENSITIVE_KEY_PARTS.has(part)) ||
    SENSITIVE_COMPOUND_KEYS.has(compound)
  );
}

function containsSensitiveUrl(value: string): boolean {
  const candidates = value.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];

  return candidates.some((candidate) => {
    try {
      const url = new URL(candidate.replace(/[),.;]+$/, ""));

      for (const key of url.searchParams.keys()) {
        if (
          isSensitiveFieldName(key) ||
          key.toLowerCase().startsWith("x-amz-")
        ) {
          return true;
        }
      }

      return url.username.length > 0 || url.password.length > 0;
    } catch {
      return false;
    }
  });
}

export function containsSensitiveValue(value: string): boolean {
  return (
    EMAIL_PATTERN.test(value) ||
    BEARER_PATTERN.test(value) ||
    BASIC_AUTH_PATTERN.test(value) ||
    JWT_PATTERN.test(value) ||
    NAMED_SECRET_PATTERN.test(value) ||
    PRIVATE_KEY_PATTERN.test(value) ||
    PROVIDER_TOKEN_PATTERN.test(value) ||
    STRIPE_CREDENTIAL_PATTERN.test(value) ||
    STRIPE_WEBHOOK_SECRET_PATTERN.test(value) ||
    STRIPE_OBJECT_PATTERN.test(value) ||
    STRIPE_CLIENT_SECRET_PATTERN.test(value) ||
    STRIPE_CHECKOUT_URL_PATTERN.test(value) ||
    STRIPE_SIGNATURE_VALUE_PATTERN.test(value) ||
    PAN_LIKE_PATTERN.test(value) ||
    UNIX_LOCAL_PATH_PATTERN.test(value) ||
    WINDOWS_LOCAL_PATH_PATTERN.test(value) ||
    containsSensitiveUrl(value)
  );
}

export function redactString(value: string): string {
  if (containsSensitiveValue(value)) {
    return REDACTED_VALUE;
  }

  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

function redactObject(
  value: object,
  depth: number,
  ancestors: WeakSet<object>,
): SafeJsonValue {
  if (ancestors.has(value)) {
    return CIRCULAR_VALUE;
  }

  if (depth >= MAX_DEPTH) {
    return MAX_DEPTH_VALUE;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.valueOf())
      ? UNSERIALIZABLE_VALUE
      : value.toISOString();
  }

  if (value instanceof URL) {
    return redactString(value.toString());
  }

  if (value instanceof Error) {
    return {
      name: redactString(value.name || "Error"),
      message: redactString(value.message || "Unknown error"),
    };
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactUnknown(item, depth + 1, ancestors));
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      return UNSERIALIZABLE_VALUE;
    }

    const output: Record<string, SafeJsonValue> = {};

    for (const key of Object.keys(value).sort()) {
      if (isSensitiveFieldName(key)) {
        output[key] = REDACTED_VALUE;
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      output[key] =
        descriptor && "value" in descriptor
          ? redactUnknown(descriptor.value, depth + 1, ancestors)
          : UNSERIALIZABLE_VALUE;
    }

    return output;
  } catch {
    return UNSERIALIZABLE_VALUE;
  } finally {
    ancestors.delete(value);
  }
}

function redactUnknown(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): SafeJsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return null;
  }

  if (typeof value === "object") {
    return redactObject(value, depth, ancestors);
  }

  return UNSERIALIZABLE_VALUE;
}

/** Converts unknown input into recursively redacted, JSON-safe data. */
export function redactForJson(value: unknown): SafeJsonValue {
  try {
    return redactUnknown(value, 0, new WeakSet<object>());
  } catch {
    return UNSERIALIZABLE_VALUE;
  }
}

/** Redacts a context object and returns an object even for malformed input. */
export function redactContext(value: unknown): SafeJsonObject {
  const redacted = redactForJson(value);

  if (
    redacted !== null &&
    !Array.isArray(redacted) &&
    typeof redacted === "object"
  ) {
    return redacted as SafeJsonObject;
  }

  return { value: redacted };
}

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

/** Creates a server-owned request identifier suitable for responses and logs. */
export function createRequestId(
  generate: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const requestId = generate();

  if (!isRequestId(requestId)) {
    throw new RangeError(
      "The request ID generator returned an invalid identifier.",
    );
  }

  return requestId;
}

export interface RuntimeErrorOptions {
  readonly status?: number;
  readonly publicMessage?: string;
  readonly details?: unknown;
}

/** A deliberate application error whose public message is safe to return. */
export class RuntimeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    options: RuntimeErrorOptions = {},
  ) {
    super(message);
    this.name = "RuntimeError";
    this.code = normalizeErrorCode(code);
    this.status = normalizeStatus(options.status);
    this.publicMessage = safePublicMessage(options.publicMessage);
    this.details = options.details;
  }
}

export interface NormalizedRuntimeError {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;
  readonly log: {
    readonly name: string;
    readonly message: string;
    readonly details?: SafeJsonObject;
  };
}

export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

function normalizeErrorCode(value: string): string {
  return ERROR_CODE_PATTERN.test(value) ? value : DEFAULT_ERROR_CODE;
}

function normalizeStatus(value: number | undefined): number {
  return Number.isInteger(value) &&
    value !== undefined &&
    value >= 400 &&
    value <= 599
    ? value
    : 500;
}

function safePublicMessage(value: string | undefined): string {
  if (!value) {
    return DEFAULT_ERROR_MESSAGE;
  }

  const redacted = redactString(value);
  return redacted === value ? value : DEFAULT_ERROR_MESSAGE;
}

function errorName(error: Error): string {
  const name = redactString(error.name || "Error");
  return name.length > 0 ? name : "Error";
}

/** Normalizes any thrown value without exposing its stack, cause, or raw data. */
export function normalizeUnknownError(error: unknown): NormalizedRuntimeError {
  try {
    if (error instanceof RuntimeError) {
      return {
        code: error.code,
        status: error.status,
        publicMessage: error.publicMessage,
        log: {
          name: errorName(error),
          message: redactString(error.message || DEFAULT_ERROR_MESSAGE),
          ...(error.details === undefined
            ? {}
            : { details: redactContext(error.details) }),
        },
      };
    }

    if (error instanceof Error) {
      return {
        code: DEFAULT_ERROR_CODE,
        status: 500,
        publicMessage: DEFAULT_ERROR_MESSAGE,
        log: {
          name: errorName(error),
          message: redactString(error.message || DEFAULT_ERROR_MESSAGE),
        },
      };
    }

    return {
      code: DEFAULT_ERROR_CODE,
      status: 500,
      publicMessage: DEFAULT_ERROR_MESSAGE,
      log: {
        name: "UnknownThrownValue",
        message: redactString(
          typeof error === "string" ? error : "A non-Error value was thrown.",
        ),
        details:
          typeof error === "object" && error !== null
            ? redactContext(error)
            : undefined,
      },
    };
  } catch {
    return {
      code: DEFAULT_ERROR_CODE,
      status: 500,
      publicMessage: DEFAULT_ERROR_MESSAGE,
      log: {
        name: "UnreadableThrownValue",
        message: "The thrown value could not be inspected safely.",
      },
    };
  }
}

export function createErrorEnvelope(
  error: unknown,
  requestId: string,
): ErrorEnvelope {
  if (!isRequestId(requestId)) {
    throw new RangeError(
      "A valid request ID is required for an error envelope.",
    );
  }

  const normalized = normalizeUnknownError(error);

  return {
    error: {
      code: normalized.code,
      message: normalized.publicMessage,
      requestId,
    },
  };
}

export function createErrorResponse(
  error: unknown,
  requestId: string,
  headers?: HeadersInit,
): Response {
  const normalized = normalizeUnknownError(error);
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set(REQUEST_ID_HEADER, requestId);

  return new Response(JSON.stringify(createErrorEnvelope(error, requestId)), {
    status: normalized.status,
    headers: responseHeaders,
  });
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecordInput {
  readonly level: LogLevel;
  readonly event: string;
  readonly requestId: string;
  readonly message?: string;
  readonly context?: unknown;
  readonly error?: unknown;
}

export interface StructuredLogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly requestId: string;
  readonly message?: string;
  readonly context?: SafeJsonObject;
  readonly error?: {
    readonly code: string;
    readonly name: string;
    readonly message: string;
    readonly details?: SafeJsonObject;
  };
}

export type StructuredLogSink = (
  serialized: string,
  record: StructuredLogRecord,
) => void;

export interface StructuredLogger {
  record(input: LogRecordInput): StructuredLogRecord;
  write(input: LogRecordInput): StructuredLogRecord;
}

function normalizeEventName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 96);

  return normalized || "runtime.event";
}

function stableTimestamp(now: () => Date): string {
  try {
    const value = now();
    return Number.isNaN(value.valueOf())
      ? "1970-01-01T00:00:00.000Z"
      : value.toISOString();
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

/** Creates a redacted JSON-safe log record without emitting it. */
export function createLogRecord(
  input: LogRecordInput,
  now: () => Date = () => new Date(),
): StructuredLogRecord {
  const record: StructuredLogRecord = {
    timestamp: stableTimestamp(now),
    level: input.level,
    event: normalizeEventName(input.event),
    requestId: isRequestId(input.requestId) ? input.requestId : "unassigned",
    ...(input.message === undefined
      ? {}
      : { message: redactString(input.message) }),
    ...(input.context === undefined
      ? {}
      : { context: redactContext(input.context) }),
  };

  if (input.error === undefined) {
    return record;
  }

  const normalized = normalizeUnknownError(input.error);

  return {
    ...record,
    error: {
      code: normalized.code,
      name: normalized.log.name,
      message: normalized.log.message,
      ...(normalized.log.details === undefined
        ? {}
        : { details: normalized.log.details }),
    },
  };
}

export function serializeLogRecord(record: StructuredLogRecord): string {
  return JSON.stringify(record);
}

/** Creates a logger whose caller supplies the server-side output sink. */
export function createStructuredLogger(options: {
  readonly sink: StructuredLogSink;
  readonly now?: () => Date;
}): StructuredLogger {
  const record = (input: LogRecordInput) =>
    createLogRecord(input, options.now ?? (() => new Date()));

  return {
    record,
    write(input) {
      const nextRecord = record(input);
      options.sink(serializeLogRecord(nextRecord), nextRecord);
      return nextRecord;
    },
  };
}
