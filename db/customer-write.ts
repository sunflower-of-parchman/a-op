import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { runAtomicBatch } from "./d1.ts";
import { prepareServerTelemetryEvent } from "./telemetry-server.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type {
  FavoriteDesiredStateInput,
  FavoriteMutationResult,
  FavoriteTargetType,
  ListeningCheckpointInput,
  ListeningCheckpointResult,
  PlaylistArchiveInput,
  PlaylistCreateInput,
  PlaylistMutationResult,
  PlaylistReplacementInput,
} from "@/lib/customer-library/types.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface PlaylistRow {
  name: string;
  description: string;
  state: "active" | "archived";
  revision: number;
}

interface HistoryRow {
  meaningful_listen_count: number;
  revision: number;
}

interface PublishedTrackRow {
  revision_id: string;
}

interface CountRow {
  count: number;
}

const CUSTOMER_LIBRARY_AUTHORITY_SQL = `EXISTS (
  SELECT 1
  FROM users AS customer_user
  JOIN role_assignments AS customer_role
    ON customer_role.user_id = customer_user.id
   AND customer_role.role_key = 'customer'
   AND customer_role.revoked_at IS NULL
  WHERE customer_user.id = ?
    AND customer_user.status = 'active'
) AND EXISTS (
  SELECT 1 FROM artist_modules AS customer_module
  WHERE customer_module.module_key = 'customer-library'
    AND customer_module.active = 1
)`;

function authorityBindings(actorUserId: string): readonly string[] {
  return [actorUserId];
}

function resourceCondition(
  targetType: FavoriteTargetType,
  requirePublished: boolean,
): string {
  const root = targetType === "track" ? "tracks" : "releases";
  const revisions =
    targetType === "track" ? "track_revisions" : "release_revisions";
  const owner = targetType === "track" ? "track_id" : "release_id";
  return `EXISTS (
    SELECT 1 FROM ${root} AS favorite_resource
    ${
      requirePublished
        ? `JOIN ${revisions} AS favorite_revision
             ON favorite_revision.id = favorite_resource.published_revision_id
            AND favorite_revision.${owner} = favorite_resource.id`
        : ""
    }
    WHERE favorite_resource.id = ?
      ${requirePublished ? "AND favorite_resource.publication_state = 'published'" : ""}
  )`;
}

