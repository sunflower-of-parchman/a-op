import type { ByteReadRange } from "./range";

/** Public-safe facts copied from an R2 object after server-side validation. */
export interface R2MediaObjectMetadata {
  readonly byteLength: number;
  readonly contentType: string;
}

/** A Worker-compatible body returned by a full or bounded R2 read. */
export interface R2MediaObjectBody extends R2MediaObjectMetadata {
  readonly body: ReadableStream<Uint8Array>;
}

/**
 * An object-scoped adapter. The private R2 key remains captured inside the
 * implementation and therefore cannot enter route results or browser output.
 */
export interface R2MediaObjectAdapter {
  head(): Promise<R2MediaObjectMetadata | null>;
  get(range?: ByteReadRange): Promise<R2MediaObjectBody | null>;
}
