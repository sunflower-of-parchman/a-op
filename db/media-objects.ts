export type MediaVisibility = "public" | "protected";

export interface MediaDeliveryRecord {
  readonly id: string;
  /** Server-only R2 identifier. Never return this record directly to a client. */
  readonly objectKey: string;
  readonly visibility: MediaVisibility;
  readonly ownerUserId: string | null;
  readonly contentType: string;
  readonly byteLength: number;
}

interface MediaDeliveryRow {
  id: string;
  object_key: string;
  visibility: string;
  owner_user_id: string | null;
  content_type: string;
  byte_length: number;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const PRIVATE_OBJECT_KEY = /^[a-z0-9][a-z0-9._/-]{0,511}$/i;

function requireSafeId(value: string, label: string): string {
  if (!SAFE_ID.test(value)) {
    throw new TypeError(`${label} must be a safe application identifier.`);
  }
  return value;
}

function requirePrivateObjectKey(value: string): string {
  if (!PRIVATE_OBJECT_KEY.test(value) || value.includes("..")) {
    throw new TypeError("The private media object key is invalid.");
  }
  return value;
}

function requireContentType(value: string): string {
  try {
    const headers = new Headers();
    headers.set("content-type", value.trim());
    const normalized = headers.get("content-type");
    if (!normalized) throw new TypeError();
    return normalized;
  } catch {
    throw new TypeError("The media content type is invalid.");
  }
}

function requireByteLength(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("The media byte length is invalid.");
  }
  return value;
}

function isVisibility(value: string): value is MediaVisibility {
  return value === "public" || value === "protected";
}

function mapDeliveryRecord(row: MediaDeliveryRow): MediaDeliveryRecord {
  if (!isVisibility(row.visibility)) {
    throw new Error("D1 returned an invalid media visibility.");
  }

  return {
    id: requireSafeId(row.id, "Media ID"),
    objectKey: requirePrivateObjectKey(row.object_key),
    visibility: row.visibility,
    ownerUserId:
      row.owner_user_id === null
        ? null
        : requireSafeId(row.owner_user_id, "Media owner ID"),
    contentType: requireContentType(row.content_type),
    byteLength: requireByteLength(row.byte_length),
  };
}

export async function readMediaDeliveryRecord(
  binding: D1Database,
  id: string,
): Promise<MediaDeliveryRecord | null> {
  const row = await binding
    .prepare(
      `SELECT id, object_key, visibility, owner_user_id, content_type, byte_length
       FROM media_objects
       WHERE id = ?1`,
    )
    .bind(requireSafeId(id, "Media ID"))
    .first<MediaDeliveryRow>();

  return row ? mapDeliveryRecord(row) : null;
}

export async function upsertMediaDeliveryRecord(
  binding: D1Database,
  record: MediaDeliveryRecord,
): Promise<void> {
  if (!isVisibility(record.visibility)) {
    throw new TypeError("The media visibility is invalid.");
  }

  await binding
    .prepare(
      `INSERT INTO media_objects
        (id, object_key, kind, visibility, owner_user_id, content_type, byte_length)
       VALUES (?1, ?2, 'audio', ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET
         object_key = excluded.object_key,
         kind = excluded.kind,
         visibility = excluded.visibility,
         owner_user_id = excluded.owner_user_id,
         content_type = excluded.content_type,
         byte_length = excluded.byte_length`,
    )
    .bind(
      requireSafeId(record.id, "Media ID"),
      requirePrivateObjectKey(record.objectKey),
      record.visibility,
      record.ownerUserId === null
        ? null
        : requireSafeId(record.ownerUserId, "Media owner ID"),
      requireContentType(record.contentType),
      requireByteLength(record.byteLength),
    )
    .run();
}

export async function removeMediaDeliveryRecord(
  binding: D1Database,
  id: string,
): Promise<void> {
  await binding
    .prepare("DELETE FROM media_objects WHERE id = ?1")
    .bind(requireSafeId(id, "Media ID"))
    .run();
}