async function requireFavoriteResource(
  binding: D1Database,
  input: FavoriteDesiredStateInput,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       WHERE ${resourceCondition(input.targetType, input.active)}`,
    )
    .bind(input.targetId)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "CUSTOMER_RESOURCE_UNAVAILABLE",
    "The favorite target is not an available published resource.",
    {
      status: 409,
      publicMessage: "That music is not currently available to save.",
    },
  );
}

function favoriteLookupSql(targetType: FavoriteTargetType): string {
  return targetType === "track"
    ? "track_id = ? AND release_id IS NULL"
    : "release_id = ? AND track_id IS NULL";
}

export async function setCustomerFavorite(
  binding: D1Database,
  input: FavoriteDesiredStateInput,
  context: MutationContext,
): Promise<MutationResult<FavoriteMutationResult>> {
  await requireActiveModule(binding, "customer-library");
  const operation = "favorite.set";
  const mutation = await prepareMutation<FavoriteMutationResult>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  await requireFavoriteResource(binding, input);

  const result: FavoriteMutationResult = {
    targetType: input.targetType,
    targetId: input.targetId,
    active: input.active,
    revision: input.expectedRevision === null ? 1 : input.expectedRevision + 1,
  };
  const state = input.active ? "active" : "removed";
  const targetColumns =
    input.targetType === "track"
      ? [input.targetId, null]
      : [null, input.targetId];
  const lookup = favoriteLookupSql(input.targetType);
  const authority = authorityBindings(context.actorUserId);
  const stateStatement =
    input.expectedRevision === null
      ? binding
          .prepare(
            `INSERT INTO favorites
              (id, user_id, target_type, track_id, release_id, state, revision,
               last_operation_key)
             SELECT ?, ?, ?, ?, ?, ?, 1, ?
             WHERE ${CUSTOMER_LIBRARY_AUTHORITY_SQL}
               AND ${resourceCondition(input.targetType, input.active)}
               AND NOT EXISTS (
                 SELECT 1 FROM favorites
                 WHERE user_id = ? AND ${lookup}
               )`,
          )
          .bind(
            `favorite_${crypto.randomUUID()}`,
            context.actorUserId,
            input.targetType,
            ...targetColumns,
            state,
            mutation.namespacedKey,
            ...authority,
            input.targetId,
            context.actorUserId,
            input.targetId,
          )
      : binding
          .prepare(
            `UPDATE favorites
             SET state = ?, revision = revision + 1,
                 last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND ${lookup} AND revision = ?
               AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}
               AND ${resourceCondition(input.targetType, input.active)}`,
          )
          .bind(
            state,
            mutation.namespacedKey,
            context.actorUserId,
            input.targetId,
            input.expectedRevision,
            ...authority,
            input.targetId,
          );

  const receipt = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "favorite",
      subjectId: input.targetId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: { targetType: input.targetType },
      result: { ...result },
    },
    `EXISTS (
      SELECT 1 FROM favorites
      WHERE user_id = ? AND ${lookup} AND state = ? AND revision = ?
        AND last_operation_key = ?
    ) AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
    [
      context.actorUserId,
      input.targetId,
      state,
      result.revision,
      mutation.namespacedKey,
      ...authority,
    ],
  );

  const statements = [stateStatement, receipt];
  if (input.active) {
    statements.push(
      await prepareServerTelemetryEvent(binding, {
        eventName: "favorite-saved",
        resourceType: input.targetType,
        resourceId: input.targetId,
        sourceOperationKey: mutation.namespacedKey,
        userId: context.actorUserId,
        requestContext: context.telemetry,
        durableCondition: {
          sql: `EXISTS (
            SELECT 1 FROM favorites
            WHERE user_id = ? AND ${lookup} AND state = 'active'
              AND revision = ? AND last_operation_key = ?
          )`,
          bindings: [
            context.actorUserId,
            input.targetId,
            result.revision,
            mutation.namespacedKey,
          ],
        },
      }),
    );
  }

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("favorite");
    if (changedRows(results[1]) !== 1) throw staleMutation("favorite receipt");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

function uniqueTrackIds(trackIds: readonly string[]): void {
  if (new Set(trackIds).size !== trackIds.length) {
    throw new RuntimeError(
      "PLAYLIST_TRACKS_DUPLICATE",
      "Playlist tracks must be unique.",
      {
        status: 400,
        publicMessage: "Each track can appear once in a playlist.",
      },
    );
  }
}

function allTracksPublishedCondition(trackIds: readonly string[]): {
  readonly sql: string;
  readonly bindings: readonly (number | string)[];
} {
  if (trackIds.length === 0) return { sql: "1 = 1", bindings: [] };
  const placeholders = trackIds.map(() => "?").join(", ");
  return {
    sql: `(SELECT COUNT(*)
           FROM tracks AS selected_track
           JOIN track_revisions AS selected_revision
             ON selected_revision.id = selected_track.published_revision_id
            AND selected_revision.track_id = selected_track.id
           WHERE selected_track.id IN (${placeholders})
             AND selected_track.publication_state = 'published') = ?`,
    bindings: [...trackIds, trackIds.length],
  };
}

