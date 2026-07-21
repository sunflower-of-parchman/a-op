import { activeOwnerCondition } from "./authority-guards.ts";
import type {
  ApprovedMediaReference,
  SetupProposal,
  TrackAvailabilityProposal,
} from "@/lib/setup/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

type SetupMediaTopic =
  | "catalog-releases"
  | "streaming-downloads"
  | "courses-video"
  | "editorial-presentation";

interface SetupMediaSourceRow {
  readonly id: string;
  readonly kind: "audio" | "image" | "video" | "document" | "other";
  readonly visibility: "public" | "protected";
  readonly content_type: string;
  readonly duration_ms: number | null;
}

interface SetupMediaDerivativeRow {
  readonly id: string;
  readonly source_media_id: string;
  readonly kind:
    | "streaming"
    | "download"
    | "waveform"
    | "artwork"
    | "poster"
    | "thumbnail"
    | "transcript"
    | "document"
    | "other";
  readonly content_type: string;
  readonly duration_ms: number | null;
}

interface SetupMediaBundle {
  readonly source: SetupMediaSourceRow;
  readonly derivatives: readonly SetupMediaDerivativeRow[];
}

export interface SetupTrackMediaBinding {
  readonly originalMediaId: string;
  readonly durationMs: number;
  readonly streamingDerivativeId: string | null;
  readonly downloadDerivativeId: string | null;
}

export type SetupCourseMediaItemType = "image" | "audio" | "video" | "download";

export interface SetupCourseMediaItemBinding {
  readonly mediaKey: string;
  readonly itemType: SetupCourseMediaItemType;
  readonly derivativeId: string;
}

export interface SetupVideoMediaBinding {
  readonly hostedDerivativeId: string;
  readonly posterDerivativeId: string | null;
  readonly captionsDerivativeId: string | null;
}

export interface SetupPageHeroMediaBinding {
  readonly derivativeId: string;
}

export interface SetupArtworkMediaBinding {
  readonly derivativeId: string;
}

export async function resolveSetupArtworkMedia(
  binding: D1Database,
  reference: ApprovedMediaReference,
  actorUserId: string,
): Promise<SetupArtworkMediaBinding> {
  const bundle = await resolveSetupMediaBundle(
    binding,
    reference,
    actorUserId,
    "catalog-releases",
  );
  if (
    bundle.source.kind !== "image" ||
    !bundle.source.content_type.startsWith("image/")
  ) {
    throw setupMediaError(
      "SETUP_MEDIA_INCOMPATIBLE",
      "catalog-releases",
      reference.mediaKey,
      "Catalog artwork must be an approved image source.",
    );
  }
  const derivative = exactDerivative(
    bundle,
    reference,
    "catalog-releases",
    "catalog artwork",
    (row) => row.kind === "artwork" && row.content_type.startsWith("image/"),
    true,
  )!;
  return Object.freeze({ derivativeId: derivative.id });
}

function setupMediaError(
  code:
    | "SETUP_MEDIA_MISSING"
    | "SETUP_MEDIA_AMBIGUOUS"
    | "SETUP_MEDIA_INCOMPATIBLE",
  topic: SetupMediaTopic,
  mediaKey: string,
  detail: string,
): RuntimeError {
  return new RuntimeError(code, `${topic}: ${mediaKey}: ${detail}`, {
    status: 409,
    publicMessage:
      code === "SETUP_MEDIA_MISSING"
        ? `Approved, ready media for ${mediaKey} is missing.`
        : code === "SETUP_MEDIA_AMBIGUOUS"
          ? `More than one approved media record matches ${mediaKey}.`
          : `Approved media for ${mediaKey} is not compatible with its requested use.`,
  });
}

function expectedSourceKind(
  reference: ApprovedMediaReference,
): SetupMediaSourceRow["kind"] {
  return reference.kind === "artwork" ? "image" : reference.kind;
}

function sourceContentMatches(
  kind: SetupMediaSourceRow["kind"],
  contentType: string,
): boolean {
  if (kind === "audio" || kind === "image" || kind === "video") {
    return contentType.startsWith(`${kind}/`);
  }
  return contentType.length > 0;
}

