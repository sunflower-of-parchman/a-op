import { env } from "cloudflare:workers";
import { runAtomicBatch } from "@/db/d1.ts";
import {
  readJsonMutation,
  requireSameOrigin,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError, resolveSimulationMode } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

const SNAPSHOT_PREFIX = "m2-runtime-snapshot:";
const OWNER_EMAIL = "owner@a-op.invalid";
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type D1Scalar = string | number | null;
type D1Row = Record<string, D1Scalar>;

interface M2Snapshot {
  readonly version: 1;
  readonly runId: string;
  readonly installation: D1Row;
  readonly artistConfig: D1Row;
  readonly contactModule: D1Row;
  readonly moduleRegistry: D1Row;
  readonly navigationSets: readonly D1Row[];
  readonly owner: {
    readonly user: D1Row | null;
    readonly profile: D1Row | null;
    readonly roles: readonly D1Row[];
  };
  readonly ownerBootstrapAudit: D1Row | null;
}

interface RunFacts {
  readonly runId: string;
  readonly shortId: string;
  readonly slug: string;
  readonly itemKeyPrefix: string;
  readonly customerId: string;
  readonly customerEmail: string;
  readonly editorEmail: string;
  readonly disabledId: string;
  readonly disabledEmail: string;
  readonly artistDisplayName: string;
  readonly artistSiteTitle: string;
  readonly artistHeadline: string;
  readonly artistIntroduction: string;
  readonly artistFooterText: string;
  readonly navigationLabel: string;
  readonly pageTitle: string;
  readonly pageIntroduction: string;
  readonly pageBodyText: string;
}

function runtimeLabEnabled(): boolean {
  return resolveSimulationMode({
    AOP_RUNTIME_ENV: env.AOP_RUNTIME_ENV,
    AOP_SIMULATION_MODE: env.AOP_SIMULATION_MODE,
  }).enabled;
}

function runtimeError(
  code: string,
  message: string,
  status: number,
): RuntimeError {
  return new RuntimeError(code, message, {
    status,
    publicMessage: message,
  });
}

function unavailable(): never {
  throw runtimeError("NOT_FOUND", "The requested resource was not found.", 404);
}

function requireLab(): void {
  if (!runtimeLabEnabled()) unavailable();
}