async function requirePublishedTracks(
  binding: D1Database,
  trackIds: readonly string[],
): Promise<void> {
  uniqueTrackIds(trackIds);
  const condition = allTracksPublishedCondition(trackIds);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${condition.sql}`)
    .bind(...condition.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "PLAYLIST_TRACK_UNAVAILABLE",
    "Every playlist track must have a published revision.",
    {
      status: 409,
      publicMessage: "One or more selected tracks are unavailable.",
    },
  );
}

function playlistTrackStatements(
  binding: D1Database,
  playlistId: string,
  trackIds: readonly string[],
  marker: string,
  actorUserId: string,
): readonly D1PreparedStatement[] {
  return trackIds.map((trackId, index) =>
    binding
      .prepare(
        `INSERT INTO playlist_tracks (id, playlist_id, track_id, position)
         SELECT ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM playlists
           WHERE id = ? AND user_id = ? AND state = 'active'
             AND last_operation_key = ?
         )
           AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}
           AND ${resourceCondition("track", true)}`,
      )
      .bind(
        `playlist_track_${crypto.randomUUID()}`,
        playlistId,
        trackId,
        index + 1,
        playlistId,
        actorUserId,
        marker,
        ...authorityBindings(actorUserId),
        trackId,
      ),
  );
}

function exactPlaylistTracksCondition(trackIds: readonly string[]): {
  readonly sql: string;
  readonly bindings: readonly (number | string)[];
} {
  const clauses = trackIds.map(
    () => `EXISTS (
      SELECT 1 FROM playlist_tracks
      WHERE playlist_id = ? AND track_id = ? AND position = ?
    )`,
  );
  return {
    sql: `(
      SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?
    ) = ?${clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : ""}`,
    bindings: [
      "__PLAYLIST_ID__",
      trackIds.length,
      ...trackIds.flatMap((trackId, index) => [
        "__PLAYLIST_ID__",
        trackId,
        index + 1,
      ]),
    ],
  };
}

function bindPlaylistId(
  bindings: readonly (number | string)[],
  playlistId: string,
): readonly (number | string)[] {
  return bindings.map((value) =>
    value === "__PLAYLIST_ID__" ? playlistId : value,
  );
}

async function preparePlaylistTelemetry(
  binding: D1Database,
  playlistId: string,
  state: "active" | "archived",
  revision: number,
  operationKey: string,
  context: MutationContext,
): Promise<D1PreparedStatement> {
  return prepareServerTelemetryEvent(binding, {
    eventName: "playlist-updated",
    resourceType: "playlist",
    resourceId: playlistId,
    sourceOperationKey: operationKey,
    userId: context.actorUserId,
    requestContext: context.telemetry,
    durableCondition: {
      sql: `EXISTS (
        SELECT 1 FROM playlists
        WHERE id = ? AND user_id = ? AND state = ? AND revision = ?
          AND last_operation_key = ?
      )`,
      bindings: [
        playlistId,
        context.actorUserId,
        state,
        revision,
        operationKey,
      ],
    },
  });
}

export async function createCustomerPlaylist(
  binding: D1Database,
  input: PlaylistCreateInput,
  context: MutationContext,
): Promise<MutationResult<PlaylistMutationResult>> {
  await requireActiveModule(binding, "customer-library");
  const operation = "playlist.create";
  const mutation = await prepareMutation<PlaylistMutationResult>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  await requirePublishedTracks(binding, input.trackIds);

  const playlistId = `playlist_${crypto.randomUUID()}`;
  const result: PlaylistMutationResult = {
    id: playlistId,
    name: input.name,
    description: input.description,
    state: "active",
    revision: 1,
    trackIds: Object.freeze([...input.trackIds]),
  };
  const published = allTracksPublishedCondition(input.trackIds);
  const exactTracks = exactPlaylistTracksCondition(input.trackIds);
  const authority = authorityBindings(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO playlists
          (id, user_id, name, description, state, revision, last_operation_key)
         SELECT ?, ?, ?, ?, 'active', 1, ?
         WHERE ${CUSTOMER_LIBRARY_AUTHORITY_SQL}
           AND ${published.sql}`,
      )
      .bind(
        playlistId,
        context.actorUserId,
        input.name,
        input.description,
        mutation.namespacedKey,
        ...authority,
        ...published.bindings,
      ),
    ...playlistTrackStatements(
      binding,
      playlistId,
      input.trackIds,
      mutation.namespacedKey,
      context.actorUserId,
    ),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "playlist",
        subjectId: playlistId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { trackCount: input.trackIds.length },
        result: { ...result, trackIds: [...result.trackIds] },
      },
      `EXISTS (
        SELECT 1 FROM playlists
        WHERE id = ? AND user_id = ? AND state = 'active' AND revision = 1
          AND name = ? AND description = ? AND last_operation_key = ?
      ) AND ${exactTracks.sql}
        AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
      [
        playlistId,
        context.actorUserId,
        input.name,
        input.description,
        mutation.namespacedKey,
        ...bindPlaylistId(exactTracks.bindings, playlistId),
        ...authority,
      ],
    ),
    binding
      .prepare(
        `DELETE FROM playlists
         WHERE id = ? AND user_id = ? AND last_operation_key = ?
           AND NOT EXISTS (
             SELECT 1 FROM audit_events WHERE idempotency_key = ?
           )
           AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
      )
      .bind(
        playlistId,
        context.actorUserId,
        mutation.namespacedKey,
        mutation.namespacedKey,
        ...authority,
      ),
  );
  statements.push(
    await preparePlaylistTelemetry(
      binding,
      playlistId,
      result.state,
      result.revision,
      mutation.namespacedKey,
      context,
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("playlist");
    for (let index = 0; index < input.trackIds.length; index += 1) {
      if (changedRows(results[index + 1]) !== 1)
        throw staleMutation("playlist tracks");
    }
    if (changedRows(results[auditIndex]) !== 1)
      throw staleMutation("playlist receipt");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function readOwnedPlaylist(
  binding: D1Database,
  playlistId: string,
  userId: string,
): Promise<PlaylistRow | null> {
  return binding
    .prepare(
      `SELECT name, description, state, revision
       FROM playlists WHERE id = ?1 AND user_id = ?2 LIMIT 1`,
    )
    .bind(playlistId, userId)
    .first<PlaylistRow>();
}

export async function replaceCustomerPlaylist(
  binding: D1Database,
  playlistId: string,
  input: PlaylistReplacementInput,
  context: MutationContext,
): Promise<MutationResult<PlaylistMutationResult>> {
  await requireActiveModule(binding, "customer-library");
  const operation = "playlist.replace";
  const mutation = await prepareMutation<PlaylistMutationResult>(
    binding,
    operation,
    context,
    { playlistId, ...input },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const existing = await readOwnedPlaylist(
    binding,
    playlistId,
    context.actorUserId,
  );
  if (
    !existing ||
    existing.state !== "active" ||
    existing.revision !== input.expectedRevision
  ) {
    throw staleMutation("playlist");
  }
  await requirePublishedTracks(binding, input.trackIds);

  const result: PlaylistMutationResult = {
    id: playlistId,
    name: input.name,
    description: input.description,
    state: "active",
    revision: input.expectedRevision + 1,
    trackIds: Object.freeze([...input.trackIds]),
  };
  const authority = authorityBindings(context.actorUserId);
  const published = allTracksPublishedCondition(input.trackIds);
  const exactTracks = exactPlaylistTracksCondition(input.trackIds);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE playlists
         SET name = ?, description = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND state = 'active' AND revision = ?
           AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}
           AND ${published.sql}`,
      )
      .bind(
        input.name,
        input.description,
        mutation.namespacedKey,
        playlistId,
        context.actorUserId,
        input.expectedRevision,
        ...authority,
        ...published.bindings,
      ),
    binding
      .prepare(
        `DELETE FROM playlist_tracks
         WHERE playlist_id = ?
           AND EXISTS (
             SELECT 1 FROM playlists
             WHERE id = ? AND user_id = ? AND state = 'active'
               AND revision = ? AND last_operation_key = ?
           )
           AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
      )
      .bind(
        playlistId,
        playlistId,
        context.actorUserId,
        result.revision,
        mutation.namespacedKey,
        ...authority,
      ),
    ...playlistTrackStatements(
      binding,
      playlistId,
      input.trackIds,
      mutation.namespacedKey,
      context.actorUserId,
    ),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "playlist",
        subjectId: playlistId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { trackCount: input.trackIds.length },
        result: { ...result, trackIds: [...result.trackIds] },
      },
      `EXISTS (
        SELECT 1 FROM playlists
        WHERE id = ? AND user_id = ? AND state = 'active' AND revision = ?
          AND name = ? AND description = ? AND last_operation_key = ?
      ) AND ${exactTracks.sql}
        AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
      [
        playlistId,
        context.actorUserId,
        result.revision,
        input.name,
        input.description,
        mutation.namespacedKey,
        ...bindPlaylistId(exactTracks.bindings, playlistId),
        ...authority,
      ],
    ),
  );
  statements.push(
    await preparePlaylistTelemetry(
      binding,
      playlistId,
      result.state,
      result.revision,
      mutation.namespacedKey,
      context,
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("playlist");
    for (let index = 0; index < input.trackIds.length; index += 1) {
      if (changedRows(results[index + 2]) !== 1)
        throw staleMutation("playlist tracks");
    }
    if (changedRows(results[auditIndex]) !== 1)
      throw staleMutation("playlist receipt");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function archiveCustomerPlaylist(
  binding: D1Database,
  playlistId: string,
  input: PlaylistArchiveInput,
  context: MutationContext,
): Promise<MutationResult<PlaylistMutationResult>> {
  await requireActiveModule(binding, "customer-library");
  const operation = "playlist.archive";
  const mutation = await prepareMutation<PlaylistMutationResult>(
    binding,
    operation,
    context,
    { playlistId, ...input },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const existing = await readOwnedPlaylist(
    binding,
    playlistId,
    context.actorUserId,
  );
  if (
    !existing ||
    existing.state !== "active" ||
    existing.revision !== input.expectedRevision
  ) {
    throw staleMutation("playlist");
  }
  const tracks = await binding
    .prepare(
      `SELECT track_id FROM playlist_tracks
       WHERE playlist_id = ?1 ORDER BY position`,
    )
    .bind(playlistId)
    .all<{ track_id: string }>();
  const result: PlaylistMutationResult = {
    id: playlistId,
    name: existing.name,
    description: existing.description,
    state: "archived",
    revision: input.expectedRevision + 1,
    trackIds: Object.freeze(tracks.results.map(({ track_id }) => track_id)),
  };
  const authority = authorityBindings(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE playlists
         SET state = 'archived', revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND state = 'active' AND revision = ?
           AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
      )
      .bind(
        mutation.namespacedKey,
        playlistId,
        context.actorUserId,
        input.expectedRevision,
        ...authority,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "playlist",
        subjectId: playlistId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result, trackIds: [...result.trackIds] },
      },
      `EXISTS (
        SELECT 1 FROM playlists
        WHERE id = ? AND user_id = ? AND state = 'archived' AND revision = ?
          AND last_operation_key = ?
      ) AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
      [
        playlistId,
        context.actorUserId,
        result.revision,
        mutation.namespacedKey,
        ...authority,
      ],
    ),
  ];
  statements.push(
    await preparePlaylistTelemetry(
      binding,
      playlistId,
      result.state,
      result.revision,
      mutation.namespacedKey,
      context,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("playlist");
    if (changedRows(results[1]) !== 1) throw staleMutation("playlist receipt");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function currentPublishedTrackRevision(
  binding: D1Database,
  trackId: string,
): Promise<string> {
  const row = await binding
    .prepare(
      `SELECT published.id AS revision_id
       FROM tracks
       JOIN track_revisions AS published
         ON published.id = tracks.published_revision_id
        AND published.track_id = tracks.id
       WHERE tracks.id = ?1 AND tracks.publication_state = 'published'
       LIMIT 1`,
    )
    .bind(trackId)
    .first<PublishedTrackRow>();
  if (row) return row.revision_id;
  throw new RuntimeError(
    "LISTENING_TRACK_UNAVAILABLE",
    "A listening checkpoint requires a published track revision.",
    { status: 409, publicMessage: "That track is not currently available." },
  );
}

export async function checkpointListeningHistory(
  binding: D1Database,
  input: ListeningCheckpointInput,
  context: MutationContext,
): Promise<MutationResult<ListeningCheckpointResult>> {
  await requireActiveModule(binding, "customer-library");
  const operation = "listening.checkpoint";
  const mutation = await prepareMutation<ListeningCheckpointResult>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const trackRevisionId = await currentPublishedTrackRevision(
    binding,
    input.trackId,
  );
  const existing = await binding
    .prepare(
      `SELECT meaningful_listen_count, revision
       FROM listening_history
       WHERE user_id = ?1 AND track_id = ?2 LIMIT 1`,
    )
    .bind(context.actorUserId, input.trackId)
    .first<HistoryRow>();
  if (
    (input.expectedRevision === null && existing !== null) ||
    (input.expectedRevision !== null &&
      (!existing || existing.revision !== input.expectedRevision))
  ) {
    throw staleMutation("listening history");
  }
  const result: ListeningCheckpointResult = {
    trackId: input.trackId,
    trackRevisionId,
    positionMs: input.positionMs,
    meaningfulListenCount:
      (existing?.meaningful_listen_count ?? 0) + (input.meaningful ? 1 : 0),
    revision: input.expectedRevision === null ? 1 : input.expectedRevision + 1,
  };
  const authority = authorityBindings(context.actorUserId);
  const stateStatement =
    input.expectedRevision === null
      ? binding
          .prepare(
            `INSERT INTO listening_history
              (id, user_id, track_id, track_revision_id, position_ms,
               meaningful_listen_count, revision, last_operation_key)
             SELECT ?, ?, tracks.id, published.id, ?, ?, 1, ?
             FROM tracks
             JOIN track_revisions AS published
               ON published.id = tracks.published_revision_id
              AND published.track_id = tracks.id
             WHERE tracks.id = ? AND tracks.publication_state = 'published'
               AND published.id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM listening_history
                 WHERE user_id = ? AND track_id = ?
               )
               AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
          )
          .bind(
            `history_${crypto.randomUUID()}`,
            context.actorUserId,
            input.positionMs,
            input.meaningful ? 1 : 0,
            mutation.namespacedKey,
            input.trackId,
            trackRevisionId,
            context.actorUserId,
            input.trackId,
            ...authority,
          )
      : binding
          .prepare(
            `UPDATE listening_history
             SET track_revision_id = ?, position_ms = ?,
                 meaningful_listen_count = meaningful_listen_count + ?,
                 revision = revision + 1, last_operation_key = ?,
                 last_listened_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND track_id = ? AND revision = ?
               AND EXISTS (
                 SELECT 1 FROM tracks
                 JOIN track_revisions AS published
                   ON published.id = tracks.published_revision_id
                  AND published.track_id = tracks.id
                 WHERE tracks.id = listening_history.track_id
                   AND tracks.publication_state = 'published'
                   AND published.id = ?
               )
               AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
          )
          .bind(
            trackRevisionId,
            input.positionMs,
            input.meaningful ? 1 : 0,
            mutation.namespacedKey,
            context.actorUserId,
            input.trackId,
            input.expectedRevision,
            trackRevisionId,
            ...authority,
          );
  const receipt = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "listening_history",
      subjectId: input.trackId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: { meaningful: input.meaningful },
      result: { ...result },
    },
    `EXISTS (
      SELECT 1 FROM listening_history
      WHERE user_id = ? AND track_id = ? AND track_revision_id = ?
        AND position_ms = ? AND meaningful_listen_count = ? AND revision = ?
        AND last_operation_key = ?
    ) AND ${CUSTOMER_LIBRARY_AUTHORITY_SQL}`,
    [
      context.actorUserId,
      input.trackId,
      trackRevisionId,
      result.positionMs,
      result.meaningfulListenCount,
      result.revision,
      mutation.namespacedKey,
      ...authority,
    ],
  );
  try {
    const results = await runAtomicBatch(binding, [stateStatement, receipt]);
    if (changedRows(results[0]) !== 1) throw staleMutation("listening history");
    if (changedRows(results[1]) !== 1) {
      throw staleMutation("listening history receipt");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