async function resolveSetupMediaBundle(
  binding: D1Database,
  reference: ApprovedMediaReference,
  actorUserId: string,
  topic: SetupMediaTopic,
): Promise<SetupMediaBundle> {
  const authority = activeOwnerCondition(actorUserId);
  const sourceResult = await binding
    .prepare(
      `SELECT DISTINCT source.id, source.kind, source.visibility,
              source.content_type, source.duration_ms
       FROM audit_events AS publication_audit
       JOIN media_objects AS source
         ON source.id = publication_audit.subject_id
       WHERE publication_audit.action = 'media.publication.source'
         AND publication_audit.subject_type = 'media-source'
         AND publication_audit.actor_user_id = ?1
         AND json_valid(publication_audit.details_json)
         AND json_type(publication_audit.details_json) = 'object'
         AND json_extract(publication_audit.details_json, '$.mediaKey') = ?2
         AND json_extract(publication_audit.details_json, '$.mediaSha256') = source.content_sha256
         AND json_extract(publication_audit.details_json, '$.visibility') = source.visibility
         AND json_valid(publication_audit.result_json)
         AND json_type(publication_audit.result_json) = 'object'
         AND json_extract(publication_audit.result_json, '$.mediaId') = source.id
         AND json_extract(publication_audit.result_json, '$.role') = 'source'
         AND json_extract(publication_audit.result_json, '$.status') = 'ready'
         AND json_extract(publication_audit.result_json, '$.approvalState') = 'approved'
         AND json_extract(publication_audit.result_json, '$.revision') = source.revision
         AND json_extract(publication_audit.result_json, '$.mediaSha256') = source.content_sha256
         AND source.owner_user_id = ?1
         AND source.approved_by_user_id = ?1
         AND source.approved_at IS NOT NULL
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_sha256 IS NOT NULL
         AND source.byte_length > 0
         AND source.visibility = ?3
         AND ${authority.sql}
       ORDER BY source.id`,
    )
    .bind(
      actorUserId,
      reference.mediaKey,
      reference.intendedUse,
      ...authority.bindings,
    )
    .all<SetupMediaSourceRow>();
  if (!sourceResult.success || sourceResult.results.length === 0) {
    throw setupMediaError(
      "SETUP_MEDIA_MISSING",
      topic,
      reference.mediaKey,
      "No owner-authored source publication receipt matches a current approved, ready source.",
    );
  }
  if (sourceResult.results.length !== 1) {
    throw setupMediaError(
      "SETUP_MEDIA_AMBIGUOUS",
      topic,
      reference.mediaKey,
      "Multiple current source records carry this logical media key.",
    );
  }
  const source = sourceResult.results[0]!;
  const kind = expectedSourceKind(reference);
  if (
    reference.rights !== "confirmed" ||
    source.kind !== kind ||
    !sourceContentMatches(kind, source.content_type)
  ) {
    throw setupMediaError(
      "SETUP_MEDIA_INCOMPATIBLE",
      topic,
      reference.mediaKey,
      "The approved source kind, content facts, or rights state does not match the proposal.",
    );
  }

  const derivativeResult = await binding
    .prepare(
      `SELECT DISTINCT derivative.id, derivative.source_media_id,
              derivative.kind, derivative.content_type, derivative.duration_ms
       FROM audit_events AS publication_audit
       JOIN media_derivatives AS derivative
         ON derivative.id = publication_audit.subject_id
       JOIN media_objects AS source
         ON source.id = derivative.source_media_id
       WHERE publication_audit.action = 'media.publication.derivative'
         AND publication_audit.subject_type = 'media-derivative'
         AND publication_audit.actor_user_id = ?1
         AND json_valid(publication_audit.details_json)
         AND json_type(publication_audit.details_json) = 'object'
         AND json_extract(publication_audit.details_json, '$.mediaKey') = ?2
         AND json_extract(publication_audit.details_json, '$.mediaSha256') = derivative.content_sha256
         AND json_extract(publication_audit.details_json, '$.visibility') = source.visibility
         AND json_valid(publication_audit.result_json)
         AND json_type(publication_audit.result_json) = 'object'
         AND json_extract(publication_audit.result_json, '$.mediaId') = derivative.id
         AND json_extract(publication_audit.result_json, '$.role') = 'derivative'
         AND json_extract(publication_audit.result_json, '$.status') = 'ready'
         AND json_extract(publication_audit.result_json, '$.approvalState') = 'approved'
         AND json_extract(publication_audit.result_json, '$.revision') = derivative.revision
         AND json_extract(publication_audit.result_json, '$.mediaSha256') = derivative.content_sha256
         AND derivative.source_media_id = ?3
         AND derivative.approved_by_user_id = ?1
         AND derivative.approved_at IS NOT NULL
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.content_type IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND derivative.byte_length > 0
         AND source.owner_user_id = ?1
         AND source.approved_by_user_id = ?1
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND ${authority.sql}
       ORDER BY derivative.kind, derivative.id`,
    )
    .bind(actorUserId, reference.mediaKey, source.id, ...authority.bindings)
    .all<SetupMediaDerivativeRow>();
  if (!derivativeResult.success) {
    throw setupMediaError(
      "SETUP_MEDIA_MISSING",
      topic,
      reference.mediaKey,
      "Approved derivative publication receipts could not be read.",
    );
  }
  return Object.freeze({
    source: Object.freeze(source),
    derivatives: Object.freeze(
      derivativeResult.results.map((row) => Object.freeze(row)),
    ),
  });
}

