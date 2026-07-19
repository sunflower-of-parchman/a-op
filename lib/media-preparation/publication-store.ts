import { RuntimeError } from "../runtime/index.ts";
import { sha256Hex } from "./hash.ts";
import type { MediaPublication } from "./publication-request.ts";

export interface StoredPublicationObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly etag: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ImmutablePublicationStore {
  read(key: string): Promise<StoredPublicationObject | null>;
  put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
    metadata: Readonly<Record<string, string>>,
  ): Promise<void>;
}

export interface VerifiedPublicationObject {
  readonly privateObjectKey: string;
  readonly etag: string | null;
  readonly reused: boolean;
}

const PUBLICATION_METADATA_KEYS = Object.freeze({
  sha256: "aop-sha256",
  proposal: "aop-proposal-sha256",
  approval: "aop-approval-sha256",
  manifest: "aop-manifest-sha256",
  application: "aop-application-id",
  media: "aop-media-id",
  mediaKey: "aop-media-key",
});

export function publicationObjectKey(publication: MediaPublication): string {
  const namespace = publication.role === "source" ? "originals" : "derivatives";
  return `${namespace}/sha256/${publication.mediaSha256}/${publication.approvalSha256}/${publication.mediaId}`;
}

function expectedMetadata(
  publication: MediaPublication,
): Readonly<Record<string, string>> {
  return Object.freeze({
    [PUBLICATION_METADATA_KEYS.sha256]: publication.mediaSha256,
    [PUBLICATION_METADATA_KEYS.proposal]: publication.proposalSha256,
    [PUBLICATION_METADATA_KEYS.approval]: publication.approvalSha256,
    [PUBLICATION_METADATA_KEYS.manifest]: publication.manifestSha256,
    [PUBLICATION_METADATA_KEYS.application]: publication.applicationId,
    [PUBLICATION_METADATA_KEYS.media]: publication.mediaId,
    [PUBLICATION_METADATA_KEYS.mediaKey]: publication.mediaKey,
  });
}

function conflict(message: string): RuntimeError {
  return new RuntimeError("MEDIA_OBJECT_CONFLICT", message, {
    status: 409,
    publicMessage:
      "The immutable media object does not match this approved publication.",
  });
}

async function verifyObject(
  object: StoredPublicationObject,
  publication: MediaPublication,
  expectedByteLength: number,
  metadata: Readonly<Record<string, string>>,
): Promise<void> {
  if (
    object.bytes.byteLength !== expectedByteLength ||
    object.contentType !== publication.contentType ||
    (await sha256Hex(object.bytes)) !== publication.mediaSha256
  ) {
    throw conflict(
      "Stored media bytes or HTTP metadata differ from the approved object.",
    );
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (object.metadata[key] !== value) {
      throw conflict(
        "Stored media SHA metadata differs from the approved object.",
      );
    }
  }
}

export async function ensureImmutablePublicationObject(
  store: ImmutablePublicationStore,
  publication: MediaPublication,
  bytes: Uint8Array,
): Promise<VerifiedPublicationObject> {
  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== publication.mediaSha256) {
    throw new RuntimeError(
      "MEDIA_HASH_MISMATCH",
      "Media body SHA-256 does not match the approved manifest.",
      {
        status: 409,
        publicMessage:
          "The selected media bytes do not match their approved manifest.",
      },
    );
  }
  const key = publicationObjectKey(publication);
  const metadata = expectedMetadata(publication);
  const existing = await store.read(key);
  if (existing) {
    await verifyObject(existing, publication, bytes.byteLength, metadata);
    return { privateObjectKey: key, etag: existing.etag, reused: true };
  }

  await store.put(key, bytes, publication.contentType, metadata);
  const stored = await store.read(key);
  if (!stored) {
    throw new RuntimeError(
      "MEDIA_OBJECT_VERIFY_FAILED",
      "R2 did not return the media object after publication.",
      {
        status: 503,
        publicMessage:
          "The media object could not be verified after publication.",
      },
    );
  }
  await verifyObject(stored, publication, bytes.byteLength, metadata);
  return { privateObjectKey: key, etag: stored.etag, reused: false };
}

export function createR2ImmutablePublicationStore(
  bucket: R2Bucket,
): ImmutablePublicationStore {
  return {
    async read(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        bytes: new Uint8Array(await object.arrayBuffer()),
        contentType:
          object.httpMetadata?.contentType ?? "application/octet-stream",
        etag: typeof object.etag === "string" ? object.etag : null,
        metadata: Object.freeze({ ...(object.customMetadata ?? {}) }),
      };
    },
    async put(key, bytes, contentType, metadata) {
      await bucket.put(key, bytes, {
        httpMetadata: { contentType },
        customMetadata: { ...metadata },
      });
    },
  };
}
