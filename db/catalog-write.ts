import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeCatalogEditorCondition,
  activeOwnerCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
  type PreparedMutation,
} from "./mutation.ts";
import type {
  CatalogCreditInput,
  CollectionDraftInput,
  ReleaseDraftInput,
  TrackDraftInput,
} from "@/lib/catalog/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CatalogAggregateRow {
  id: string;
  slug: string;
  draft_revision_id: string;
  published_revision_id: string | null;
  publication_state: "draft" | "published" | "archived";
  version: number;
}

interface RevisionNumberRow {
  revision: number;
}

interface FrozenTrackRow {
  id: string;
  published_revision_id: string | null;
  publication_state: "draft" | "published" | "archived";
}

interface CountRow {
  count: number;
}

export interface CatalogDraftResult {
  readonly id: string;
  readonly slug: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly version: number;
  readonly created: boolean;
  readonly publishedRevisionId: string | null;
}

export interface CatalogPublishResult {
  readonly id: string;
  readonly slug: string;
  readonly publishedRevisionId: string;
  readonly version: number;
  readonly publicationState: "published";
}

export interface CatalogUnpublishResult {
  readonly id: string;
  readonly slug: string;
  readonly version: number;
  readonly publicationState: "draft";
}

type CatalogRoot = "track" | "release" | "collection";

const ROOTS = Object.freeze({
  track: {
    table: "tracks",
    revisionTable: "track_revisions",
    revisionOwnerColumn: "track_id",
    subjectType: "track",
  },
  release: {
    table: "releases",
    revisionTable: "release_revisions",
    revisionOwnerColumn: "release_id",
    subjectType: "release",
  },
  collection: {
    table: "collections",
    revisionTable: "collection_revisions",
    revisionOwnerColumn: "collection_id",
    subjectType: "collection",
  },
} as const);

function notFound(root: CatalogRoot): RuntimeError {
  return new RuntimeError(
    `${root.toUpperCase()}_NOT_FOUND`,
    `The ${root} does not exist.`,
    { status: 404, publicMessage: `That ${root} was not found.` },
  );
}

function archived(root: CatalogRoot): RuntimeError {
  return new RuntimeError(
    `${root.toUpperCase()}_ARCHIVED`,
    `An archived ${root} cannot be changed.`,
    {
      status: 409,
      publicMessage: `Restore this ${root} before changing it.`,
    },
  );
}

function publicationBlocked(root: CatalogRoot, message: string): RuntimeError {
  return new RuntimeError(
    `${root.toUpperCase()}_PUBLICATION_BLOCKED`,
    message,
    {
      status: 409,
      publicMessage: `Resolve this ${root}'s publication requirements and try again.`,
    },
  );
}

async function readAggregate(
  binding: D1Database,
  root: CatalogRoot,
  slug: string,
): Promise<CatalogAggregateRow | null> {
  return binding
    .prepare(
      `SELECT id, slug, draft_revision_id, published_revision_id,
              publication_state, version
       FROM ${ROOTS[root].table}
       WHERE slug = ?1
       LIMIT 1`,
    )
    .bind(slug)
    .first<CatalogAggregateRow>();
}