function exactDerivative(
  bundle: SetupMediaBundle,
  reference: ApprovedMediaReference,
  topic: SetupMediaTopic,
  label: string,
  predicate: (row: SetupMediaDerivativeRow) => boolean,
  required: boolean,
): SetupMediaDerivativeRow | null {
  const candidates = bundle.derivatives.filter(predicate);
  if (candidates.length > 1) {
    throw setupMediaError(
      "SETUP_MEDIA_AMBIGUOUS",
      topic,
      reference.mediaKey,
      `Multiple compatible ${label} derivatives are ready.`,
    );
  }
  if (candidates.length === 0) {
    if (!required) return null;
    throw setupMediaError(
      "SETUP_MEDIA_MISSING",
      topic,
      reference.mediaKey,
      `The required ${label} derivative is not ready.`,
    );
  }
  return candidates[0]!;
}

function durationMatches(
  derivative: SetupMediaDerivativeRow,
  source: SetupMediaSourceRow,
): boolean {
  return (
    source.duration_ms !== null &&
    source.duration_ms > 0 &&
    derivative.duration_ms !== null &&
    Math.abs(derivative.duration_ms - source.duration_ms) <= 50
  );
}

export async function resolveSetupTrackMedia(
  binding: D1Database,
  reference: ApprovedMediaReference,
  availability: TrackAvailabilityProposal,
  actorUserId: string,
): Promise<SetupTrackMediaBinding> {
  const topic = "streaming-downloads" as const;
  const bundle = await resolveSetupMediaBundle(
    binding,
    reference,
    actorUserId,
    topic,
  );
  if (
    bundle.source.kind !== "audio" ||
    !bundle.source.content_type.startsWith("audio/") ||
    bundle.source.duration_ms === null ||
    bundle.source.duration_ms <= 0
  ) {
    throw setupMediaError(
      "SETUP_MEDIA_INCOMPATIBLE",
      topic,
      reference.mediaKey,
      "Track media must be approved audio with a positive inspected duration.",
    );
  }
  const streaming =
    availability.streaming === "disabled"
      ? null
      : exactDerivative(
          bundle,
          reference,
          topic,
          "streaming audio",
          (row) =>
            row.kind === "streaming" && row.content_type.startsWith("audio/"),
          true,
        );
  const download =
    availability.download === "disabled"
      ? null
      : exactDerivative(
          bundle,
          reference,
          topic,
          "download audio",
          (row) =>
            row.kind === "download" && row.content_type.startsWith("audio/"),
          true,
        );
  if (
    (availability.streaming !== "disabled" &&
      streaming !== null &&
      !durationMatches(streaming, bundle.source)) ||
    (availability.download !== "disabled" &&
      download !== null &&
      !durationMatches(download, bundle.source))
  ) {
    throw setupMediaError(
      "SETUP_MEDIA_INCOMPATIBLE",
      topic,
      reference.mediaKey,
      "Track derivatives must carry the exact inspected source duration.",
    );
  }
  return Object.freeze({
    originalMediaId: bundle.source.id,
    durationMs: bundle.source.duration_ms,
    streamingDerivativeId: streaming?.id ?? null,
    downloadDerivativeId: download?.id ?? null,
  });
}

