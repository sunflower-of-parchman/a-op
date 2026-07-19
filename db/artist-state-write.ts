import { runAtomicBatch } from "./d1.ts";
import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import {
  MODULE_KEYS,
  isModuleKey,
  planModuleTransition,
  type ModuleKey,
} from "@/lib/modules/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export interface ArtistRevisionInput {
  readonly displayName: string;
  readonly siteTitle: string;
  readonly headline: string;
  readonly introduction: string;
  readonly footerText: string;
}

export interface NavigationItemInput {
  readonly itemKey: string;
  readonly label: string;
  readonly href: string;
  readonly position: number;
  readonly moduleKey: ModuleKey | null;
  readonly external: boolean;
}

export type NavigationSetId = "primary" | "footer";

interface ArtistAggregateRow {
  id: string;
  draft_revision_id: string;
  published_revision_id: string | null;
  version: number;
}

interface RevisionNumberRow {
  revision: number;
}

interface NavigationAggregateRow {
  draft_version: number;
  published_version: number | null;
  revision: number;
}

interface ModuleStateRow {
  module_key: string;
  active: number;
  revision: number;
}

interface ModuleRegistryRow {
  revision: number;
}

export interface ArtistDraftResult {
  readonly revisionId: string;
  readonly revision: number;
  readonly version: number;
  readonly publishedRevisionId: string | null;
}

export interface ArtistPublishResult {
  readonly publishedRevisionId: string;
  readonly version: number;
}

export interface ModuleTransitionResultValue {
  readonly activeModules: readonly ModuleKey[];
  readonly activated: readonly ModuleKey[];
  readonly deactivated: readonly ModuleKey[];
}

export interface NavigationDraftResult {
  readonly setId: NavigationSetId;
  readonly draftVersion: number;
  readonly publishedVersion: number | null;
  readonly revision: number;
}

export interface NavigationPublishResult {
  readonly setId: NavigationSetId;
  readonly publishedVersion: number;
  readonly revision: number;
}

export interface NavigationSnapshotDraftResult {
  readonly primary: NavigationDraftResult;
  readonly footer: NavigationDraftResult;
}

export interface NavigationSnapshotPublishResult {
  readonly primary: NavigationPublishResult;
  readonly footer: NavigationPublishResult;
}

async function readArtistAggregate(
  binding: D1Database,
): Promise<ArtistAggregateRow> {
  const row = await binding
    .prepare(
      `SELECT id, draft_revision_id, published_revision_id, version
       FROM artist_config
       WHERE id = 'artist'
       LIMIT 1`,
    )
    .first<ArtistAggregateRow>();
  if (!row) {
    throw new RuntimeError("ARTIST_STATE_MISSING", "Artist state is missing.", {
      status: 500,
      publicMessage: "The artist state is not available.",
    });
  }
  return row;
}