async function nextRevision(
  binding: D1Database,
  root: CatalogRoot,
  aggregateId: string,
): Promise<number> {
  const definition = ROOTS[root];
  const row = await binding
    .prepare(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS revision
       FROM ${definition.revisionTable}
       WHERE ${definition.revisionOwnerColumn} = ?1`,
    )
    .bind(aggregateId)
    .first<RevisionNumberRow>();
  return row?.revision ?? 1;
}

function draftAuthority(
  actorUserId: string,
  scopeId: string,
  creating: boolean,
): SqlAuthorityCondition {
  return activeCatalogEditorCondition(actorUserId, creating ? "*" : scopeId);
}

function trackMediaValiditySql(revisionAlias: string): string {
  return `(
    (
      ${revisionAlias}.stream_mode = 'unavailable'
      OR EXISTS (
        SELECT 1
        FROM media_derivatives AS stream_derivative
        JOIN media_objects AS stream_source
          ON stream_source.id = stream_derivative.source_media_id
        WHERE stream_derivative.id = ${revisionAlias}.streaming_derivative_id
          AND ${revisionAlias}.original_media_id IS NOT NULL
          AND stream_derivative.source_media_id = ${revisionAlias}.original_media_id
          AND stream_derivative.kind = 'streaming'
          AND stream_derivative.status = 'ready'
          AND stream_derivative.approval_state = 'approved'
          AND stream_derivative.object_key IS NOT NULL
          AND stream_derivative.content_type LIKE 'audio/%'
          AND stream_derivative.byte_length IS NOT NULL
          AND stream_derivative.content_sha256 IS NOT NULL
          AND stream_source.kind = 'audio'
          AND stream_source.status = 'ready'
          AND stream_source.approval_state = 'approved'
          AND stream_source.content_type LIKE 'audio/%'
          AND stream_source.content_sha256 IS NOT NULL
      )
    )
    AND (
      ${revisionAlias}.download_mode = 'unavailable'
      OR EXISTS (
        SELECT 1
        FROM media_derivatives AS download_derivative
        JOIN media_objects AS download_source
          ON download_source.id = download_derivative.source_media_id
        WHERE download_derivative.id = ${revisionAlias}.download_derivative_id
          AND ${revisionAlias}.original_media_id IS NOT NULL
          AND download_derivative.source_media_id = ${revisionAlias}.original_media_id
          AND download_derivative.kind = 'download'
          AND download_derivative.status = 'ready'
          AND download_derivative.approval_state = 'approved'
          AND download_derivative.object_key IS NOT NULL
          AND download_derivative.content_type LIKE 'audio/%'
          AND download_derivative.byte_length IS NOT NULL
          AND download_derivative.content_sha256 IS NOT NULL
          AND download_source.kind = 'audio'
          AND download_source.status = 'ready'
          AND download_source.approval_state = 'approved'
          AND download_source.content_type LIKE 'audio/%'
          AND download_source.content_sha256 IS NOT NULL
      )
    )
  )`;
}

function artworkValiditySql(
  revisionAlias: string,
  artworkColumn = "artwork_derivative_id",
): string {
  return `(
    ${revisionAlias}.${artworkColumn} IS NULL
    OR EXISTS (
      SELECT 1
      FROM media_derivatives AS artwork_derivative
      JOIN media_objects AS artwork_source
        ON artwork_source.id = artwork_derivative.source_media_id
      WHERE artwork_derivative.id = ${revisionAlias}.${artworkColumn}
        AND artwork_derivative.kind = 'artwork'
        AND artwork_derivative.status = 'ready'
        AND artwork_derivative.approval_state = 'approved'
        AND artwork_derivative.object_key IS NOT NULL
        AND artwork_derivative.content_type LIKE 'image/%'
        AND artwork_derivative.byte_length IS NOT NULL
        AND artwork_derivative.content_sha256 IS NOT NULL
        AND artwork_source.kind = 'image'
        AND artwork_source.status = 'ready'
        AND artwork_source.approval_state = 'approved'
        AND artwork_source.content_type LIKE 'image/%'
        AND artwork_source.content_sha256 IS NOT NULL
    )
  )`;
}

function prepareCredits(
  binding: D1Database,
  root: CatalogRoot,
  revisionId: string,
  credits: readonly CatalogCreditInput[],
  authority: SqlAuthorityCondition,
): readonly D1PreparedStatement[] {
  const definition = ROOTS[root];
  return credits.map((credit, index) =>
    binding
      .prepare(
        `INSERT INTO credits
          (id, ${root}_revision_id, name, role, details, position)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6
         WHERE EXISTS (
           SELECT 1 FROM ${definition.revisionTable}
           WHERE id = ?2
         ) AND ${authority.sql}`,
      )
      .bind(
        `credit_${root}_${crypto.randomUUID()}`,
        revisionId,
        credit.name,
        credit.role,
        credit.details,
        index + 1,
        ...authority.bindings,
      ),
  );
}

function cleanupRevision(
  binding: D1Database,
  root: CatalogRoot,
  aggregateId: string,
  revisionId: string,
  operationKey: string,
): D1PreparedStatement {
  const definition = ROOTS[root];
  return binding
    .prepare(
      `DELETE FROM ${definition.revisionTable}
       WHERE id = ?1
         AND NOT EXISTS (
           SELECT 1 FROM ${definition.table}
           WHERE id = ?2
             AND draft_revision_id = ?1
             AND last_operation_key = ?3
         )`,
    )
    .bind(revisionId, aggregateId, operationKey);
}

function cleanupFailedCreate(
  binding: D1Database,
  root: CatalogRoot,
  aggregateId: string,
  operationKey: string,
  expectedChildTable?: "release_tracks" | "collection_tracks",
  expectedChildCount = 0,
): D1PreparedStatement {
  const definition = ROOTS[root];
  const childCondition = expectedChildTable
    ? `AND (
         NOT EXISTS (
           SELECT 1 FROM ${definition.revisionTable}
           WHERE id = ${definition.table}.draft_revision_id
             AND ${definition.revisionOwnerColumn} = ${definition.table}.id
         )
         OR (
           SELECT COUNT(*) FROM ${expectedChildTable}
           WHERE ${root}_revision_id = ${definition.table}.draft_revision_id
         ) != ?3
       )`
    : `AND NOT EXISTS (
         SELECT 1 FROM ${definition.revisionTable}
         WHERE id = ${definition.table}.draft_revision_id
           AND ${definition.revisionOwnerColumn} = ${definition.table}.id
       )`;
  const bindings: (number | string)[] = [aggregateId, operationKey];
  if (expectedChildTable) bindings.push(expectedChildCount);
  return binding
    .prepare(
      `DELETE FROM ${definition.table}
       WHERE id = ?1 AND last_operation_key = ?2
       ${childCondition}`,
    )
    .bind(...bindings);
}

function auditDraft(
  binding: D1Database,
  root: CatalogRoot,
  result: CatalogDraftResult,
  mutation: {
    readonly namespacedKey: string;
    readonly fingerprint: string;
  },
  context: MutationContext,
  authority: SqlAuthorityCondition,
  details: Record<string, unknown>,
  additionalCondition = "1 = 1",
  additionalBindings: readonly (number | string)[] = [],
): D1PreparedStatement {
  const definition = ROOTS[root];
  return prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: `${root}.draft.save`,
      subjectType: definition.subjectType,
      subjectId: result.id,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details,
      result: { ...result },
    },
    `EXISTS (
      SELECT 1 FROM ${definition.table}
      WHERE id = ? AND slug = ? AND version = ? AND draft_revision_id = ?
        AND last_operation_key = ?
    ) AND ${additionalCondition} AND ${authority.sql}`,
    [
      result.id,
      result.slug,
      result.version,
      result.revisionId,
      mutation.namespacedKey,
      ...additionalBindings,
      ...authority.bindings,
    ],
  );
}

export async function saveTrackDraft(
  binding: D1Database,
  input: TrackDraftInput,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogDraftResult>> {
  const root = "track" as const;
  const operation = "track.draft.save";
  const mutation = await prepareMutation<CatalogDraftResult>(
    binding,
    operation,
    context,
    { expectedVersion, ...input },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };

  const aggregate = await readAggregate(binding, root, input.slug);
  if (!aggregate && expectedVersion !== 0) throw staleMutation("track draft");
  if (aggregate && aggregate.version !== expectedVersion) {
    throw staleMutation("track draft");
  }
  if (aggregate?.publication_state === "archived") throw archived(root);

  const created = aggregate === null;
  const trackId = aggregate?.id ?? `track_${input.slug}_${crypto.randomUUID()}`;
  const revision = created ? 1 : await nextRevision(binding, root, trackId);
  const revisionId = `track_revision_${revision}_${crypto.randomUUID()}`;
  const result: CatalogDraftResult = {
    id: trackId,
    slug: input.slug,
    revisionId,
    revision,
    version: created ? 1 : expectedVersion + 1,
    created,
    publishedRevisionId: aggregate?.published_revision_id ?? null,
  };
  const authority = draftAuthority(context.actorUserId, input.slug, created);
  const statements: D1PreparedStatement[] = [];
  let aggregateChangeIndex = -1;

  if (created) {
    aggregateChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `INSERT INTO tracks
            (id, slug, draft_revision_id, publication_state, version,
             last_operation_key)
           SELECT ?1, ?2, ?3, 'draft', 1, ?4
           WHERE NOT EXISTS (SELECT 1 FROM tracks WHERE slug = ?2)
             AND ${authority.sql}`,
        )
        .bind(
          trackId,
          input.slug,
          revisionId,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    );
  }

  statements.push(
    binding
      .prepare(
        `INSERT INTO track_revisions
          (id, track_id, revision, title, subtitle, description, duration_ms,
           meter, tempo_bpm, musical_key, isrc, copyright_notice, explicit, view_mode, stream_mode,
           download_mode, original_media_id, streaming_derivative_id,
           download_derivative_id, tags_json, created_by_user_id)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
         WHERE ${
           created
             ? `EXISTS (
                  SELECT 1 FROM tracks
                  WHERE id = ?2 AND draft_revision_id = ?1
                    AND last_operation_key = ?22
                )`
             : `EXISTS (
                  SELECT 1 FROM tracks
                  WHERE id = ?2 AND version = ?22
                    AND publication_state != 'archived'
                )`
         } AND ${authority.sql}`,
      )
      .bind(
        revisionId,
        trackId,
        revision,
        input.title,
        input.subtitle,
        input.description,
        input.durationMs,
        input.meter ?? null,
        input.tempoBpm ?? null,
        input.musicalKey ?? null,
        input.isrc,
        input.copyrightNotice,
        input.explicit ? 1 : 0,
        input.viewMode,
        input.streamMode,
        input.downloadMode,
        input.originalMediaId,
        input.streamingDerivativeId,
        input.downloadDerivativeId,
        JSON.stringify(input.tags),
        context.actorUserId,
        created ? mutation.namespacedKey : expectedVersion,
        ...authority.bindings,
      ),
    ...prepareCredits(binding, root, revisionId, input.credits, authority),
  );

  if (!created) {
    aggregateChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `UPDATE tracks
           SET draft_revision_id = ?1,
               version = version + 1,
               last_operation_key = ?2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?3 AND slug = ?4 AND version = ?5
             AND publication_state != 'archived'
             AND EXISTS (
               SELECT 1 FROM track_revisions
               WHERE id = ?1 AND track_id = ?3
             )
             AND ${authority.sql}`,
        )
        .bind(
          revisionId,
          mutation.namespacedKey,
          trackId,
          input.slug,
          expectedVersion,
          ...authority.bindings,
        ),
    );
  }

  const auditIndex = statements.length;
  statements.push(
    auditDraft(binding, root, result, mutation, context, authority, {
      revision,
      created,
      credits: input.credits.length,
    }),
    created
      ? cleanupFailedCreate(binding, root, trackId, mutation.namespacedKey)
      : cleanupRevision(
          binding,
          root,
          trackId,
          revisionId,
          mutation.namespacedKey,
        ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[aggregateChangeIndex]) !== 1) {
      throw staleMutation("track draft");
    }
    if (changedRows(results[auditIndex]) !== 1) {
      throw staleMutation("track draft receipt");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function trackPublicationBlocker(
  binding: D1Database,
  aggregate: CatalogAggregateRow,
): Promise<boolean> {
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       FROM track_revisions AS draft
       WHERE draft.id = ?1
         AND draft.track_id = ?2
         AND NOT ${trackMediaValiditySql("draft")}`,
    )
    .bind(aggregate.draft_revision_id, aggregate.id)
    .first<CountRow>();
  return (row?.count ?? 1) > 0;
}

