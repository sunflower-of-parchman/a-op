import { requireActiveModule } from "@/lib/modules/active-module.ts";
import type {
  CustomerFavoriteDTO,
  CustomerFavoriteStateDTO,
  CustomerLibraryDTO,
  CustomerLibraryResourceDTO,
  CustomerPlaylistDTO,
  CustomerPlaylistTrackDTO,
  CustomerTrackDTO,
  FrozenListenedRevisionDTO,
  ListeningHistoryDTO,
  ResumePositionDTO,
} from "@/lib/customer-library/types.ts";

export class CustomerReadIntegrityError extends Error {
  override readonly name = "CustomerReadIntegrityError";
}

interface FavoriteRow {
  id: unknown;
  target_type: unknown;
  target_id: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
  track_slug: unknown;
  track_title: unknown;
  track_subtitle: unknown;
  track_duration_ms: unknown;
  track_available: unknown;
  track_revision_id: unknown;
  track_stream_ready: unknown;
  release_slug: unknown;
  release_title: unknown;
  release_subtitle: unknown;
  release_available: unknown;
}

interface FavoriteStateRow {
  state: unknown;
  revision: unknown;
}

interface PlaylistRow {
  id: unknown;
  name: unknown;
  description: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface PlaylistTrackRow {
  id: unknown;
  position: unknown;
  track_id: unknown;
  slug: unknown;
  title: unknown;
  subtitle: unknown;
  duration_ms: unknown;
  available: unknown;
  revision_id: unknown;
  stream_ready: unknown;
}

interface HistoryRow extends PlaylistTrackRow {
  history_id: unknown;
  track_revision_id: unknown;
  listened_title: unknown;
  listened_subtitle: unknown;
  listened_duration_ms: unknown;
  position_ms: unknown;
  meaningful_listen_count: unknown;
  history_revision: unknown;
  first_listened_at: unknown;
  last_listened_at: unknown;
}

interface ResumeRow {
  track_id: unknown;
  position_ms: unknown;
  revision: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

const ACTIVE_CUSTOMER_SQL = `EXISTS (
  SELECT 1
  FROM users AS customer_user
  JOIN role_assignments AS customer_role
    ON customer_role.user_id = customer_user.id
   AND customer_role.role_key = 'customer'
   AND customer_role.revoked_at IS NULL
  WHERE customer_user.id = ?
    AND customer_user.status = 'active'
)`;

const STREAM_READY_SQL = `CASE WHEN
  current_revision.stream_mode != 'unavailable'
  AND current_revision.original_media_id IS NOT NULL
  AND current_revision.streaming_derivative_id IS NOT NULL
  AND streaming_derivative.id = current_revision.streaming_derivative_id
  AND streaming_derivative.source_media_id = current_revision.original_media_id
  AND streaming_derivative.kind = 'streaming'
  AND streaming_derivative.status = 'ready'
  AND streaming_derivative.approval_state = 'approved'
  AND streaming_derivative.object_key IS NOT NULL
  AND streaming_derivative.content_type LIKE 'audio/%'
  AND streaming_derivative.byte_length IS NOT NULL
  AND streaming_derivative.content_sha256 IS NOT NULL
  AND source_media.kind = 'audio'
  AND source_media.status = 'ready'
  AND source_media.approval_state = 'approved'
  AND source_media.content_type LIKE 'audio/%'
  AND source_media.content_sha256 IS NOT NULL
THEN 1 ELSE 0 END`;

function integrity(message: string): never {
  throw new CustomerReadIntegrityError(message);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function nonBlank(value: unknown, label: string): string {
  const result = string(value, label);
  if (result.length === 0 || result.trim() !== result) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return result;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : string(value, label);
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (value !== 0 && value !== 1) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value === 1;
}

function timestamp(value: unknown, label: string): string {
  const result = nonBlank(value, label);
  if (!Number.isFinite(Date.parse(result))) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return result;
}

function requireUserId(userId: string): string {
  if (!SAFE_ID.test(userId))
    throw new TypeError("A safe customer ID is required.");
  return userId;
}

function unavailableTrack(trackId: string): CustomerTrackDTO {
  return Object.freeze({
    kind: "track",
    id: trackId,
    available: false,
    slug: null,
    title: null,
    subtitle: null,
    durationMs: null,
    href: null,
    streamUrl: null,
  });
}

function trackFromRow(row: PlaylistTrackRow): CustomerTrackDTO {
  const trackId = id(row.track_id, "track ID");
  if (!bool(row.available, "track availability"))
    return unavailableTrack(trackId);
  const slug = nonBlank(row.slug, "track slug");
  const revisionId = id(row.revision_id, "track revision ID");
  return Object.freeze({
    kind: "track",
    id: trackId,
    available: true,
    slug,
    title: nonBlank(row.title, "track title"),
    subtitle: nullableString(row.subtitle, "track subtitle"),
    durationMs: nullableInteger(row.duration_ms, "track duration"),
    href: `/music/tracks/${slug}`,
    streamUrl: bool(row.stream_ready, "track stream readiness")
      ? `/api/media/tracks/${encodeURIComponent(trackId)}/stream?revision=${encodeURIComponent(revisionId)}`
      : null,
  });
}

function favorite(row: FavoriteRow): CustomerFavoriteDTO {
  if (row.target_type !== "track" && row.target_type !== "release") {
    return integrity("D1 returned an invalid favorite target type.");
  }
  const targetId = id(row.target_id, "favorite target ID");
  let resource: CustomerLibraryResourceDTO;
  if (row.target_type === "track") {
    resource = trackFromRow({
      id: row.id,
      position: 1,
      track_id: targetId,
      slug: row.track_slug,
      title: row.track_title,
      subtitle: row.track_subtitle,
      duration_ms: row.track_duration_ms,
      available: row.track_available,
      revision_id: row.track_revision_id,
      stream_ready: row.track_stream_ready,
    });
  } else {
    const available = bool(row.release_available, "release availability");
    const slug = available ? nonBlank(row.release_slug, "release slug") : null;
    resource = Object.freeze({
      kind: "release",
      id: targetId,
      available,
      slug,
      title: available ? nonBlank(row.release_title, "release title") : null,
      subtitle: available
        ? nullableString(row.release_subtitle, "release subtitle")
        : null,
      durationMs: null,
      href: slug ? `/music/releases/${slug}` : null,
      streamUrl: null,
    });
  }
  return Object.freeze({
    id: id(row.id, "favorite ID"),
    targetType: row.target_type,
    targetId,
    active: true,
    revision: integer(row.revision, "favorite revision", 1),
    resource,
    createdAt: timestamp(row.created_at, "favorite creation timestamp"),
    updatedAt: timestamp(row.updated_at, "favorite update timestamp"),
  });
}

async function ensureCustomerLibrary(binding: D1Database): Promise<void> {
  await requireActiveModule(binding, "customer-library");
}

export async function readCustomerFavorites(
  binding: D1Database,
  userId: string,
): Promise<readonly CustomerFavoriteDTO[]> {
  await ensureCustomerLibrary(binding);
  const customerId = requireUserId(userId);
  const result = await binding
    .prepare(
      `SELECT favorites.id, favorites.target_type,
              COALESCE(favorites.track_id, favorites.release_id) AS target_id,
              favorites.revision, favorites.created_at, favorites.updated_at,
              tracks.slug AS track_slug, current_revision.title AS track_title,
              current_revision.subtitle AS track_subtitle,
              current_revision.duration_ms AS track_duration_ms,
              CASE WHEN tracks.publication_state = 'published'
                     AND current_revision.id IS NOT NULL THEN 1 ELSE 0 END
                AS track_available,
              current_revision.id AS track_revision_id,
              ${STREAM_READY_SQL} AS track_stream_ready,
              releases.slug AS release_slug,
              release_revision.title AS release_title,
              release_revision.subtitle AS release_subtitle,
              CASE WHEN releases.publication_state = 'published'
                     AND release_revision.id IS NOT NULL THEN 1 ELSE 0 END
                AS release_available
       FROM favorites
       LEFT JOIN tracks ON tracks.id = favorites.track_id
       LEFT JOIN track_revisions AS current_revision
         ON current_revision.id = tracks.published_revision_id
        AND current_revision.track_id = tracks.id
       LEFT JOIN media_derivatives AS streaming_derivative
         ON streaming_derivative.id = current_revision.streaming_derivative_id
       LEFT JOIN media_objects AS source_media
         ON source_media.id = streaming_derivative.source_media_id
       LEFT JOIN releases ON releases.id = favorites.release_id
       LEFT JOIN release_revisions AS release_revision
         ON release_revision.id = releases.published_revision_id
        AND release_revision.release_id = releases.id
       WHERE favorites.user_id = ?1 AND favorites.state = 'active'
         AND ${ACTIVE_CUSTOMER_SQL}
       ORDER BY favorites.updated_at DESC, favorites.id`,
    )
    .bind(customerId, customerId)
    .all<FavoriteRow>();
  return Object.freeze(result.results.map(favorite));
}

export async function readCustomerFavoriteState(
  binding: D1Database,
  userId: string,
  targetType: "track" | "release",
  targetId: string,
): Promise<CustomerFavoriteStateDTO | null> {
  await ensureCustomerLibrary(binding);
  const customerId = requireUserId(userId);
  const requestedTargetId = id(targetId, "favorite target ID");
  if (targetType !== "track" && targetType !== "release") {
    throw new TypeError("A supported favorite target type is required.");
  }
  const targetCondition =
    targetType === "track"
      ? "track_id = ?3 AND release_id IS NULL"
      : "release_id = ?3 AND track_id IS NULL";
  const row = await binding
    .prepare(
      `SELECT state, revision
       FROM favorites
       WHERE user_id = ?1 AND target_type = ?2 AND ${targetCondition}
         AND ${ACTIVE_CUSTOMER_SQL}
       LIMIT 1`,
    )
    .bind(customerId, targetType, requestedTargetId, customerId)
    .first<FavoriteStateRow>();
  if (!row) return null;
  if (row.state !== "active" && row.state !== "removed") {
    return integrity("D1 returned an invalid favorite state.");
  }
  return Object.freeze({
    targetType,
    targetId: requestedTargetId,
    active: row.state === "active",
    revision: integer(row.revision, "favorite revision", 1),
  });
}

async function readPlaylistTracks(
  binding: D1Database,
  userId: string,
  playlistId: string,
): Promise<readonly CustomerPlaylistTrackDTO[]> {
  const result = await binding
    .prepare(
      `SELECT playlist_tracks.id, playlist_tracks.position,
              tracks.id AS track_id, tracks.slug,
              current_revision.title, current_revision.subtitle,
              current_revision.duration_ms,
              CASE WHEN tracks.publication_state = 'published'
                     AND current_revision.id IS NOT NULL THEN 1 ELSE 0 END AS available,
              current_revision.id AS revision_id,
              ${STREAM_READY_SQL} AS stream_ready
       FROM playlist_tracks
       JOIN playlists ON playlists.id = playlist_tracks.playlist_id
       JOIN tracks ON tracks.id = playlist_tracks.track_id
       LEFT JOIN track_revisions AS current_revision
         ON current_revision.id = tracks.published_revision_id
        AND current_revision.track_id = tracks.id
       LEFT JOIN media_derivatives AS streaming_derivative
         ON streaming_derivative.id = current_revision.streaming_derivative_id
       LEFT JOIN media_objects AS source_media
         ON source_media.id = streaming_derivative.source_media_id
       WHERE playlist_tracks.playlist_id = ?1
         AND playlists.user_id = ?2 AND playlists.state = 'active'
         AND ${ACTIVE_CUSTOMER_SQL}
       ORDER BY playlist_tracks.position`,
    )
    .bind(playlistId, userId, userId)
    .all<PlaylistTrackRow>();
  return Object.freeze(
    result.results.map((row) =>
      Object.freeze({
        id: id(row.id, "playlist track ID"),
        position: integer(row.position, "playlist track position", 1),
        track: trackFromRow(row),
      }),
    ),
  );
}

function playlistBase(
  row: PlaylistRow,
  tracks: readonly CustomerPlaylistTrackDTO[],
): CustomerPlaylistDTO {
  return Object.freeze({
    id: id(row.id, "playlist ID"),
    name: nonBlank(row.name, "playlist name"),
    description: string(row.description, "playlist description"),
    state: "active",
    revision: integer(row.revision, "playlist revision", 1),
    tracks,
    createdAt: timestamp(row.created_at, "playlist creation timestamp"),
    updatedAt: timestamp(row.updated_at, "playlist update timestamp"),
  });
}

export async function readCustomerPlaylists(
  binding: D1Database,
  userId: string,
): Promise<readonly CustomerPlaylistDTO[]> {
  await ensureCustomerLibrary(binding);
  const customerId = requireUserId(userId);
  const result = await binding
    .prepare(
      `SELECT id, name, description, revision, created_at, updated_at
       FROM playlists
       WHERE user_id = ?1 AND state = 'active' AND ${ACTIVE_CUSTOMER_SQL}
       ORDER BY updated_at DESC, id`,
    )
    .bind(customerId, customerId)
    .all<PlaylistRow>();
  return Object.freeze(
    await Promise.all(
      result.results.map(async (row) => {
        const playlistId = id(row.id, "playlist ID");
        return playlistBase(
          row,
          await readPlaylistTracks(binding, customerId, playlistId),
        );
      }),
    ),
  );
}

export async function readCustomerPlaylist(
  binding: D1Database,
  userId: string,
  playlistId: string,
): Promise<CustomerPlaylistDTO | null> {
  await ensureCustomerLibrary(binding);
  const customerId = requireUserId(userId);
  const requestedId = id(playlistId, "requested playlist ID");
  const row = await binding
    .prepare(
      `SELECT id, name, description, revision, created_at, updated_at
       FROM playlists
       WHERE id = ?1 AND user_id = ?2 AND state = 'active'
         AND ${ACTIVE_CUSTOMER_SQL}
       LIMIT 1`,
    )
    .bind(requestedId, customerId, customerId)
    .first<PlaylistRow>();
  return row
    ? playlistBase(
        row,
        await readPlaylistTracks(binding, customerId, requestedId),
      )
    : null;
}

export async function readListeningHistory(
  binding: D1Database,
  userId: string,
): Promise<readonly ListeningHistoryDTO[]> {
  await ensureCustomerLibrary(binding);
  const customerId = requireUserId(userId);
  const result = await binding
    .prepare(
      `SELECT history.id AS history_id, history.track_id,
              history.track_revision_id, listened.title AS listened_title,
              listened.subtitle AS listened_subtitle,
              listened.duration_ms AS listened_duration_ms,
              history.position_ms, history.meaningful_listen_count,
              history.revision AS history_revision,
              history.first_listened_at, history.last_listened_at,
              tracks.slug, current_revision.title, current_revision.subtitle,
              current_revision.duration_ms,
              CASE WHEN tracks.publication_state = 'published'
                     AND current_revision.id IS NOT NULL THEN 1 ELSE 0 END AS available,
              current_revision.id AS revision_id,
              ${STREAM_READY_SQL} AS stream_ready,
              history.id, 1 AS position
       FROM listening_history AS history
       JOIN tracks ON tracks.id = history.track_id
       JOIN track_revisions AS listened
         ON listened.id = history.track_revision_id
        AND listened.track_id = history.track_id
       LEFT JOIN track_revisions AS current_revision
         ON current_revision.id = tracks.published_revision_id
        AND current_revision.track_id = tracks.id
       LEFT JOIN media_derivatives AS streaming_derivative
         ON streaming_derivative.id = current_revision.streaming_derivative_id
       LEFT JOIN media_objects AS source_media
         ON source_media.id = streaming_derivative.source_media_id
       WHERE history.user_id = ?1 AND ${ACTIVE_CUSTOMER_SQL}
       ORDER BY history.last_listened_at DESC, history.id`,
    )
    .bind(customerId, customerId)
    .all<HistoryRow>();
  return Object.freeze(
    result.results.map((row) => {
      const track = trackFromRow(row);
      const positionMs = integer(row.position_ms, "listening position");
      const listenedRevision: FrozenListenedRevisionDTO = Object.freeze({
        id: id(row.track_revision_id, "listened track revision ID"),
        title: nonBlank(row.listened_title, "listened track title"),
        subtitle: nullableString(
          row.listened_subtitle,
          "listened track subtitle",
        ),
        durationMs: nullableInteger(
          row.listened_duration_ms,
          "listened track duration",
        ),
      });
      return Object.freeze({
        id: id(row.history_id, "listening history ID"),
        trackId: id(row.track_id, "history track ID"),
        trackRevisionId: listenedRevision.id,
        track,
        listenedRevision,
        positionMs,
        resumePositionMs: track.available
          ? Math.min(positionMs, track.durationMs ?? positionMs)
          : null,
        meaningfulListenCount: integer(
          row.meaningful_listen_count,
          "meaningful listen count",
        ),
        revision: integer(
          row.history_revision,
          "listening history revision",
          1,
        ),
        firstListenedAt: timestamp(
          row.first_listened_at,
          "first-listened timestamp",
        ),
        lastListenedAt: timestamp(
          row.last_listened_at,
          "last-listened timestamp",
        ),
      });
    }),
  );
}

export async function readResumePosition(
  binding: D1Database,
  userId: string,
  trackId: string,
): Promise<ResumePositionDTO | null> {
  await ensureCustomerLibrary(binding);
  const customerId = requireUserId(userId);
  const requestedTrackId = id(trackId, "requested track ID");
  const row = await binding
    .prepare(
      `SELECT history.track_id,
              MIN(history.position_ms, COALESCE(current_revision.duration_ms, history.position_ms)) AS position_ms,
              history.revision
       FROM listening_history AS history
       JOIN tracks ON tracks.id = history.track_id
       JOIN track_revisions AS current_revision
         ON current_revision.id = tracks.published_revision_id
        AND current_revision.track_id = tracks.id
       WHERE history.user_id = ?1 AND history.track_id = ?2
         AND tracks.publication_state = 'published'
         AND ${ACTIVE_CUSTOMER_SQL}
       LIMIT 1`,
    )
    .bind(customerId, requestedTrackId, customerId)
    .first<ResumeRow>();
  return row
    ? Object.freeze({
        trackId: id(row.track_id, "resume track ID"),
        positionMs: integer(row.position_ms, "resume position"),
        revision: integer(row.revision, "resume revision", 1),
      })
    : null;
}

export async function readCustomerLibrary(
  binding: D1Database,
  userId: string,
): Promise<CustomerLibraryDTO> {
  const [favorites, playlists, listeningHistory] = await Promise.all([
    readCustomerFavorites(binding, userId),
    readCustomerPlaylists(binding, userId),
    readListeningHistory(binding, userId),
  ]);
  return Object.freeze({ favorites, playlists, listeningHistory });
}
