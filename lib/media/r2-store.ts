import type { R2MediaObjectBody, R2MediaObjectMetadata } from "./r2-object";
import type { ByteReadRange } from "./range";

export type R2MediaPutValue = Parameters<R2Bucket["put"]>[1];

export interface PutR2MediaObjectOptions {
  readonly contentType?: string;
}

export interface R2MediaStore {
  put(
    privateKey: string,
    value: R2MediaPutValue,
    options?: PutR2MediaObjectOptions,
  ): Promise<R2MediaObjectMetadata>;
  head(privateKey: string): Promise<R2MediaObjectMetadata | null>;
  get(privateKey: string): Promise<R2MediaObjectBody | null>;
  getRange(
    privateKey: string,
    range: ByteReadRange,
  ): Promise<R2MediaObjectBody | null>;
  remove(privateKey: string): Promise<void>;
}

const FALLBACK_CONTENT_TYPE = "application/octet-stream";

function requirePrivateKey(privateKey: string): string {
  if (typeof privateKey !== "string" || privateKey.trim().length === 0) {
    throw new TypeError("A non-empty private media object key is required.");
  }

  return privateKey;
}

function requireReadRange(range: ByteReadRange): ByteReadRange {
  if (
    !Number.isSafeInteger(range.offset) ||
    range.offset < 0 ||
    !Number.isSafeInteger(range.length) ||
    range.length <= 0
  ) {
    throw new RangeError(
      "A media byte range requires a non-negative offset and positive safe length.",
    );
  }

  return { offset: range.offset, length: range.length };
}

function safeContentType(contentType: string | undefined): string {
  const value = contentType?.trim() || FALLBACK_CONTENT_TYPE;
  try {
    const headers = new Headers();
    headers.set("content-type", value);
    return headers.get("content-type") ?? FALLBACK_CONTENT_TYPE;
  } catch {
    return FALLBACK_CONTENT_TYPE;
  }
}

function safeByteLength(size: number): number {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError("R2 returned an invalid media object size.");
  }

  return size;
}

function mapMetadata(
  object: R2Object,
  fallbackContentType?: string,
): R2MediaObjectMetadata {
  return {
    byteLength: safeByteLength(object.size),
    contentType: safeContentType(
      object.httpMetadata?.contentType ?? fallbackContentType,
    ),
  };
}

function mapBody(object: R2ObjectBody | null): R2MediaObjectBody | null {
  if (!object) {
    return null;
  }

  const body = object.body as ReadableStream<Uint8Array> | null | undefined;

  if (!body) {
    return null;
  }

  return {
    ...mapMetadata(object),
    body,
  };
}

/**
 * Wraps a server-injected Sites R2 binding with a deliberately narrow media
 * contract. Private keys are accepted only as method inputs; returned values
 * contain the body plus allowlisted byte length and content type facts.
 */
export function createR2MediaStore(bucket: R2Bucket): R2MediaStore {
  return {
    async put(privateKey, value, options = {}) {
      const key = requirePrivateKey(privateKey);
      const contentType = safeContentType(options.contentType);
      const object = await bucket.put(key, value, {
        httpMetadata: { contentType },
      });

      return mapMetadata(object, contentType);
    },

    async head(privateKey) {
      const object = await bucket.head(requirePrivateKey(privateKey));
      return object ? mapMetadata(object) : null;
    },

    async get(privateKey) {
      const object = await bucket.get(requirePrivateKey(privateKey));
      return mapBody(object);
    },

    async getRange(privateKey, range) {
      const object = await bucket.get(requirePrivateKey(privateKey), {
        range: requireReadRange(range),
      });
      return mapBody(object);
    },

    async remove(privateKey) {
      await bucket.delete(requirePrivateKey(privateKey));
    },
  };
}