export async function publishTrack(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogPublishResult>> {
  const root = "track" as const;
  const operation = "track.publish";
  const mutation = await prepareMutation<CatalogPublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, root, slug);
  if (!aggregate) throw notFound(root);
  if (aggregate.version !== expectedVersion)
    throw staleMutation("track publication");
  if (aggregate.publication_state === "archived") throw archived(root);
  if (await trackPublicationBlocker(binding, aggregate)) {
    throw publicationBlocked(
      root,
      "Available track delivery needs approved, ready derivatives from its approved audio source.",
    );
  }

  const result: CatalogPublishResult = {
    id: aggregate.id,
    slug,
    publishedRevisionId: aggregate.draft_revision_id,
    version: expectedVersion + 1,
    publicationState: "published",
  };
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE tracks
         SET published_revision_id = draft_revision_id,
             publication_state = 'published',
             version = version + 1,
             last_operation_key = ?1,
             published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND slug = ?3 AND version = ?4
           AND publication_state != 'archived'
           AND EXISTS (
             SELECT 1 FROM track_revisions AS draft
             WHERE draft.id = tracks.draft_revision_id
               AND draft.track_id = tracks.id
               AND ${trackMediaValiditySql("draft")}
           )
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        slug,
        expectedVersion,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: root,
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM tracks
        WHERE id = ? AND version = ? AND publication_state = 'published'
          AND published_revision_id = ? AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.version,
        result.publishedRevisionId,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("track publication");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function publishedTrackReferenceCount(
  binding: D1Database,
  trackId: string,
): Promise<number> {
  const row = await binding
    .prepare(
      `SELECT
        (SELECT COUNT(*)
         FROM releases
         JOIN release_tracks
           ON release_tracks.release_revision_id = releases.published_revision_id
         WHERE releases.publication_state = 'published'
           AND release_tracks.track_id = ?1)
        +
        (SELECT COUNT(*)
         FROM collections
         JOIN collection_tracks
           ON collection_tracks.collection_revision_id = collections.published_revision_id
         WHERE collections.publication_state = 'published'
           AND collection_tracks.track_id = ?1) AS count`,
    )
    .bind(trackId)
    .first<CountRow>();
  return row?.count ?? 0;
}

export async function unpublishTrack(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogUnpublishResult>> {
  const root = "track" as const;
  const operation = "track.unpublish";
  const mutation = await prepareMutation<CatalogUnpublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, root, slug);
  if (!aggregate) throw notFound(root);
  if (aggregate.version !== expectedVersion)
    throw staleMutation("track publication");
  if (aggregate.publication_state !== "published") {
    throw publicationBlocked(
      root,
      "Only a published track can be unpublished.",
    );
  }
  if ((await publishedTrackReferenceCount(binding, aggregate.id)) > 0) {
    throw new RuntimeError(
      "TRACK_IN_PUBLISHED_CATALOG",
      "A published release or collection still references the track.",
      {
        status: 409,
        publicMessage:
          "Unpublish the release or collection that contains this track first.",
      },
    );
  }

  const result: CatalogUnpublishResult = {
    id: aggregate.id,
    slug,
    version: expectedVersion + 1,
    publicationState: "draft",
  };
  const authority = activeOwnerCondition(context.actorUserId);
  const referenceGuard = `NOT EXISTS (
    SELECT 1 FROM releases
    JOIN release_tracks
      ON release_tracks.release_revision_id = releases.published_revision_id
    WHERE releases.publication_state = 'published'
      AND release_tracks.track_id = tracks.id
  ) AND NOT EXISTS (
    SELECT 1 FROM collections
    JOIN collection_tracks
      ON collection_tracks.collection_revision_id = collections.published_revision_id
    WHERE collections.publication_state = 'published'
      AND collection_tracks.track_id = tracks.id
  )`;
  const statements = [
    binding
      .prepare(
        `UPDATE tracks
         SET published_revision_id = NULL,
             publication_state = 'draft',
             version = version + 1,
             last_operation_key = ?1,
             published_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND slug = ?3 AND version = ?4
           AND publication_state = 'published'
           AND ${referenceGuard}
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        slug,
        expectedVersion,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: root,
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM tracks
        WHERE id = ? AND version = ? AND publication_state = 'draft'
          AND published_revision_id IS NULL AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.version,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("track publication");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function freezePublishedTracks(
  binding: D1Database,
  trackIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const frozen = new Map<string, string>();
  for (const trackId of trackIds) {
    const row = await binding
      .prepare(
        `SELECT id, published_revision_id, publication_state
         FROM tracks WHERE id = ?1 LIMIT 1`,
      )
      .bind(trackId)
      .first<FrozenTrackRow>();
    if (
      !row ||
      row.publication_state !== "published" ||
      row.published_revision_id === null
    ) {
      throw new RuntimeError(
        "TRACK_NOT_PUBLISHED",
        "A sequenced track does not have a published revision.",
        {
          status: 409,
          publicMessage: "Publish every selected track before sequencing it.",
        },
      );
    }
    frozen.set(trackId, row.published_revision_id);
  }
  return frozen;
}

function childCountCondition(
  root: "release" | "collection",
  revisionId: string,
  expectedCount: number,
): { readonly sql: string; readonly bindings: readonly (number | string)[] } {
  const table = root === "release" ? "release_tracks" : "collection_tracks";
  return {
    sql: `(SELECT COUNT(*) FROM ${table} WHERE ${root}_revision_id = ?) = ?`,
    bindings: [revisionId, expectedCount],
  };
}

export async function saveReleaseDraft(
  binding: D1Database,
  input: ReleaseDraftInput,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogDraftResult>> {
  const root = "release" as const;
  const operation = "release.draft.save";
  const mutation = await prepareMutation<CatalogDraftResult>(
    binding,
    operation,
    context,
    { expectedVersion, ...input },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, root, input.slug);
  if (!aggregate && expectedVersion !== 0) throw staleMutation("release draft");
  if (aggregate && aggregate.version !== expectedVersion) {
    throw staleMutation("release draft");
  }
  if (aggregate?.publication_state === "archived") throw archived(root);
  const frozenTracks = await freezePublishedTracks(
    binding,
    input.tracks.map(({ trackId }) => trackId),
  );
  const created = aggregate === null;
  const releaseId =
    aggregate?.id ?? `release_${input.slug}_${crypto.randomUUID()}`;
  const revision = created ? 1 : await nextRevision(binding, root, releaseId);
  const revisionId = `release_revision_${revision}_${crypto.randomUUID()}`;
  const result: CatalogDraftResult = {
    id: releaseId,
    slug: input.slug,
    revisionId,
    revision,
    version: created ? 1 : expectedVersion + 1,
    created,
    publishedRevisionId: aggregate?.published_revision_id ?? null,
  };
  const authority = draftAuthority(context.actorUserId, input.slug, created);
  const statements: D1PreparedStatement[] = [];
  let aggregateChangeIndex = -1;
  if (created) {
    aggregateChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `INSERT INTO releases
            (id, slug, draft_revision_id, publication_state, version,
             last_operation_key)
           SELECT ?1, ?2, ?3, 'draft', 1, ?4
           WHERE NOT EXISTS (SELECT 1 FROM releases WHERE slug = ?2)
             AND ${authority.sql}`,
        )
        .bind(
          releaseId,
          input.slug,
          revisionId,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    );
  }
  statements.push(
    binding
      .prepare(
        `INSERT INTO release_revisions
          (id, release_id, revision, release_type, title, subtitle,
           description, release_date, catalog_number, copyright_notice,
           view_mode, artwork_derivative_id, tags_json, created_by_user_id)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14
         WHERE ${
           created
             ? `EXISTS (
                  SELECT 1 FROM releases
                  WHERE id = ?2 AND draft_revision_id = ?1
                    AND last_operation_key = ?15
                )`
             : `EXISTS (
                  SELECT 1 FROM releases
                  WHERE id = ?2 AND version = ?15
                    AND publication_state != 'archived'
                )`
         } AND ${authority.sql}`,
      )
      .bind(
        revisionId,
        releaseId,
        revision,
        input.releaseType,
        input.title,
        input.subtitle,
        input.description,
        input.releaseDate,
        input.catalogNumber,
        input.copyrightNotice,
        input.viewMode,
        input.artworkDerivativeId,
        JSON.stringify(input.tags),
        context.actorUserId,
        created ? mutation.namespacedKey : expectedVersion,
        ...authority.bindings,
      ),
  );
  input.tracks.forEach((track, index) => {
    const frozenRevisionId = frozenTracks.get(track.trackId)!;
    statements.push(
      binding
        .prepare(
          `INSERT INTO release_tracks
            (id, release_revision_id, track_id, track_revision_id, position,
             disc_number, track_number)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
           WHERE EXISTS (
             SELECT 1 FROM release_revisions
             WHERE id = ?2 AND release_id = ?8
           ) AND EXISTS (
             SELECT 1 FROM tracks
             WHERE id = ?3 AND publication_state = 'published'
               AND published_revision_id = ?4
           ) AND ${authority.sql}`,
        )
        .bind(
          `release_track_${crypto.randomUUID()}`,
          revisionId,
          track.trackId,
          frozenRevisionId,
          index + 1,
          track.discNumber,
          track.trackNumber,
          releaseId,
          ...authority.bindings,
        ),
    );
  });
  statements.push(
    ...prepareCredits(binding, root, revisionId, input.credits, authority),
  );
  const childCondition = childCountCondition(
    root,
    revisionId,
    input.tracks.length,
  );
  if (!created) {
    aggregateChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `UPDATE releases
           SET draft_revision_id = ?1, version = version + 1,
               last_operation_key = ?2, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?3 AND slug = ?4 AND version = ?5
             AND publication_state != 'archived'
             AND EXISTS (
               SELECT 1 FROM release_revisions
               WHERE id = ?1 AND release_id = ?3
             )
             AND ${childCondition.sql}
             AND ${authority.sql}`,
        )
        .bind(
          revisionId,
          mutation.namespacedKey,
          releaseId,
          input.slug,
          expectedVersion,
          ...childCondition.bindings,
          ...authority.bindings,
        ),
    );
  }
  const auditIndex = statements.length;
  statements.push(
    auditDraft(
      binding,
      root,
      result,
      mutation,
      context,
      authority,
      {
        revision,
        created,
        tracks: input.tracks.length,
        credits: input.credits.length,
      },
      childCondition.sql,
      childCondition.bindings,
    ),
    created
      ? cleanupFailedCreate(
          binding,
          root,
          releaseId,
          mutation.namespacedKey,
          "release_tracks",
          input.tracks.length,
        )
      : cleanupRevision(
          binding,
          root,
          releaseId,
          revisionId,
          mutation.namespacedKey,
        ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[aggregateChangeIndex]) !== 1) {
      throw staleMutation("release draft");
    }
    if (changedRows(results[auditIndex]) !== 1) {
      throw staleMutation("release draft receipt");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

function releasePublicationValiditySql(): string {
  return `EXISTS (
    SELECT 1 FROM release_tracks
    WHERE release_tracks.release_revision_id = releases.draft_revision_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM release_tracks
    LEFT JOIN tracks AS child_track
      ON child_track.id = release_tracks.track_id
    LEFT JOIN track_revisions AS child_revision
      ON child_revision.id = release_tracks.track_revision_id
     AND child_revision.track_id = release_tracks.track_id
    WHERE release_tracks.release_revision_id = releases.draft_revision_id
      AND (
        child_track.id IS NULL
        OR child_track.publication_state != 'published'
        OR child_revision.id IS NULL
        OR NOT ${trackMediaValiditySql("child_revision")}
        OR (
          EXISTS (
            SELECT 1 FROM release_revisions AS draft_release
            WHERE draft_release.id = releases.draft_revision_id
              AND draft_release.view_mode = 'public'
          )
          AND child_revision.view_mode != 'public'
        )
      )
  )
  AND EXISTS (
    SELECT 1 FROM release_revisions AS draft_release
    WHERE draft_release.id = releases.draft_revision_id
      AND draft_release.release_id = releases.id
      AND ${artworkValiditySql("draft_release")}
  )`;
}

async function releasePublicationBlocked(
  binding: D1Database,
  aggregate: CatalogAggregateRow,
): Promise<boolean> {
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count FROM releases
       WHERE id = ?1 AND NOT (${releasePublicationValiditySql()})`,
    )
    .bind(aggregate.id)
    .first<CountRow>();
  return (row?.count ?? 1) > 0;
}

export async function publishRelease(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogPublishResult>> {
  const root = "release" as const;
  const operation = "release.publish";
  const mutation = await prepareMutation<CatalogPublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, root, slug);
  if (!aggregate) throw notFound(root);
  if (aggregate.version !== expectedVersion)
    throw staleMutation("release publication");
  if (aggregate.publication_state === "archived") throw archived(root);
  if (await releasePublicationBlocked(binding, aggregate)) {
    throw publicationBlocked(
      root,
      "A release needs one or more published tracks, valid availability, and approved artwork when selected.",
    );
  }
  return publishParent(
    binding,
    root,
    aggregate,
    expectedVersion,
    context,
    mutation,
    releasePublicationValiditySql(),
  );
}

async function publishParent(
  binding: D1Database,
  root: "release" | "collection",
  aggregate: CatalogAggregateRow,
  expectedVersion: number,
  context: MutationContext,
  mutation: PreparedMutation<CatalogPublishResult>,
  validitySql: string,
): Promise<MutationResult<CatalogPublishResult>> {
  const definition = ROOTS[root];
  const operation = `${root}.publish`;
  const result: CatalogPublishResult = {
    id: aggregate.id,
    slug: aggregate.slug,
    publishedRevisionId: aggregate.draft_revision_id,
    version: expectedVersion + 1,
    publicationState: "published",
  };
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE ${definition.table}
         SET published_revision_id = draft_revision_id,
             publication_state = 'published', version = version + 1,
             last_operation_key = ?1, published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND slug = ?3 AND version = ?4
           AND publication_state != 'archived'
           AND ${validitySql}
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        aggregate.slug,
        expectedVersion,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: root,
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM ${definition.table}
        WHERE id = ? AND version = ? AND publication_state = 'published'
          AND published_revision_id = ? AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.version,
        result.publishedRevisionId,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation(`${root} publication`);
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function unpublishRelease(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogUnpublishResult>> {
  return unpublishParent(binding, "release", slug, expectedVersion, context);
}

async function unpublishParent(
  binding: D1Database,
  root: "release" | "collection",
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogUnpublishResult>> {
  const operation = `${root}.unpublish`;
  const mutation = await prepareMutation<CatalogUnpublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, root, slug);
  if (!aggregate) throw notFound(root);
  if (aggregate.version !== expectedVersion)
    throw staleMutation(`${root} publication`);
  if (aggregate.publication_state !== "published") {
    throw publicationBlocked(
      root,
      `Only a published ${root} can be unpublished.`,
    );
  }
  const result: CatalogUnpublishResult = {
    id: aggregate.id,
    slug,
    version: expectedVersion + 1,
    publicationState: "draft",
  };
  const definition = ROOTS[root];
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE ${definition.table}
         SET published_revision_id = NULL, publication_state = 'draft',
             version = version + 1, last_operation_key = ?1,
             published_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND slug = ?3 AND version = ?4
           AND publication_state = 'published'
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        slug,
        expectedVersion,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: root,
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM ${definition.table}
        WHERE id = ? AND version = ? AND publication_state = 'draft'
          AND published_revision_id IS NULL AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.version,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation(`${root} publication`);
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function saveCollectionDraft(
  binding: D1Database,
  input: CollectionDraftInput,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogDraftResult>> {
  const root = "collection" as const;
  const operation = "collection.draft.save";
  const mutation = await prepareMutation<CatalogDraftResult>(
    binding,
    operation,
    context,
    { expectedVersion, ...input },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, root, input.slug);
  if (!aggregate && expectedVersion !== 0)
    throw staleMutation("collection draft");
  if (aggregate && aggregate.version !== expectedVersion) {
    throw staleMutation("collection draft");
  }
  if (aggregate?.publication_state === "archived") throw archived(root);
  const frozenTracks = await freezePublishedTracks(binding, input.trackIds);
  const created = aggregate === null;
  const collectionId =
    aggregate?.id ?? `collection_${input.slug}_${crypto.randomUUID()}`;
  const revision = created
    ? 1
    : await nextRevision(binding, root, collectionId);
  const revisionId = `collection_revision_${revision}_${crypto.randomUUID()}`;
  const result: CatalogDraftResult = {
    id: collectionId,
    slug: input.slug,
    revisionId,
    revision,
    version: created ? 1 : expectedVersion + 1,
    created,
    publishedRevisionId: aggregate?.published_revision_id ?? null,
  };
  const authority = draftAuthority(context.actorUserId, input.slug, created);
  const statements: D1PreparedStatement[] = [];
  let aggregateChangeIndex = -1;
  if (created) {
    aggregateChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `INSERT INTO collections
            (id, slug, draft_revision_id, publication_state, version,
             last_operation_key)
           SELECT ?1, ?2, ?3, 'draft', 1, ?4
           WHERE NOT EXISTS (SELECT 1 FROM collections WHERE slug = ?2)
             AND ${authority.sql}`,
        )
        .bind(
          collectionId,
          input.slug,
          revisionId,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    );
  }
  statements.push(
    binding
      .prepare(
        `INSERT INTO collection_revisions
          (id, collection_id, revision, title, description, view_mode,
           artwork_derivative_id, tags_json, created_by_user_id)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
         WHERE ${
           created
             ? `EXISTS (
                  SELECT 1 FROM collections
                  WHERE id = ?2 AND draft_revision_id = ?1
                    AND last_operation_key = ?10
                )`
             : `EXISTS (
                  SELECT 1 FROM collections
                  WHERE id = ?2 AND version = ?10
                    AND publication_state != 'archived'
                )`
         } AND ${authority.sql}`,
      )
      .bind(
        revisionId,
        collectionId,
        revision,
        input.title,
        input.description,
        input.viewMode,
        input.artworkDerivativeId,
        JSON.stringify(input.tags),
        context.actorUserId,
        created ? mutation.namespacedKey : expectedVersion,
        ...authority.bindings,
      ),
  );
  input.trackIds.forEach((trackId, index) => {
    const frozenRevisionId = frozenTracks.get(trackId)!;
    statements.push(
      binding
        .prepare(
          `INSERT INTO collection_tracks
            (id, collection_revision_id, track_id, track_revision_id, position)
           SELECT ?1, ?2, ?3, ?4, ?5
           WHERE EXISTS (
             SELECT 1 FROM collection_revisions
             WHERE id = ?2 AND collection_id = ?6
           ) AND EXISTS (
             SELECT 1 FROM tracks
             WHERE id = ?3 AND publication_state = 'published'
               AND published_revision_id = ?4
           ) AND ${authority.sql}`,
        )
        .bind(
          `collection_track_${crypto.randomUUID()}`,
          revisionId,
          trackId,
          frozenRevisionId,
          index + 1,
          collectionId,
          ...authority.bindings,
        ),
    );
  });
  statements.push(
    ...prepareCredits(binding, root, revisionId, input.credits, authority),
  );
  const childCondition = childCountCondition(
    root,
    revisionId,
    input.trackIds.length,
  );
  if (!created) {
    aggregateChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `UPDATE collections
           SET draft_revision_id = ?1, version = version + 1,
               last_operation_key = ?2, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?3 AND slug = ?4 AND version = ?5
             AND publication_state != 'archived'
             AND EXISTS (
               SELECT 1 FROM collection_revisions
               WHERE id = ?1 AND collection_id = ?3
             )
             AND ${childCondition.sql}
             AND ${authority.sql}`,
        )
        .bind(
          revisionId,
          mutation.namespacedKey,
          collectionId,
          input.slug,
          expectedVersion,
          ...childCondition.bindings,
          ...authority.bindings,
        ),
    );
  }
  const auditIndex = statements.length;
  statements.push(
    auditDraft(
      binding,
      root,
      result,
      mutation,
      context,
      authority,
      {
        revision,
        created,
        tracks: input.trackIds.length,
        credits: input.credits.length,
      },
      childCondition.sql,
      childCondition.bindings,
    ),
    created
      ? cleanupFailedCreate(
          binding,
          root,
          collectionId,
          mutation.namespacedKey,
          "collection_tracks",
          input.trackIds.length,
        )
      : cleanupRevision(
          binding,
          root,
          collectionId,
          revisionId,
          mutation.namespacedKey,
        ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[aggregateChangeIndex]) !== 1) {
      throw staleMutation("collection draft");
    }
    if (changedRows(results[auditIndex]) !== 1) {
      throw staleMutation("collection draft receipt");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

function collectionPublicationValiditySql(): string {
  return `EXISTS (
    SELECT 1 FROM collection_tracks
    WHERE collection_tracks.collection_revision_id = collections.draft_revision_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM collection_tracks
    LEFT JOIN tracks AS child_track
      ON child_track.id = collection_tracks.track_id
    LEFT JOIN track_revisions AS child_revision
      ON child_revision.id = collection_tracks.track_revision_id
     AND child_revision.track_id = collection_tracks.track_id
    WHERE collection_tracks.collection_revision_id = collections.draft_revision_id
      AND (
        child_track.id IS NULL
        OR child_track.publication_state != 'published'
        OR child_revision.id IS NULL
        OR NOT ${trackMediaValiditySql("child_revision")}
        OR (
          EXISTS (
            SELECT 1 FROM collection_revisions AS draft_collection
            WHERE draft_collection.id = collections.draft_revision_id
              AND draft_collection.view_mode = 'public'
          )
          AND child_revision.view_mode != 'public'
        )
      )
  )
  AND EXISTS (
    SELECT 1 FROM collection_revisions AS draft_collection
    WHERE draft_collection.id = collections.draft_revision_id
      AND draft_collection.collection_id = collections.id
      AND ${artworkValiditySql("draft_collection")}
  )`;
}

async function collectionPublicationBlocked(
  binding: D1Database,
  aggregate: CatalogAggregateRow,
): Promise<boolean> {
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count FROM collections
       WHERE id = ?1 AND NOT (${collectionPublicationValiditySql()})`,
    )
    .bind(aggregate.id)
    .first<CountRow>();
  return (row?.count ?? 1) > 0;
}

export async function publishCollection(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogPublishResult>> {
  const root = "collection" as const;
  const operation = "collection.publish";
  const mutation = await prepareMutation<CatalogPublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, root, slug);
  if (!aggregate) throw notFound(root);
  if (aggregate.version !== expectedVersion)
    throw staleMutation("collection publication");
  if (aggregate.publication_state === "archived") throw archived(root);
  if (await collectionPublicationBlocked(binding, aggregate)) {
    throw publicationBlocked(
      root,
      "A collection needs one or more published tracks, valid availability, and approved artwork when selected.",
    );
  }
  return publishParent(
    binding,
    root,
    aggregate,
    expectedVersion,
    context,
    mutation,
    collectionPublicationValiditySql(),
  );
}

export async function unpublishCollection(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CatalogUnpublishResult>> {
  return unpublishParent(binding, "collection", slug, expectedVersion, context);
}

export const CATALOG_PUBLICATION_SQL = Object.freeze({
  trackMediaValidity: trackMediaValiditySql("track_revision"),
  releaseValidity: releasePublicationValiditySql(),
  collectionValidity: collectionPublicationValiditySql(),
});