function factsForRun(runId: string): RunFacts {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw runtimeError("INVALID_INPUT", "Provide a valid runtime run ID.", 400);
  }
  const shortId = runId.replaceAll("-", "").slice(0, 12);
  return Object.freeze({
    runId,
    shortId,
    slug: `runtime-contact-${shortId}`,
    itemKeyPrefix: `m2-${shortId}`,
    customerId: `user_m2_customer_${shortId}`,
    customerEmail: `m2-customer-${shortId}@a-op.invalid`,
    editorEmail: `m2-editor-${shortId}@a-op.invalid`,
    disabledId: `user_m2_disabled_${shortId}`,
    disabledEmail: `m2-disabled-${shortId}@a-op.invalid`,
    artistDisplayName: `Fictional Milestone Two Artist ${shortId}`,
    artistSiteTitle: `Fictional Milestone Two Site ${shortId}`,
    artistHeadline: `A published artist state ${shortId}.`,
    artistIntroduction: `A deterministic D1-backed installation journey for ${shortId}.`,
    artistFooterText: `Fictional artist state for runtime verification ${shortId}.`,
    navigationLabel: `Runtime contact ${shortId}`,
    pageTitle: `Runtime contact page ${shortId}`,
    pageIntroduction: `Published only through the scoped editor workflow ${shortId}.`,
    pageBodyText: `Durable page state remains published while its contact module is inactive ${shortId}.`,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactObject(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
  return value;
}

function requireBeginInput(value: unknown): void {
  const input = requireExactObject(value, ["action"]);
  if (input.action !== "begin") {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
}

function requireCleanupInput(value: unknown): string {
  const input = requireExactObject(value, ["runId"]);
  if (typeof input.runId !== "string") {
    throw runtimeError("INVALID_INPUT", "Provide a valid runtime run ID.", 400);
  }
  return factsForRun(input.runId).runId;
}

async function allRows(
  sql: string,
  bindings: readonly D1Scalar[] = [],
): Promise<readonly D1Row[]> {
  const result = await env.DB.prepare(sql)
    .bind(...bindings)
    .all<D1Row>();
  return result.results;
}

async function firstRow(
  sql: string,
  bindings: readonly D1Scalar[] = [],
): Promise<D1Row | null> {
  return env.DB.prepare(sql)
    .bind(...bindings)
    .first<D1Row>();
}

function requiredRow(row: D1Row | null, name: string): D1Row {
  if (!row) {
    throw runtimeError(
      "M2_RUNTIME_STATE_MISSING",
      `The ${name} state is not available.`,
      500,
    );
  }
  return row;
}

async function captureSnapshot(runId: string): Promise<M2Snapshot> {
  const ownerUser = await firstRow(
    `SELECT id, email, normalized_email, status, created_at, updated_at
     FROM users
     WHERE normalized_email = ?1
     LIMIT 1`,
    [OWNER_EMAIL],
  );
  const ownerId = typeof ownerUser?.id === "string" ? ownerUser.id : null;

  const [
    installation,
    artistConfig,
    contactModule,
    moduleRegistry,
    navigationSets,
    ownerProfile,
    ownerRoles,
    ownerBootstrapAudit,
  ] = await Promise.all([
    firstRow(
      `SELECT id, status, owner_user_id, schema_version,
              last_operation_key, bootstrap_completed_at, created_at, updated_at
       FROM installation_state
       WHERE id = 'installation'
       LIMIT 1`,
    ),
    firstRow(
      `SELECT id, draft_revision_id, published_revision_id, version,
              last_operation_key, created_at, updated_at, published_at
       FROM artist_config
       WHERE id = 'artist'
       LIMIT 1`,
    ),
    firstRow(
      `SELECT module_key, active, revision, settings_json, activated_at,
              deactivated_at, updated_by_user_id, created_at, updated_at
       FROM artist_modules
       WHERE module_key = 'contact'
      LIMIT 1`,
    ),
    firstRow(
      `SELECT id, revision, last_operation_key, updated_at
       FROM module_registry_state
       WHERE id = 'registry'
       LIMIT 1`,
    ),
    allRows(
      `SELECT id, label, draft_version, published_version, revision,
              last_operation_key, created_at, updated_at, published_at
       FROM navigation_sets
       WHERE id IN ('primary', 'footer')
       ORDER BY id`,
    ),
    ownerId
      ? firstRow(
          `SELECT user_id, display_name, revision, last_operation_key,
                  created_at, updated_at
           FROM profiles
           WHERE user_id = ?1
           LIMIT 1`,
          [ownerId],
        )
      : Promise.resolve(null),
    allRows(
      `SELECT id, user_id, role_key, assigned_by_user_id,
              last_operation_key, created_at, updated_at, revoked_at,
              revoked_by_user_id
       FROM role_assignments
       WHERE role_key = 'owner' OR user_id = ?1
       ORDER BY id`,
      [ownerId ?? "runtime-owner-not-present"],
    ),
    firstRow(
      `SELECT id, actor_user_id, action, subject_type, subject_id,
              idempotency_key, request_fingerprint, request_id, details_json,
              result_json, created_at
       FROM audit_events
       WHERE id = 'audit_owner_bootstrap'
       LIMIT 1`,
    ),
  ]);

  if (navigationSets.length !== 2) {
    throw runtimeError(
      "M2_RUNTIME_STATE_MISSING",
      "The navigation state is not available.",
      500,
    );
  }

  return Object.freeze({
    version: 1,
    runId,
    installation: requiredRow(installation, "installation"),
    artistConfig: requiredRow(artistConfig, "artist"),
    contactModule: requiredRow(contactModule, "contact module"),
    moduleRegistry: requiredRow(moduleRegistry, "module registry"),
    navigationSets: Object.freeze(navigationSets),
    owner: Object.freeze({
      user: ownerUser,
      profile: ownerProfile,
      roles: Object.freeze(ownerRoles),
    }),
    ownerBootstrapAudit,
  });
}

function parseSnapshot(value: string, expectedRunId: string): M2Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw runtimeError(
      "M2_RUNTIME_SNAPSHOT_INVALID",
      "The runtime cleanup snapshot is invalid.",
      500,
    );
  }
  if (
    !isPlainRecord(parsed) ||
    parsed.version !== 1 ||
    parsed.runId !== expectedRunId ||
    !isPlainRecord(parsed.installation) ||
    !isPlainRecord(parsed.artistConfig) ||
    !isPlainRecord(parsed.contactModule) ||
    !isPlainRecord(parsed.moduleRegistry) ||
    !Array.isArray(parsed.navigationSets) ||
    parsed.navigationSets.length !== 2 ||
    !parsed.navigationSets.every(isPlainRecord) ||
    !isPlainRecord(parsed.owner) ||
    (parsed.owner.user !== null && !isPlainRecord(parsed.owner.user)) ||
    (parsed.owner.profile !== null && !isPlainRecord(parsed.owner.profile)) ||
    !Array.isArray(parsed.owner.roles) ||
    !parsed.owner.roles.every(isPlainRecord) ||
    (parsed.ownerBootstrapAudit !== null &&
      !isPlainRecord(parsed.ownerBootstrapAudit))
  ) {
    throw runtimeError(
      "M2_RUNTIME_SNAPSHOT_INVALID",
      "The runtime cleanup snapshot is invalid.",
      500,
    );
  }
  return parsed as unknown as M2Snapshot;
}

async function readSnapshot(runId: string): Promise<M2Snapshot> {
  const row = await firstRow(
    `SELECT value
     FROM runtime_proofs
     WHERE key = ?1
     LIMIT 1`,
    [`${SNAPSHOT_PREFIX}${runId}`],
  );
  if (!row || typeof row.value !== "string") {
    throw runtimeError("NOT_FOUND", "The runtime run was not found.", 404);
  }
  return parseSnapshot(row.value, runId);
}

function integerField(row: D1Row, key: string): number {
  const value = row[key];
  if (!Number.isSafeInteger(value)) {
    throw runtimeError(
      "M2_RUNTIME_STATE_INVALID",
      "The runtime state contains an invalid integer.",
      500,
    );
  }
  return value as number;
}

async function beginRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  requireBeginInput(await readJsonMutation(request));
  const existing = await firstRow(
    `SELECT key FROM runtime_proofs WHERE key LIKE ?1 LIMIT 1`,
    [`${SNAPSHOT_PREFIX}%`],
  );
  if (existing) {
    throw runtimeError(
      "M2_RUNTIME_RUN_ACTIVE",
      "A Milestone 2 runtime run is already active.",
      409,
    );
  }

  const facts = factsForRun(crypto.randomUUID());
  const snapshot = await captureSnapshot(facts.runId);
  const ownerId =
    snapshot.owner.user && typeof snapshot.owner.user.id === "string"
      ? snapshot.owner.user.id
      : null;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO runtime_proofs (key, value, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(`${SNAPSHOT_PREFIX}${facts.runId}`, JSON.stringify(snapshot)),
    env.DB.prepare(
      `UPDATE installation_state
       SET status = 'pending', owner_user_id = NULL,
           bootstrap_completed_at = NULL
       WHERE id = 'installation'`,
    ),
    env.DB.prepare(
      `UPDATE artist_modules
       SET active = 0
       WHERE module_key = 'contact'`,
    ),
    env.DB.prepare(
      `DELETE FROM audit_events WHERE id = 'audit_owner_bootstrap'`,
    ),
    env.DB.prepare(
      `UPDATE role_assignments
       SET revoked_at = CURRENT_TIMESTAMP,
           revoked_by_user_id = NULL,
           last_operation_key = ?1,
           updated_at = CURRENT_TIMESTAMP
       WHERE role_key = 'owner' AND revoked_at IS NULL`,
    ).bind(`runtime-lab:${facts.runId}`),
    env.DB.prepare(
      `INSERT INTO users
        (id, email, normalized_email, status)
       VALUES (?1, ?2, ?2, 'active')`,
    ).bind(facts.customerId, facts.customerEmail),
    env.DB.prepare(
      `INSERT INTO profiles (user_id, display_name, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(facts.customerId, `Fictional M2 Customer ${facts.shortId}`),
    env.DB.prepare(
      `INSERT INTO role_assignments
        (id, user_id, role_key, assigned_by_user_id)
       VALUES (?1, ?2, 'customer', NULL)`,
    ).bind(`role_m2_customer_${facts.shortId}`, facts.customerId),
    env.DB.prepare(
      `INSERT INTO users
        (id, email, normalized_email, status)
       VALUES (?1, ?2, ?2, 'disabled')`,
    ).bind(facts.disabledId, facts.disabledEmail),
    env.DB.prepare(
      `INSERT INTO profiles (user_id, display_name, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(facts.disabledId, `Fictional Disabled M2 ${facts.shortId}`),
  ];
  if (ownerId) {
    statements.push(
      env.DB.prepare(
        `UPDATE users
         SET status = 'active'
         WHERE id = ?1`,
      ).bind(ownerId),
    );
  }
  await runAtomicBatch(env.DB, statements);

  const primary = snapshot.navigationSets.find(({ id }) => id === "primary")!;
  const footer = snapshot.navigationSets.find(({ id }) => id === "footer")!;
  return apiJson(
    {
      run: {
        id: facts.runId,
        shortId: facts.shortId,
        slug: facts.slug,
        artist: {
          displayName: facts.artistDisplayName,
          siteTitle: facts.artistSiteTitle,
          headline: facts.artistHeadline,
          introduction: facts.artistIntroduction,
          footerText: facts.artistFooterText,
          expectedVersion: integerField(snapshot.artistConfig, "version"),
        },
        navigation: {
          label: facts.navigationLabel,
          expectedRevisions: {
            primary: integerField(primary, "revision"),
            footer: integerField(footer, "revision"),
          },
        },
        page: {
          title: facts.pageTitle,
          introduction: facts.pageIntroduction,
          bodyText: facts.pageBodyText,
        },
      },
    },
    requestId,
    201,
  );
}

async function identityFacts(normalizedEmail: string): Promise<{
  readonly status: string | null;
  readonly activeEditorRoles: number;
  readonly activePagePermissions: number;
}> {
  const row = await firstRow(
    `SELECT
       users.status AS status,
       (SELECT COUNT(*) FROM role_assignments
        WHERE role_assignments.user_id = users.id
          AND role_assignments.role_key = 'editor'
          AND role_assignments.revoked_at IS NULL) AS active_editor_roles,
       (SELECT COUNT(*) FROM editor_permissions
        WHERE editor_permissions.user_id = users.id
          AND editor_permissions.permission_key = 'pages.write'
          AND editor_permissions.revoked_at IS NULL) AS active_page_permissions
     FROM users
     WHERE users.normalized_email = ?1
     LIMIT 1`,
    [normalizedEmail],
  );
  return Object.freeze({
    status: typeof row?.status === "string" ? row.status : null,
    activeEditorRoles: row ? integerField(row, "active_editor_roles") : 0,
    activePagePermissions: row
      ? integerField(row, "active_page_permissions")
      : 0,
  });
}

async function readRunState(
  runId: string,
  requestId: string,
): Promise<Response> {
  const facts = factsForRun(runId);
  await readSnapshot(runId);
  const [
    installation,
    artist,
    contactModule,
    moduleRegistry,
    navigationSets,
    page,
    disabled,
  ] = await Promise.all([
    firstRow(
      `SELECT status, owner_user_id
         FROM installation_state
         WHERE id = 'installation'
         LIMIT 1`,
    ),
    firstRow(
      `SELECT artist_config.version, artist_config.draft_revision_id,
                artist_config.published_revision_id,
                artist_config_revisions.display_name,
                artist_config_revisions.site_title
         FROM artist_config
         LEFT JOIN artist_config_revisions
           ON artist_config_revisions.id = artist_config.published_revision_id
         WHERE artist_config.id = 'artist'
         LIMIT 1`,
    ),
    firstRow(
      `SELECT active, revision, settings_json
         FROM artist_modules
         WHERE module_key = 'contact'
         LIMIT 1`,
    ),
    firstRow(
      `SELECT revision, last_operation_key
         FROM module_registry_state
         WHERE id = 'registry'
         LIMIT 1`,
    ),
    allRows(
      `SELECT id, draft_version, published_version, revision
         FROM navigation_sets
         WHERE id IN ('primary', 'footer')
         ORDER BY id`,
    ),
    firstRow(
      `SELECT pages.id, pages.publication_state, pages.version,
                pages.draft_revision_id, pages.published_revision_id,
                published.module_key AS published_module_key,
                published.kind AS published_kind,
                (SELECT COUNT(*) FROM page_revisions
                 WHERE page_revisions.page_id = pages.id) AS revision_count
         FROM pages
         LEFT JOIN page_revisions AS published
           ON published.id = pages.published_revision_id
         WHERE pages.slug = ?1
         LIMIT 1`,
      [facts.slug],
    ),
    identityFacts(facts.disabledEmail),
  ]);

  return apiJson(
    {
      state: {
        installation: installation
          ? {
              status: installation.status,
              hasOwner: typeof installation.owner_user_id === "string",
            }
          : null,
        artist: artist
          ? {
              version: artist.version,
              draftRevisionId: artist.draft_revision_id,
              publishedRevisionId: artist.published_revision_id,
              displayName: artist.display_name,
              siteTitle: artist.site_title,
            }
          : null,
        contactModule: contactModule
          ? {
              active: contactModule.active === 1,
              revision: contactModule.revision,
              settingsPreserved:
                typeof contactModule.settings_json === "string",
            }
          : null,
        moduleRegistry: moduleRegistry
          ? {
              revision: moduleRegistry.revision,
              hasOperationMarker:
                typeof moduleRegistry.last_operation_key === "string",
            }
          : null,
        navigationSets,
        page: page
          ? {
              publicationState: page.publication_state,
              version: page.version,
              draftRevisionId: page.draft_revision_id,
              publishedRevisionId: page.published_revision_id,
              moduleKey: page.published_module_key,
              kind: page.published_kind,
              revisionCount: page.revision_count,
            }
          : null,
        disabledIdentity: disabled,
      },
    },
    requestId,
  );
}

function prepareRestoreInstallation(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE installation_state
     SET status = ?1, owner_user_id = ?2, schema_version = ?3,
         last_operation_key = ?4, bootstrap_completed_at = ?5,
         created_at = ?6, updated_at = ?7
     WHERE id = 'installation'`,
  ).bind(
    row.status,
    row.owner_user_id,
    row.schema_version,
    row.last_operation_key,
    row.bootstrap_completed_at,
    row.created_at,
    row.updated_at,
  );
}

function prepareRestoreArtist(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE artist_config
     SET draft_revision_id = ?1, published_revision_id = ?2, version = ?3,
         last_operation_key = ?4, created_at = ?5, updated_at = ?6,
         published_at = ?7
     WHERE id = 'artist'`,
  ).bind(
    row.draft_revision_id,
    row.published_revision_id,
    row.version,
    row.last_operation_key,
    row.created_at,
    row.updated_at,
    row.published_at,
  );
}

function prepareRestoreModuleRegistry(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE module_registry_state
     SET revision = ?1, last_operation_key = ?2, updated_at = ?3
     WHERE id = 'registry'`,
  ).bind(row.revision, row.last_operation_key, row.updated_at);
}

function prepareRestoreContactModule(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE artist_modules
     SET active = ?1, revision = ?2, settings_json = ?3, activated_at = ?4,
         deactivated_at = ?5, updated_by_user_id = ?6, created_at = ?7,
         updated_at = ?8
     WHERE module_key = 'contact'`,
  ).bind(
    row.active,
    row.revision,
    row.settings_json,
    row.activated_at,
    row.deactivated_at,
    row.updated_by_user_id,
    row.created_at,
    row.updated_at,
  );
}

