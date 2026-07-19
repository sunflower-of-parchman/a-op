export interface ByteReadRange {
  readonly offset: number;
  readonly length: number;
}

export type FullRangeDecision = {
  readonly kind: "full";
  readonly reason: "range-absent" | "range-unit-unsupported";
  readonly totalSize: number;
  readonly length: number;
};

export type PartialRangeDecision = {
  readonly kind: "partial";
  readonly totalSize: number;
  readonly start: number;
  readonly end: number;
  readonly length: number;
  readonly readRange: ByteReadRange;
};

export type UnsatisfiableRangeDecision = {
  readonly kind: "unsatisfiable";
  readonly reason:
    "empty-representation" | "empty-suffix" | "start-beyond-representation";
  readonly totalSize: number;
};

export type MalformedRangeDecision = {
  readonly kind: "malformed";
  readonly reason:
    | "empty-header"
    | "missing-separator"
    | "empty-range"
    | "multiple-ranges-not-supported"
    | "invalid-range-syntax"
    | "numeric-overflow"
    | "reversed-range";
  readonly totalSize: number;
};

export type ByteRangeDecision =
  | FullRangeDecision
  | PartialRangeDecision
  | UnsatisfiableRangeDecision
  | MalformedRangeDecision;

export interface SafeMediaResponseMetadata {
  /** A validated public media type, never an R2 metadata header map. */
  readonly contentType?: string;
}

export interface MediaResponsePlan {
  readonly status: 200 | 206 | 416;
  readonly headers: Headers;
  /** Present only when the response body must use a bounded object read. */
  readonly readRange: ByteReadRange | null;
}

const DECIMAL_INTEGER = /^\d+$/;

function assertRepresentationSize(totalSize: number): void {
  if (!Number.isSafeInteger(totalSize) || totalSize < 0) {
    throw new RangeError(
      "The representation size must be a non-negative safe integer.",
    );
  }
}

function parseDecimalInteger(value: string): number | null {
  if (!DECIMAL_INTEGER.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function fullDecision(
  totalSize: number,
  reason: FullRangeDecision["reason"],
): FullRangeDecision {
  return {
    kind: "full",
    reason,
    totalSize,
    length: totalSize,
  };
}

/**
 * Parses at most one HTTP byte range for a representation of `totalSize`.
 *
 * Unsupported range units are intentionally ignored as a full response, as
 * required by HTTP semantics. Invalid byte syntax and multiple ranges remain
 * distinguishable so the delivery route can reject them without attempting an
 * object read.
 */
export function parseByteRange(
  rangeHeader: string | null | undefined,
  totalSize: number,
): ByteRangeDecision {
  assertRepresentationSize(totalSize);

  if (rangeHeader === null || rangeHeader === undefined) {
    return fullDecision(totalSize, "range-absent");
  }

  const value = rangeHeader.trim();

  if (value.length === 0) {
    return { kind: "malformed", reason: "empty-header", totalSize };
  }

  const separatorIndex = value.indexOf("=");

  if (separatorIndex < 1) {
    return { kind: "malformed", reason: "missing-separator", totalSize };
  }

  const unit = value.slice(0, separatorIndex);

  if (unit.toLowerCase() !== "bytes") {
    return fullDecision(totalSize, "range-unit-unsupported");
  }

  const rangeValue = value.slice(separatorIndex + 1);

  if (rangeValue.length === 0) {
    return { kind: "malformed", reason: "empty-range", totalSize };
  }

  if (rangeValue.includes(",")) {
    return {
      kind: "malformed",
      reason: "multiple-ranges-not-supported",
      totalSize,
    };
  }

  const match = /^(\d*)-(\d*)$/.exec(rangeValue);

  if (!match) {
    return {
      kind: "malformed",
      reason: "invalid-range-syntax",
      totalSize,
    };
  }

  const [, startValue, endValue] = match;

  if (startValue.length === 0 && endValue.length === 0) {
    return { kind: "malformed", reason: "empty-range", totalSize };
  }

  if (startValue.length === 0) {
    const suffixLength = parseDecimalInteger(endValue);

    if (suffixLength === null) {
      return { kind: "malformed", reason: "numeric-overflow", totalSize };
    }

    if (suffixLength === 0) {
      return { kind: "unsatisfiable", reason: "empty-suffix", totalSize };
    }

    if (totalSize === 0) {
      return {
        kind: "unsatisfiable",
        reason: "empty-representation",
        totalSize,
      };
    }

    const length = Math.min(suffixLength, totalSize);
    const start = totalSize - length;
    const end = totalSize - 1;

    return {
      kind: "partial",
      totalSize,
      start,
      end,
      length,
      readRange: { offset: start, length },
    };
  }

  const start = parseDecimalInteger(startValue);

  if (start === null) {
    return { kind: "malformed", reason: "numeric-overflow", totalSize };
  }

  let requestedEnd: number | null = null;

  if (endValue.length > 0) {
    requestedEnd = parseDecimalInteger(endValue);

    if (requestedEnd === null) {
      return { kind: "malformed", reason: "numeric-overflow", totalSize };
    }

    if (requestedEnd < start) {
      return { kind: "malformed", reason: "reversed-range", totalSize };
    }
  }

  if (totalSize === 0) {
    return {
      kind: "unsatisfiable",
      reason: "empty-representation",
      totalSize,
    };
  }

  if (start >= totalSize) {
    return {
      kind: "unsatisfiable",
      reason: "start-beyond-representation",
      totalSize,
    };
  }

  const end = Math.min(requestedEnd ?? totalSize - 1, totalSize - 1);
  const length = end - start + 1;

  return {
    kind: "partial",
    totalSize,
    start,
    end,
    length,
    readRange: { offset: start, length },
  };
}

function publicContentType(contentType: string | undefined): string {
  const value = contentType?.trim() || "application/octet-stream";
  try {
    const validationHeaders = new Headers();
    validationHeaders.set("content-type", value);
    return validationHeaders.get("content-type") ?? "application/octet-stream";
  } catch {
    return "application/octet-stream";
  }
}

/**
 * Creates an allowlisted response plan. R2 keys, custom metadata, ETags, and
 * service headers are never accepted by this boundary and cannot be forwarded.
 */
export function createMediaResponsePlan(
  decision: ByteRangeDecision,
  metadata: SafeMediaResponseMetadata = {},
): MediaResponsePlan {
  const headers = new Headers({ "accept-ranges": "bytes" });

  if (decision.kind === "unsatisfiable" || decision.kind === "malformed") {
    headers.set("content-length", "0");
    headers.set("content-range", `bytes */${decision.totalSize}`);

    return { status: 416, headers, readRange: null };
  }

  headers.set("content-type", publicContentType(metadata.contentType));
  headers.set("content-length", String(decision.length));

  if (decision.kind === "partial") {
    headers.set(
      "content-range",
      `bytes ${decision.start}-${decision.end}/${decision.totalSize}`,
    );

    return { status: 206, headers, readRange: decision.readRange };
  }

  return { status: 200, headers, readRange: null };
}

/** Builds the final response while ensuring a 416 never carries object bytes. */
export function createMediaResponse(
  plan: MediaResponsePlan,
  body: BodyInit | null,
): Response {
  return new Response(plan.status === 416 ? null : body, {
    status: plan.status,
    headers: plan.headers,
  });
}