function courseItemType(
  derivative: SetupMediaDerivativeRow,
): SetupCourseMediaItemType | null {
  if (
    ["artwork", "poster", "thumbnail"].includes(derivative.kind) &&
    derivative.content_type.startsWith("image/")
  ) {
    return "image";
  }
  if (derivative.kind === "streaming") {
    if (derivative.content_type.startsWith("audio/")) return "audio";
    if (derivative.content_type.startsWith("video/")) return "video";
    return null;
  }
  if (derivative.kind === "download" || derivative.kind === "document") {
    return "download";
  }
  if (derivative.kind === "other") {
    if (derivative.content_type.startsWith("image/")) return "image";
    if (derivative.content_type.startsWith("audio/")) return "audio";
    if (derivative.content_type.startsWith("video/")) return "video";
    return "download";
  }
  return null;
}

export async function resolveSetupCourseMediaItems(
  binding: D1Database,
  references: readonly ApprovedMediaReference[],
  actorUserId: string,
): Promise<readonly SetupCourseMediaItemBinding[]> {
  const result: SetupCourseMediaItemBinding[] = [];
  for (const reference of references) {
    const bundle = await resolveSetupMediaBundle(
      binding,
      reference,
      actorUserId,
      "courses-video",
    );
    const byType = new Map<
      SetupCourseMediaItemType,
      SetupMediaDerivativeRow[]
    >();
    for (const derivative of bundle.derivatives) {
      const itemType = courseItemType(derivative);
      if (!itemType) continue;
      if (
        (itemType === "audio" || itemType === "video") &&
        bundle.source.duration_ms !== null &&
        derivative.duration_ms !== bundle.source.duration_ms
      ) {
        continue;
      }
      const candidates = byType.get(itemType) ?? [];
      candidates.push(derivative);
      byType.set(itemType, candidates);
    }
    if (byType.size === 0) {
      throw setupMediaError(
        "SETUP_MEDIA_INCOMPATIBLE",
        "courses-video",
        reference.mediaKey,
        "No ready derivative has compatible lesson content facts.",
      );
    }
    for (const itemType of ["image", "audio", "video", "download"] as const) {
      const candidates = byType.get(itemType) ?? [];
      if (candidates.length > 1) {
        throw setupMediaError(
          "SETUP_MEDIA_AMBIGUOUS",
          "courses-video",
          reference.mediaKey,
          `Multiple compatible ${itemType} lesson derivatives are ready.`,
        );
      }
      if (candidates.length === 1) {
        result.push(
          Object.freeze({
            mediaKey: reference.mediaKey,
            itemType,
            derivativeId: candidates[0]!.id,
          }),
        );
      }
    }
  }
  return Object.freeze(result);
}

export async function resolveSetupVideoMedia(
  binding: D1Database,
  reference: ApprovedMediaReference,
  actorUserId: string,
): Promise<SetupVideoMediaBinding> {
  const topic = "courses-video" as const;
  const bundle = await resolveSetupMediaBundle(
    binding,
    reference,
    actorUserId,
    topic,
  );
  if (
    bundle.source.kind !== "video" ||
    !bundle.source.content_type.startsWith("video/") ||
    bundle.source.duration_ms === null ||
    bundle.source.duration_ms <= 0
  ) {
    throw setupMediaError(
      "SETUP_MEDIA_INCOMPATIBLE",
      topic,
      reference.mediaKey,
      "Artist-hosted video needs an approved video source with a positive inspected duration.",
    );
  }
  const hosted = exactDerivative(
    bundle,
    reference,
    topic,
    "artist-hosted video",
    (row) => row.kind === "streaming" && row.content_type.startsWith("video/"),
    true,
  )!;
  if (!durationMatches(hosted, bundle.source)) {
    throw setupMediaError(
      "SETUP_MEDIA_INCOMPATIBLE",
      topic,
      reference.mediaKey,
      "Artist-hosted video must carry the exact inspected source duration.",
    );
  }
  const poster = exactDerivative(
    bundle,
    reference,
    topic,
    "poster",
    (row) => row.kind === "poster" && row.content_type.startsWith("image/"),
    false,
  );
  const captions = exactDerivative(
    bundle,
    reference,
    topic,
    "captions",
    (row) =>
      row.kind === "transcript" &&
      (row.content_type === "text/vtt" ||
        row.content_type === "application/x-subrip"),
    false,
  );
  return Object.freeze({
    hostedDerivativeId: hosted.id,
    posterDerivativeId: poster?.id ?? null,
    captionsDerivativeId: captions?.id ?? null,
  });
}