function prepareRestoreNavigation(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE navigation_sets
     SET label = ?1, draft_version = ?2, published_version = ?3,
         revision = ?4, last_operation_key = ?5, created_at = ?6,
         updated_at = ?7, published_at = ?8
     WHERE id = ?9`,
  ).bind(
    row.label,
    row.draft_version,
    row.published_version,
    row.revision,
    row.last_operation_key,
    row.created_at,
    row.updated_at,
    row.published_at,
    row.id,
  );
}

function prepareRestoreOwnerUser(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE users
     SET email = ?1, normalized_email = ?2, status = ?3,
         created_at = ?4, updated_at = ?5
     WHERE id = ?6`,
  ).bind(
    row.email,
    row.normalized_email,
    row.status,
    row.created_at,
    row.updated_at,
    row.id,
  );
}

function prepareRestoreOwnerProfile(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO profiles
      (user_id, display_name, revision, last_operation_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(user_id) DO UPDATE SET
       display_name = excluded.display_name,
       revision = excluded.revision,
       last_operation_key = excluded.last_operation_key,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
  ).bind(
    row.user_id,
    row.display_name,
    row.revision,
    row.last_operation_key,
    row.created_at,
    row.updated_at,
  );
}

function prepareRestoreRole(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, last_operation_key,
       created_at, updated_at, revoked_at, revoked_by_user_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  ).bind(
    row.id,
    row.user_id,
    row.role_key,
    row.assigned_by_user_id,
    row.last_operation_key,
    row.created_at,
    row.updated_at,
    row.revoked_at,
    row.revoked_by_user_id,
  );
}