async function nextArtistRevision(binding: D1Database): Promise<number> {
  const row = await binding
    .prepare(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS revision
       FROM artist_config_revisions
       WHERE artist_config_id = 'artist'`,
    )
    .first<RevisionNumberRow>();
  return row?.revision ?? 1;
}

export async function saveArtistDraft(
  binding: D1Database,
  input: ArtistRevisionInput,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<ArtistDraftResult>> {
  const operation = "artist.draft.save";
  const mutation = await prepareMutation<ArtistDraftResult>(
    binding,
    operation,
    context,
    { expectedVersion, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readArtistAggregate(binding);
  if (aggregate.version !== expectedVersion)
    throw staleMutation("artist draft");

  const revision = await nextArtistRevision(binding);
  const revisionId = `artist_revision_${revision}_${crypto.randomUUID()}`;
  const result: ArtistDraftResult = {
    revisionId,
    revision,
    version: expectedVersion + 1,
    publishedRevisionId: aggregate.published_revision_id,
  };
  const authority = activeOwnerCondition(context.actorUserId);

  const statements = [
    binding
      .prepare(
        `INSERT INTO artist_config_revisions
          (id, artist_config_id, revision, display_name, site_title, headline,
           introduction, footer_text, created_by_user_id)
         SELECT ?1, id, ?2, ?3, ?4, ?5, ?6, ?7, ?8
         FROM artist_config
         WHERE id = 'artist' AND version = ?9
           AND ${authority.sql}`,
      )
      .bind(
        revisionId,
        revision,
        input.displayName,
        input.siteTitle,
        input.headline,
        input.introduction,
        input.footerText,
        context.actorUserId,
        expectedVersion,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE artist_config
         SET draft_revision_id = ?1,
             version = version + 1,
             last_operation_key = ?2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 'artist' AND version = ?3
           AND ${authority.sql}`,
      )
      .bind(
        revisionId,
        mutation.namespacedKey,
        expectedVersion,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "artist_config",
        subjectId: "artist",
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { revision },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM artist_config
        WHERE id = 'artist' AND version = ? AND draft_revision_id = ?
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        expectedVersion + 1,
        revisionId,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[1]) !== 1) throw staleMutation("artist draft");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function publishArtistDraft(
  binding: D1Database,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<ArtistPublishResult>> {
  const operation = "artist.publish";
  const mutation = await prepareMutation<ArtistPublishResult>(
    binding,
    operation,
    context,
    { expectedVersion },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readArtistAggregate(binding);
  if (aggregate.version !== expectedVersion) {
    throw staleMutation("artist publication");
  }
  const result: ArtistPublishResult = {
    publishedRevisionId: aggregate.draft_revision_id,
    version: expectedVersion + 1,
  };
  const authority = activeOwnerCondition(context.actorUserId);

  const statements = [
    binding
      .prepare(
        `UPDATE artist_config
         SET published_revision_id = draft_revision_id,
             published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1,
             last_operation_key = ?1
         WHERE id = 'artist' AND version = ?2
           AND ${authority.sql}`,
      )
      .bind(mutation.namespacedKey, expectedVersion, ...authority.bindings),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "artist_config",
        subjectId: "artist",
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {},
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM artist_config
        WHERE id = 'artist' AND version = ? AND published_revision_id = ?
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        expectedVersion + 1,
        aggregate.draft_revision_id,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) {
      throw staleMutation("artist publication");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function readModuleRows(
  binding: D1Database,
): Promise<readonly (ModuleStateRow & { module_key: ModuleKey })[]> {
  const query = await binding
    .prepare(
      `SELECT module_key, active, revision
       FROM artist_modules
       ORDER BY module_key`,
    )
    .all<ModuleStateRow>();

  const rows = query.results.filter(
    (row): row is ModuleStateRow & { module_key: ModuleKey } =>
      isModuleKey(row.module_key) &&
      (row.active === 0 || row.active === 1) &&
      Number.isSafeInteger(row.revision) &&
      row.revision > 0,
  );
  if (rows.length !== MODULE_KEYS.length) {
    throw new RuntimeError(
      "MODULE_STATE_INVALID",
      "The stored module state is incomplete or invalid.",
      { status: 500, publicMessage: "The module state is not available." },
    );
  }
  return rows;
}

function trustedModuleLiteral(moduleKey: ModuleKey): string {
  return `'${moduleKey}'`;
}

async function readModuleRegistryState(
  binding: D1Database,
): Promise<ModuleRegistryRow> {
  const row = await binding
    .prepare(
      `SELECT revision
       FROM module_registry_state
       WHERE id = 'registry'
       LIMIT 1`,
    )
    .first<ModuleRegistryRow>();
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new RuntimeError(
      "MODULE_STATE_INVALID",
      "The module registry state is missing or invalid.",
      { status: 500, publicMessage: "The module state is not available." },
    );
  }
  return row;
}

function moduleVectorPredicate(
  rows: readonly (ModuleStateRow & { module_key: ModuleKey })[],
  operations: ReadonlyMap<ModuleKey, 0 | 1> = new Map(),
): string {
  return rows
    .map((row) => {
      const nextActive = operations.get(row.module_key);
      const changed = nextActive !== undefined && nextActive !== row.active;
      return `(module_key = ${trustedModuleLiteral(row.module_key)} AND revision = ${
        row.revision + (changed ? 1 : 0)
      } AND active = ${changed ? nextActive : row.active})`;
    })
    .join(" OR ");
}

export async function transitionModules(
  binding: D1Database,
  input: {
    readonly activate: readonly ModuleKey[];
    readonly deactivate: readonly ModuleKey[];
  },
  context: MutationContext,
): Promise<MutationResult<ModuleTransitionResultValue>> {
  const operation = "modules.transition";
  const mutation = await prepareMutation<ModuleTransitionResultValue>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const [rows, registry] = await Promise.all([
    readModuleRows(binding),
    readModuleRegistryState(binding),
  ]);
  const currentModules = MODULE_KEYS.filter((key) =>
    rows.some((row) => row.module_key === key && row.active === 1),
  );
  const plan = planModuleTransition({
    currentModules,
    activate: input.activate,
    deactivate: input.deactivate,
  });
  if (!plan.ok) {
    throw new RuntimeError(
      "MODULE_TRANSITION_INVALID",
      "Invalid module change.",
      {
        status: 400,
        publicMessage: plan.issues.map(({ message }) => message).join(" "),
        details: { issues: plan.issues },
      },
    );
  }

  const result: ModuleTransitionResultValue = {
    activeModules: plan.activeModulesAfter,
    activated: plan.activate,
    deactivated: plan.deactivate,
  };
  const expectedByKey = new Map(rows.map((row) => [row.module_key, row]));
  const operations = plan.operations.map((item) => ({
    ...item,
    expected: expectedByKey.get(item.moduleKey)!,
    active: (item.action === "activate" ? 1 : 0) as 0 | 1,
  }));
  const operationState = new Map(
    operations.map(({ moduleKey, active }) => [moduleKey, active] as const),
  );
  const currentVector = moduleVectorPredicate(rows);
  const updatedVector = moduleVectorPredicate(rows, operationState);
  const expectedChanges = operations.length;
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE module_registry_state
         SET revision = revision + 1,
             last_operation_key = ?1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 'registry' AND revision = ?2
           AND (SELECT COUNT(*) FROM artist_modules WHERE ${currentVector}) = ?3
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        registry.revision,
        MODULE_KEYS.length,
        ...authority.bindings,
      ),
  ];

  if (operations.length > 0) {
    const keyList = operations
      .map(({ moduleKey }) => trustedModuleLiteral(moduleKey))
      .join(", ");
    const activeCase = operations
      .map(
        ({ moduleKey, active }) =>
          `WHEN ${trustedModuleLiteral(moduleKey)} THEN ${active}`,
      )
      .join(" ");
    statements.push(
      binding
        .prepare(
          `UPDATE artist_modules
       SET active = CASE module_key ${activeCase} ELSE active END,
           revision = revision + 1,
           activated_at = CASE
             WHEN (CASE module_key ${activeCase} ELSE active END) = 1
             THEN CURRENT_TIMESTAMP ELSE activated_at END,
           deactivated_at = CASE
             WHEN (CASE module_key ${activeCase} ELSE active END) = 0
             THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE module_key IN (${keyList})
         AND EXISTS (
           SELECT 1 FROM module_registry_state
           WHERE id = 'registry' AND revision = ?
             AND last_operation_key = ?
         )
         AND ${authority.sql}`,
        )
        .bind(
          context.actorUserId,
          registry.revision + 1,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    );
  }

  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "artist_modules",
        subjectId: "registry",
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          activated: [...plan.activate],
          deactivated: [...plan.deactivate],
          durableState: "preserved",
          unchanged: operations.length === 0,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM module_registry_state
        WHERE id = 'registry' AND revision = ? AND last_operation_key = ?
      ) AND (SELECT COUNT(*) FROM artist_modules WHERE ${updatedVector}) = ?
        AND ${authority.sql}`,
      [
        registry.revision + 1,
        mutation.namespacedKey,
        MODULE_KEYS.length,
        ...authority.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) {
      throw staleMutation("module state");
    }
    if (expectedChanges > 0 && changedRows(results[1]) !== expectedChanges) {
      throw staleMutation("module state");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function readNavigationAggregate(
  binding: D1Database,
  setId: NavigationSetId,
): Promise<NavigationAggregateRow> {
  const row = await binding
    .prepare(
      `SELECT draft_version, published_version, revision
       FROM navigation_sets
       WHERE id = ?1
       LIMIT 1`,
    )
    .bind(setId)
    .first<NavigationAggregateRow>();
  if (!row) {
    throw new RuntimeError(
      "NAVIGATION_STATE_MISSING",
      "Navigation state is missing.",
      { status: 500, publicMessage: "The navigation state is not available." },
    );
  }
  return row;
}

export async function saveNavigationSnapshot(
  binding: D1Database,
  navigation: Readonly<Record<NavigationSetId, readonly NavigationItemInput[]>>,
  expectedRevisions: Readonly<Record<NavigationSetId, number>>,
  context: MutationContext,
): Promise<MutationResult<NavigationSnapshotDraftResult>> {
  const operation = "navigation.snapshot.draft.save";
  const mutation = await prepareMutation<NavigationSnapshotDraftResult>(
    binding,
    operation,
    context,
    { navigation, expectedRevisions },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const [primaryAggregate, footerAggregate] = await Promise.all([
    readNavigationAggregate(binding, "primary"),
    readNavigationAggregate(binding, "footer"),
  ]);
  if (
    primaryAggregate.revision !== expectedRevisions.primary ||
    footerAggregate.revision !== expectedRevisions.footer
  ) {
    throw staleMutation("navigation");
  }

  const primaryDraftVersion = primaryAggregate.draft_version + 1;
  const footerDraftVersion = footerAggregate.draft_version + 1;
  const result: NavigationSnapshotDraftResult = {
    primary: {
      setId: "primary",
      draftVersion: primaryDraftVersion,
      publishedVersion: primaryAggregate.published_version,
      revision: expectedRevisions.primary + 1,
    },
    footer: {
      setId: "footer",
      draftVersion: footerDraftVersion,
      publishedVersion: footerAggregate.published_version,
      revision: expectedRevisions.footer + 1,
    },
  };
  const authority = activeOwnerCondition(context.actorUserId);

  const statements: D1PreparedStatement[] = (
    ["primary", "footer"] as const
  ).flatMap((setId) => {
    const draftVersion =
      setId === "primary" ? primaryDraftVersion : footerDraftVersion;
    return navigation[setId].map((item) =>
      binding
        .prepare(
          `INSERT INTO navigation_items
            (id, navigation_set_id, version, item_key, label, href, position,
             module_key, external, created_by_user_id)
           SELECT ?1, target.id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
           FROM navigation_sets AS target
           WHERE target.id = ?10
             AND (
               SELECT COUNT(*) FROM navigation_sets
               WHERE (id = 'primary' AND revision = ?11)
                  OR (id = 'footer' AND revision = ?12)
             ) = 2
             AND ${authority.sql}`,
        )
        .bind(
          `nav_${setId}_${draftVersion}_${item.itemKey}`,
          draftVersion,
          item.itemKey,
          item.label,
          item.href,
          item.position,
          item.moduleKey,
          item.external ? 1 : 0,
          context.actorUserId,
          setId,
          expectedRevisions.primary,
          expectedRevisions.footer,
          ...authority.bindings,
        ),
    );
  });
  const updateIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE navigation_sets
         SET draft_version = CASE id
               WHEN 'primary' THEN ?1
               WHEN 'footer' THEN ?2
             END,
             revision = revision + 1,
             last_operation_key = ?3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN ('primary', 'footer')
           AND (
             SELECT COUNT(*) FROM navigation_sets
             WHERE (id = 'primary' AND revision = ?4)
                OR (id = 'footer' AND revision = ?5)
           ) = 2
           AND ${authority.sql}`,
      )
      .bind(
        primaryDraftVersion,
        footerDraftVersion,
        mutation.namespacedKey,
        expectedRevisions.primary,
        expectedRevisions.footer,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "navigation",
        subjectId: "public-shell",
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          primaryItemCount: navigation.primary.length,
          footerItemCount: navigation.footer.length,
        },
        result: { ...result },
      },
      `(SELECT COUNT(*) FROM navigation_sets
        WHERE (id = 'primary' AND revision = ? AND draft_version = ?
               AND last_operation_key = ?)
           OR (id = 'footer' AND revision = ? AND draft_version = ?
               AND last_operation_key = ?)
       ) = 2 AND ${authority.sql}`,
      [
        expectedRevisions.primary + 1,
        primaryDraftVersion,
        mutation.namespacedKey,
        expectedRevisions.footer + 1,
        footerDraftVersion,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[updateIndex]) !== 2) {
      throw staleMutation("navigation");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function publishNavigationSnapshot(
  binding: D1Database,
  expectedRevisions: Readonly<Record<NavigationSetId, number>>,
  context: MutationContext,
): Promise<MutationResult<NavigationSnapshotPublishResult>> {
  const operation = "navigation.snapshot.publish";
  const mutation = await prepareMutation<NavigationSnapshotPublishResult>(
    binding,
    operation,
    context,
    { expectedRevisions },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const [primaryAggregate, footerAggregate] = await Promise.all([
    readNavigationAggregate(binding, "primary"),
    readNavigationAggregate(binding, "footer"),
  ]);
  if (
    primaryAggregate.revision !== expectedRevisions.primary ||
    footerAggregate.revision !== expectedRevisions.footer
  ) {
    throw staleMutation("navigation publication");
  }

  const result: NavigationSnapshotPublishResult = {
    primary: {
      setId: "primary",
      publishedVersion: primaryAggregate.draft_version,
      revision: expectedRevisions.primary + 1,
    },
    footer: {
      setId: "footer",
      publishedVersion: footerAggregate.draft_version,
      revision: expectedRevisions.footer + 1,
    },
  };
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE navigation_sets
         SET published_version = draft_version,
             revision = revision + 1,
             last_operation_key = ?1,
             published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN ('primary', 'footer')
           AND (
             SELECT COUNT(*) FROM navigation_sets
             WHERE (id = 'primary' AND revision = ?2)
                OR (id = 'footer' AND revision = ?3)
           ) = 2
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        expectedRevisions.primary,
        expectedRevisions.footer,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "navigation",
        subjectId: "public-shell",
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {},
        result: { ...result },
      },
      `(SELECT COUNT(*) FROM navigation_sets
        WHERE (id = 'primary' AND revision = ? AND published_version = ?
               AND last_operation_key = ?)
           OR (id = 'footer' AND revision = ? AND published_version = ?
               AND last_operation_key = ?)
       ) = 2 AND ${authority.sql}`,
      [
        expectedRevisions.primary + 1,
        primaryAggregate.draft_version,
        mutation.namespacedKey,
        expectedRevisions.footer + 1,
        footerAggregate.draft_version,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 2) {
      throw staleMutation("navigation publication");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