export async function resolveSetupPageHeroMedia(
  binding: D1Database,
  reference: ApprovedMediaReference,
  actorUserId: string,
): Promise<SetupPageHeroMediaBinding> {
  const topic = "editorial-presentation" as const;
  const bundle = await resolveSetupMediaBundle(
    binding,
    reference,
    actorUserId,
    topic,
  );
  if (
    bundle.source.kind !== "image" ||
    !bundle.source.content_type.startsWith("image/")
  ) {
    throw setupMediaError(
      "SETUP_MEDIA_INCOMPATIBLE",
      topic,
      reference.mediaKey,
      "Page hero media must be an approved image source.",
    );
  }
  const derivative = exactDerivative(
    bundle,
    reference,
    topic,
    "page hero",
    (row) =>
      ["artwork", "poster", "thumbnail", "other"].includes(row.kind) &&
      row.content_type.startsWith("image/"),
    true,
  )!;
  return Object.freeze({ derivativeId: derivative.id });
}

/**
 * Resolves every media pointer in an exact proposal before setup begins any
 * product-topic mutation. Individual writers resolve again immediately before
 * their own mutations so a changed D1 record still fails closed.
 */
export async function assertSetupMediaBindings(
  binding: D1Database,
  proposal: SetupProposal,
  actorUserId: string,
): Promise<void> {
  const mediaByKey = new Map(
    proposal.topics.rightsMedia.media.map((media) => [media.mediaKey, media]),
  );
  const catalogByKey = new Map(
    proposal.topics.catalogReleases.tracks.map((track) => [
      track.trackKey,
      track,
    ]),
  );
  for (const parent of [
    ...proposal.topics.catalogReleases.releases,
    ...proposal.topics.catalogReleases.collections,
  ]) {
    if (parent.artworkMediaKey === null) continue;
    const reference = mediaByKey.get(parent.artworkMediaKey);
    if (!reference) {
      throw setupMediaError(
        "SETUP_MEDIA_MISSING",
        "catalog-releases",
        parent.artworkMediaKey,
        "The exact artwork declaration is missing.",
      );
    }
    await resolveSetupArtworkMedia(binding, reference, actorUserId);
  }
  for (const availability of proposal.topics.streamingDownloads.tracks) {
    const mediaKey = catalogByKey.get(availability.trackKey)?.mediaKey ?? null;
    if (mediaKey === null) continue;
    const reference = mediaByKey.get(mediaKey);
    if (!reference) {
      throw setupMediaError(
        "SETUP_MEDIA_MISSING",
        "streaming-downloads",
        mediaKey,
        "The exact rights and media declaration is missing.",
      );
    }
    await resolveSetupTrackMedia(binding, reference, availability, actorUserId);
  }
  for (const course of proposal.topics.coursesVideo.courses) {
    for (const lesson of course.lessons) {
      const references = lesson.mediaKeys.map((mediaKey) => {
        const reference = mediaByKey.get(mediaKey);
        if (!reference) {
          throw setupMediaError(
            "SETUP_MEDIA_MISSING",
            "courses-video",
            mediaKey,
            "The exact rights and media declaration is missing.",
          );
        }
        return reference;
      });
      await resolveSetupCourseMediaItems(binding, references, actorUserId);
    }
  }
  for (const video of proposal.topics.coursesVideo.videos) {
    if (video.mediaKey === null) continue;
    const reference = mediaByKey.get(video.mediaKey);
    if (!reference) {
      throw setupMediaError(
        "SETUP_MEDIA_MISSING",
        "courses-video",
        video.mediaKey,
        "The exact rights and media declaration is missing.",
      );
    }
    await resolveSetupVideoMedia(binding, reference, actorUserId);
  }
  for (const hero of proposal.topics.editorialPresentation.pageHeroes) {
    const reference = mediaByKey.get(hero.mediaKey);
    if (!reference) {
      throw setupMediaError(
        "SETUP_MEDIA_MISSING",
        "editorial-presentation",
        hero.mediaKey,
        "The exact rights and media declaration is missing.",
      );
    }
    await resolveSetupPageHeroMedia(binding, reference, actorUserId);
  }
}