function prepareRestoreAudit(row: D1Row): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_events
      (id, actor_user_id, action, subject_type, subject_id, idempotency_key,
       request_fingerprint, request_id, details_json, result_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  ).bind(
    row.id,
    row.actor_user_id,
    row.action,
    row.subject_type,
    row.subject_id,
    row.idempotency_key,
    row.request_fingerprint,
    row.request_id,
    row.details_json,
    row.result_json,
    row.created_at,
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function cleanupRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  const runId = requireCleanupInput(await readJsonMutation(request));
  const facts = factsForRun(runId);
  const snapshot = await readSnapshot(runId);
  const ownerUserId =
    snapshot.owner.user && typeof snapshot.owner.user.id === "string"
      ? snapshot.owner.user.id
      : null;
  const createdArtistRevisions = await allRows(
    `SELECT json_extract(result_json, '$.revisionId') AS revision_id
     FROM audit_events
     WHERE action = 'artist.draft.save'
       AND idempotency_key LIKE ?1`,
    [`%:m2-${facts.runId}-%`],
  );

  const statements: D1PreparedStatement[] = [
    prepareRestoreArtist(snapshot.artistConfig),
    prepareRestoreContactModule(snapshot.contactModule),
    prepareRestoreModuleRegistry(snapshot.moduleRegistry),
    ...snapshot.navigationSets.map(prepareRestoreNavigation),
    prepareRestoreInstallation(snapshot.installation),
    env.DB.prepare(`DELETE FROM role_assignments WHERE role_key = 'owner'`),
    env.DB.prepare(`DELETE FROM pages WHERE slug = ?1`).bind(facts.slug),
    env.DB.prepare(`DELETE FROM navigation_items WHERE item_key LIKE ?1`).bind(
      `${facts.itemKeyPrefix}-%`,
    ),
    ...createdArtistRevisions.flatMap(({ revision_id }) =>
      typeof revision_id === "string"
        ? [
            env.DB.prepare(
              `DELETE FROM artist_config_revisions WHERE id = ?1`,
            ).bind(revision_id),
          ]
        : [],
    ),
    env.DB.prepare(
      `DELETE FROM audit_events
       WHERE idempotency_key LIKE ?1 OR id = 'audit_owner_bootstrap'`,
    ).bind(`%:m2-${facts.runId}-%`),
    env.DB.prepare(
      `DELETE FROM users
       WHERE normalized_email IN (?1, ?2, ?3)`,
    ).bind(facts.customerEmail, facts.editorEmail, facts.disabledEmail),
  ];

  const currentOwner = await firstRow(
    `SELECT id FROM users WHERE normalized_email = ?1 LIMIT 1`,
    [OWNER_EMAIL],
  );
  const currentOwnerId =
    currentOwner && typeof currentOwner.id === "string"
      ? currentOwner.id
      : null;
  if (ownerUserId) {
    statements.push(
      prepareRestoreOwnerUser(snapshot.owner.user!),
      env.DB.prepare(`DELETE FROM role_assignments WHERE user_id = ?1`).bind(
        ownerUserId,
      ),
    );
    if (snapshot.owner.profile) {
      statements.push(prepareRestoreOwnerProfile(snapshot.owner.profile));
    } else {
      statements.push(
        env.DB.prepare(`DELETE FROM profiles WHERE user_id = ?1`).bind(
          ownerUserId,
        ),
      );
    }
  } else if (currentOwnerId) {
    statements.push(
      env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(currentOwnerId),
    );
  }
  statements.push(...snapshot.owner.roles.map(prepareRestoreRole));
  if (snapshot.ownerBootstrapAudit) {
    statements.push(prepareRestoreAudit(snapshot.ownerBootstrapAudit));
  }
  statements.push(
    env.DB.prepare(`DELETE FROM runtime_proofs WHERE key = ?1`).bind(
      `${SNAPSHOT_PREFIX}${facts.runId}`,
    ),
  );

  await runAtomicBatch(env.DB, statements);

  const restored = await captureSnapshot(runId);
  if (canonicalJson(restored) !== canonicalJson(snapshot)) {
    throw runtimeError(
      "M2_RUNTIME_RESTORE_FAILED",
      "The Milestone 2 runtime state was not restored exactly.",
      500,
    );
  }

  const artifactRows = await firstRow(
    `SELECT
       (SELECT COUNT(*) FROM pages WHERE slug = ?1) +
       (SELECT COUNT(*) FROM users
        WHERE normalized_email IN (?2, ?3, ?4)) +
       (SELECT COUNT(*) FROM navigation_items WHERE item_key LIKE ?5) +
       (SELECT COUNT(*) FROM audit_events WHERE idempotency_key LIKE ?6) +
       (SELECT COUNT(*) FROM runtime_proofs WHERE key = ?7) AS retained`,
    [
      facts.slug,
      facts.customerEmail,
      facts.editorEmail,
      facts.disabledEmail,
      `${facts.itemKeyPrefix}-%`,
      `%:m2-${facts.runId}-%`,
      `${SNAPSHOT_PREFIX}${facts.runId}`,
    ],
  );
  let retained = artifactRows ? integerField(artifactRows, "retained") : 1;
  for (const row of createdArtistRevisions) {
    if (typeof row.revision_id !== "string") continue;
    const revision = await firstRow(
      `SELECT COUNT(*) AS retained
       FROM artist_config_revisions
       WHERE id = ?1`,
      [row.revision_id],
    );
    retained += revision ? integerField(revision, "retained") : 1;
  }
  if (retained !== 0) {
    throw runtimeError(
      "M2_RUNTIME_CLEANUP_FAILED",
      "The Milestone 2 runtime rows were not fully removed.",
      500,
    );
  }

  return apiJson(
    {
      cleanup: {
        restored: true,
        retainedVerificationRows: retained,
        r2ObjectsTouched: 0,
        temporaryFilesCreated: 0,
      },
    },
    requestId,
  );
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("runtime.m2_begin_failed", async (requestId) => {
    requireLab();
    return beginRun(request, requestId);
  });
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute("runtime.m2_read_failed", async (requestId) => {
    requireLab();
    const runId = new URL(request.url).searchParams.get("run");
    if (!runId) {
      throw runtimeError("INVALID_INPUT", "Provide a runtime run ID.", 400);
    }
    return readRunState(factsForRun(runId).runId, requestId);
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return runApiRoute("runtime.m2_cleanup_failed", async (requestId) => {
    requireLab();
    requireSameOrigin(request);
    return cleanupRun(request, requestId);
  });
}
