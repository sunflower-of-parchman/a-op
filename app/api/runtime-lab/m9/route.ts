import { env } from "cloudflare:workers";
import { runAtomicBatch } from "@/db/d1.ts";
import { readSetupSourceState } from "@/db/setup-source-state.ts";
import {
  readJsonMutation,
  requireSameOrigin,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError, resolveSimulationMode } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

const SNAPSHOT_PREFIX = "m9-runtime-snapshot:";
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COUNT_KEYS = [
  "users",
  "profiles",
  "roleAssignments",
  "editorPermissions",
  "artistConfigRevisions",
  "artistModules",
  "navigationItems",
  "tracks",
  "trackRevisions",
  "releases",
  "releaseRevisions",
  "releaseTracks",
  "collections",
  "collectionRevisions",
  "collectionTracks",
  "accessPlans",
  "accessPlanItems",
  "accessGrantTemplates",
  "membershipPlans",
  "membershipPlanRevisions",
  "subscriptionPlans",
  "membershipCreditRules",
  "commerceBindingIntents",
  "licenseTerms",
  "licenseTermsVersions",
  "licenseOptions",
  "courses",
  "courseRevisions",
  "courseSections",
  "lessons",
  "lessonItems",
  "videos",
  "videoRevisions",
  "videoTranscripts",
  "contactForms",
  "contactConsentVersions",
  "telemetrySettings",
  "legalDocumentVersions",
  "auditEvents",
  "setupApplications",
  "exportManifests",
  "mediaObjects",
  "mediaJobs",
  "runtimeProofs",
] as const;

type D1Scalar = string | number | null;
type D1Row = Record<string, D1Scalar>;
type CountKey = (typeof COUNT_KEYS)[number];
type TableCounts = Readonly<Record<CountKey, number>>;

interface RunFacts {
  readonly runId: string;
  readonly shortId: string;
  readonly ownerId: string;
  readonly ownerEmail: string;
  readonly ownerDisplayName: string;
  readonly ownerRoleId: string;
  readonly ownerAlias: string;
  readonly editorEmail: string;
  readonly editorDisplayName: string;
  readonly proposalId: string;
  readonly approvalId: string;
  readonly artistName: string;
  readonly artistHeadline: string;
  readonly artistIntroduction: string;
  readonly artistFooterText: string;
  readonly rightsStatement: string;
  readonly trackId: string;
  readonly initialTrackRevisionId: string;
  readonly trackKey: string;
  readonly trackTitle: string;
  readonly releaseKey: string;
  readonly releaseTitle: string;
  readonly collectionKey: string;
  readonly collectionTitle: string;
  readonly accessPlanKey: string;
  readonly accessPlanLabel: string;
  readonly grantKey: string;
  readonly grantLabel: string;
  readonly membershipPlanKey: string;
  readonly membershipPlanName: string;
  readonly subscriptionPlanKey: string;
  readonly subscriptionPlanName: string;
  readonly licenseTermsKey: string;
  readonly licenseTermsTitle: string;
  readonly licenseOptionKey: string;
  readonly licenseOptionLabel: string;
  readonly courseKey: string;
  readonly courseTitle: string;
  readonly lessonKey: string;
  readonly lessonTitle: string;
  readonly videoKey: string;
  readonly videoTitle: string;
  readonly videoTranscript: string;
  readonly contactEmail: string;
  readonly contactInvitation: string;
  readonly contactConsent: string;
  readonly privacyBody: string;
  readonly termsBody: string;
}

interface MutableBaseline {
  readonly artistConfig: readonly D1Row[];
  readonly artistModules: readonly D1Row[];
  readonly moduleRegistryState: readonly D1Row[];
  readonly navigationSets: readonly D1Row[];
  readonly legalDocuments: readonly D1Row[];
  readonly contactForms: readonly D1Row[];
  readonly telemetrySettings: readonly D1Row[];
  readonly setupState: readonly D1Row[];
}

interface M9Snapshot {
  readonly version: 1;
  readonly run: RunFacts;
  readonly baselineCounts: TableCounts;
  readonly baselineSourceFingerprint: string;
  readonly baseline: MutableBaseline;
}

const RESTORE_DEFINITIONS = Object.freeze({
  artist_config: Object.freeze({
    primaryKey: "id",
    columns: Object.freeze([
      "id",
      "draft_revision_id",
      "published_revision_id",
      "version",
      "last_operation_key",
      "created_at",
      "updated_at",
      "published_at",
    ]),
  }),
  artist_modules: Object.freeze({
    primaryKey: "module_key",
    columns: Object.freeze([
      "module_key",
      "active",
      "revision",
      "settings_json",
      "activated_at",
      "deactivated_at",
      "updated_by_user_id",
      "created_at",
      "updated_at",
    ]),
  }),
  module_registry_state: Object.freeze({
    primaryKey: "id",
    columns: Object.freeze([
      "id",
      "revision",
      "last_operation_key",
      "updated_at",
    ]),
  }),
  navigation_sets: Object.freeze({
    primaryKey: "id",
    columns: Object.freeze([
      "id",
      "label",
      "draft_version",
      "published_version",
      "revision",
      "last_operation_key",
      "created_at",
      "updated_at",
      "published_at",
    ]),
  }),
  legal_documents: Object.freeze({
    primaryKey: "id",
    columns: Object.freeze([
      "id",
      "title",
      "draft_version_id",
      "approved_version_id",
      "published_version_id",
      "current_version",
      "revision",
      "last_operation_key",
      "published_at",
      "created_at",
      "updated_at",
    ]),
  }),
  contact_forms: Object.freeze({
    primaryKey: "id",
    columns: Object.freeze([
      "id",
      "form_key",
      "title",
      "description",
      "booking_information",
      "public_contact_details",
      "categories_json",
      "state",
      "current_consent_version",
      "delivery_adapter",
      "revision",
      "last_operation_key",
      "created_at",
      "updated_at",
    ]),
  }),
  telemetry_settings: Object.freeze({
    primaryKey: "id",
    columns: Object.freeze([
      "id",
      "collection_mode",
      "retention_days",
      "meaningful_listen_seconds",
      "revision",
      "updated_by_user_id",
      "last_operation_key",
      "created_at",
      "updated_at",
    ]),
  }),
  setup_state: Object.freeze({
    primaryKey: "id",
    columns: Object.freeze([
      "id",
      "status",
      "proposal_schema_version",
      "last_proposal_hash",
      "last_application_id",
      "state_fingerprint",
      "revision",
      "last_operation_key",
      "updated_by_user_id",
      "created_at",
      "updated_at",
    ]),
  }),
} as const);

type RestoreTable = keyof typeof RESTORE_DEFINITIONS;

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

function requireRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_ID_PATTERN.test(value)) {
    throw runtimeError("INVALID_INPUT", "Provide a valid runtime run ID.", 400);
  }
  return value;
}

function requireCleanupInput(value: unknown): string {
  const input = requireExactObject(value, ["runId"]);
  return requireRunId(input.runId);
}

function factsForRun(runId: string): RunFacts {
  const shortId = runId.replaceAll("-", "").slice(0, 12);
  return Object.freeze({
    runId,
    shortId,
    ownerId: `user_m9_owner_${shortId}`,
    ownerEmail: `m9-owner-${shortId}@a-op.invalid`,
    ownerDisplayName: `Fictional M9 Owner ${shortId}`,
    ownerRoleId: `role_m9_owner_${shortId}`,
    ownerAlias: `m9-owner-${shortId}`,
    editorEmail: `m9-editor-${shortId}@a-op.invalid`,
    editorDisplayName: `Fictional M9 Editor ${shortId}`,
    proposalId: `m9-setup-${shortId}`,
    approvalId: `m9-approval-${shortId}`,
    artistName: `Fictional M9 Artist ${shortId}`,
    artistHeadline: `Fictional music setup ${shortId}`,
    artistIntroduction: `A fictional artist installation applied through the Milestone 9 setup journey ${shortId}.`,
    artistFooterText: `Fictional artist-owned definitions verified for ${shortId}.`,
    rightsStatement: `Fictional rights confirmation for the local Milestone 9 journey ${shortId}.`,
    trackId: `track_m9_${shortId}`,
    initialTrackRevisionId: `track_revision_m9_${shortId}_initial`,
    trackKey: `m9-track-${shortId}`,
    trackTitle: "Track",
    releaseKey: `m9-release-${shortId}`,
    releaseTitle: `Fictional M9 Release ${shortId}`,
    collectionKey: `m9-collection-${shortId}`,
    collectionTitle: `Fictional M9 Collection ${shortId}`,
    accessPlanKey: `m9-access-${shortId}`,
    accessPlanLabel: `Fictional supporter access ${shortId}`,
    grantKey: `m9-grant-${shortId}`,
    grantLabel: `Fictional gift access ${shortId}`,
    membershipPlanKey: `m9-membership-${shortId}`,
    membershipPlanName: `Fictional supporter membership ${shortId}`,
    subscriptionPlanKey: `m9-subscription-${shortId}`,
    subscriptionPlanName: `Fictional monthly subscription ${shortId}`,
    licenseTermsKey: `m9-license-terms-${shortId}`,
    licenseTermsTitle: `Fictional M9 License Terms ${shortId}`,
    licenseOptionKey: `m9-license-option-${shortId}`,
    licenseOptionLabel: `Fictional online video license ${shortId}`,
    courseKey: `m9-course-${shortId}`,
    courseTitle: `Fictional M9 Course ${shortId}`,
    lessonKey: `m9-lesson-${shortId}`,
    lessonTitle: `Fictional text lesson ${shortId}`,
    videoKey: `m9-video-${shortId}`,
    videoTitle: `Fictional external video ${shortId}`,
    videoTranscript: `Fictional transcript for the local Milestone 9 journey ${shortId}.`,
    contactEmail: `m9-contact-${shortId}@a-op.invalid`,
    contactInvitation: `Send a fictional inquiry for ${shortId}.`,
    contactConsent: `I agree to store this fictional inquiry for ${shortId}.`,
    privacyBody: `Fictional privacy language for the Milestone 9 setup journey ${shortId}. Artist review remains required.`,
    termsBody: `Fictional terms for the Milestone 9 setup journey ${shortId}. Artist review remains required.`,
  });
}

async function firstRow<T>(
  sql: string,
  bindings: readonly D1Scalar[] = [],
): Promise<T | null> {
  return env.DB.prepare(sql)
    .bind(...bindings)
    .first<T>();
}

async function rows(
  sql: string,
  bindings: readonly D1Scalar[] = [],
): Promise<readonly D1Row[]> {
  const result = await env.DB.prepare(sql)
    .bind(...bindings)
    .all<D1Row>();
  if (!result.success) {
    throw runtimeError(
      "M9_RUNTIME_STATE_INVALID",
      "The Milestone 9 runtime state is unavailable.",
      500,
    );
  }
  return Object.freeze(result.results.map((row) => Object.freeze({ ...row })));
}

function countValue(row: D1Row, key: CountKey): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw runtimeError(
      "M9_RUNTIME_STATE_INVALID",
      "The Milestone 9 runtime state contains an invalid table count.",
      500,
    );
  }
  return value as number;
}

async function readTableCounts(): Promise<TableCounts> {
  const row = await firstRow<D1Row>(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM profiles) AS profiles,
       (SELECT COUNT(*) FROM role_assignments) AS roleAssignments,
       (SELECT COUNT(*) FROM editor_permissions) AS editorPermissions,
       (SELECT COUNT(*) FROM artist_config_revisions) AS artistConfigRevisions,
       (SELECT COUNT(*) FROM artist_modules) AS artistModules,
       (SELECT COUNT(*) FROM navigation_items) AS navigationItems,
       (SELECT COUNT(*) FROM tracks) AS tracks,
       (SELECT COUNT(*) FROM track_revisions) AS trackRevisions,
       (SELECT COUNT(*) FROM releases) AS releases,
       (SELECT COUNT(*) FROM release_revisions) AS releaseRevisions,
       (SELECT COUNT(*) FROM release_tracks) AS releaseTracks,
       (SELECT COUNT(*) FROM collections) AS collections,
       (SELECT COUNT(*) FROM collection_revisions) AS collectionRevisions,
       (SELECT COUNT(*) FROM collection_tracks) AS collectionTracks,
       (SELECT COUNT(*) FROM access_plans) AS accessPlans,
       (SELECT COUNT(*) FROM access_plan_items) AS accessPlanItems,
       (SELECT COUNT(*) FROM access_grant_templates) AS accessGrantTemplates,
       (SELECT COUNT(*) FROM membership_plans) AS membershipPlans,
       (SELECT COUNT(*) FROM membership_plan_revisions) AS membershipPlanRevisions,
       (SELECT COUNT(*) FROM subscription_plans) AS subscriptionPlans,
       (SELECT COUNT(*) FROM membership_credit_rules) AS membershipCreditRules,
       (SELECT COUNT(*) FROM commerce_binding_intents) AS commerceBindingIntents,
       (SELECT COUNT(*) FROM license_terms) AS licenseTerms,
       (SELECT COUNT(*) FROM license_terms_versions) AS licenseTermsVersions,
       (SELECT COUNT(*) FROM license_options) AS licenseOptions,
       (SELECT COUNT(*) FROM courses) AS courses,
       (SELECT COUNT(*) FROM course_revisions) AS courseRevisions,
       (SELECT COUNT(*) FROM course_sections) AS courseSections,
       (SELECT COUNT(*) FROM lessons) AS lessons,
       (SELECT COUNT(*) FROM lesson_items) AS lessonItems,
       (SELECT COUNT(*) FROM videos) AS videos,
       (SELECT COUNT(*) FROM video_revisions) AS videoRevisions,
       (SELECT COUNT(*) FROM video_transcripts) AS videoTranscripts,
       (SELECT COUNT(*) FROM contact_forms) AS contactForms,
       (SELECT COUNT(*) FROM contact_consent_versions) AS contactConsentVersions,
       (SELECT COUNT(*) FROM telemetry_settings) AS telemetrySettings,
       (SELECT COUNT(*) FROM legal_document_versions) AS legalDocumentVersions,
       (SELECT COUNT(*) FROM audit_events) AS auditEvents,
       (SELECT COUNT(*) FROM setup_applications) AS setupApplications,
       (SELECT COUNT(*) FROM export_manifests) AS exportManifests,
       (SELECT COUNT(*) FROM media_objects) AS mediaObjects,
       (SELECT COUNT(*) FROM media_jobs) AS mediaJobs,
       (SELECT COUNT(*) FROM runtime_proofs) AS runtimeProofs`,
  );
  if (!row) {
    throw runtimeError(
      "M9_RUNTIME_STATE_INVALID",
      "The Milestone 9 runtime table counts are unavailable.",
      500,
    );
  }
  return Object.freeze(
    Object.fromEntries(
      COUNT_KEYS.map((key) => [key, countValue(row, key)]),
    ) as Record<CountKey, number>,
  );
}

async function readMutableBaseline(): Promise<MutableBaseline> {
  const [
    artistConfig,
    artistModules,
    moduleRegistryState,
    navigationSets,
    legalDocuments,
    contactForms,
    telemetrySettings,
    setupState,
  ] = await Promise.all([
    rows(`SELECT id, draft_revision_id, published_revision_id, version,
                 last_operation_key, created_at, updated_at, published_at
          FROM artist_config ORDER BY id`),
    rows(`SELECT module_key, active, revision, settings_json, activated_at,
                 deactivated_at, updated_by_user_id, created_at, updated_at
          FROM artist_modules ORDER BY module_key`),
    rows(`SELECT id, revision, last_operation_key, updated_at
          FROM module_registry_state ORDER BY id`),
    rows(`SELECT id, label, draft_version, published_version, revision,
                 last_operation_key, created_at, updated_at, published_at
          FROM navigation_sets ORDER BY id`),
    rows(`SELECT id, title, draft_version_id, approved_version_id,
                 published_version_id, current_version, revision,
                 last_operation_key, published_at, created_at, updated_at
          FROM legal_documents ORDER BY id`),
    rows(`SELECT id, form_key, title, description, booking_information,
                 public_contact_details, categories_json, state,
                 current_consent_version, delivery_adapter, revision,
                 last_operation_key, created_at, updated_at
          FROM contact_forms ORDER BY id`),
    rows(`SELECT id, collection_mode, retention_days,
                 meaningful_listen_seconds, revision, updated_by_user_id,
                 last_operation_key, created_at, updated_at
          FROM telemetry_settings ORDER BY id`),
    rows(`SELECT id, status, proposal_schema_version, last_proposal_hash,
                 last_application_id, state_fingerprint, revision,
                 last_operation_key, updated_by_user_id, created_at, updated_at
          FROM setup_state ORDER BY id`),
  ]);
  return Object.freeze({
    artistConfig,
    artistModules,
    moduleRegistryState,
    navigationSets,
    legalDocuments,
    contactForms,
    telemetrySettings,
    setupState,
  });
}

function validSnapshotRows(value: unknown): value is readonly D1Row[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        isPlainRecord(row) &&
        Object.values(row).every(
          (entry) =>
            entry === null ||
            typeof entry === "string" ||
            typeof entry === "number",
        ),
    )
  );
}

function parseSnapshot(value: string): M9Snapshot {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw runtimeError(
      "M9_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 9 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  if (!isPlainRecord(candidate) || candidate.version !== 1) {
    throw runtimeError(
      "M9_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 9 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  const run = candidate.run;
  const counts = candidate.baselineCounts;
  const baseline = candidate.baseline;
  if (
    !isPlainRecord(run) ||
    !isPlainRecord(counts) ||
    !isPlainRecord(baseline) ||
    typeof run.runId !== "string" ||
    !RUN_ID_PATTERN.test(run.runId) ||
    typeof run.ownerId !== "string" ||
    !SAFE_ID.test(run.ownerId) ||
    typeof candidate.baselineSourceFingerprint !== "string" ||
    !SHA256.test(candidate.baselineSourceFingerprint) ||
    !validSnapshotRows(baseline.artistConfig) ||
    !validSnapshotRows(baseline.artistModules) ||
    !validSnapshotRows(baseline.moduleRegistryState) ||
    !validSnapshotRows(baseline.navigationSets) ||
    !validSnapshotRows(baseline.legalDocuments) ||
    !validSnapshotRows(baseline.contactForms) ||
    !validSnapshotRows(baseline.telemetrySettings) ||
    !validSnapshotRows(baseline.setupState)
  ) {
    throw runtimeError(
      "M9_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 9 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0) {
      throw runtimeError(
        "M9_RUNTIME_SNAPSHOT_INVALID",
        "The Milestone 9 runtime cleanup snapshot is invalid.",
        500,
      );
    }
  }
  return candidate as unknown as M9Snapshot;
}

async function readSnapshot(runId: string): Promise<M9Snapshot> {
  const row = await firstRow<{ value: string }>(
    "SELECT value FROM runtime_proofs WHERE key = ?1 LIMIT 1",
    [`${SNAPSHOT_PREFIX}${runId}`],
  );
  if (!row) unavailable();
  const snapshot = parseSnapshot(row.value);
  if (snapshot.run.runId !== runId) {
    throw runtimeError(
      "M9_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 9 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  return snapshot;
}

async function beginRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  requireSameOrigin(request);
  requireBeginInput(await readJsonMutation(request));
  const active = await firstRow<{ key: string }>(
    "SELECT key FROM runtime_proofs WHERE key LIKE ?1 LIMIT 1",
    [`${SNAPSHOT_PREFIX}%`],
  );
  if (active) {
    throw runtimeError(
      "M9_RUNTIME_RUN_ACTIVE",
      "A Milestone 9 runtime journey is already active.",
      409,
    );
  }

  const run = factsForRun(crypto.randomUUID());
  const [baselineCounts, baselineSource, baseline] = await Promise.all([
    readTableCounts(),
    readSetupSourceState(env.DB),
    readMutableBaseline(),
  ]);
  const snapshot: M9Snapshot = Object.freeze({
    version: 1,
    run,
    baselineCounts,
    baselineSourceFingerprint: baselineSource.fingerprint,
    baseline,
  });

  await runAtomicBatch(env.DB, [
    env.DB.prepare(
      `INSERT INTO runtime_proofs (key, value, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(`${SNAPSHOT_PREFIX}${run.runId}`, JSON.stringify(snapshot)),
    env.DB.prepare(
      `INSERT INTO users (id, email, normalized_email, status)
       VALUES (?1, ?2, ?2, 'active')`,
    ).bind(run.ownerId, run.ownerEmail),
    env.DB.prepare(
      `INSERT INTO profiles (user_id, display_name, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(run.ownerId, run.ownerDisplayName),
    env.DB.prepare(
      `INSERT INTO role_assignments
        (id, user_id, role_key, assigned_by_user_id)
       VALUES (?1, ?2, 'owner', ?2)`,
    ).bind(run.ownerRoleId, run.ownerId),
    env.DB.prepare(
      `INSERT INTO tracks
        (id, slug, draft_revision_id, published_revision_id,
         publication_state, version, last_operation_key, published_at)
       VALUES (?1, ?2, ?3, ?3, 'published', 1, ?4, CURRENT_TIMESTAMP)`,
    ).bind(
      run.trackId,
      run.trackKey,
      run.initialTrackRevisionId,
      `m9-runtime-fixture-${run.runId}`,
    ),
    env.DB.prepare(
      `INSERT INTO track_revisions
        (id, track_id, revision, title, subtitle, description, view_mode,
         stream_mode, download_mode, tags_json, created_by_user_id)
       VALUES (?1, ?2, 1, ?3, '', '', 'public', 'protected',
               'protected', '[]', ?4)`,
    ).bind(
      run.initialTrackRevisionId,
      run.trackId,
      run.trackTitle,
      run.ownerId,
    ),
  ]);

  return apiJson({ run }, requestId, 201);
}

async function readRunArtifacts(run: RunFacts): Promise<D1Row> {
  const row = await firstRow<D1Row>(
    `SELECT
       (SELECT COUNT(*) FROM runtime_proofs WHERE key = ?1) AS proofs,
       (SELECT COUNT(*) FROM users WHERE id = ?2) AS users,
       (SELECT COUNT(*) FROM profiles WHERE user_id = ?2) AS profiles,
       (SELECT COUNT(*) FROM users WHERE normalized_email = ?3) AS editorUsers,
       (SELECT COUNT(*) FROM profiles
        WHERE user_id IN (SELECT id FROM users WHERE normalized_email = ?3)) AS editorProfiles,
       (SELECT COUNT(*) FROM role_assignments
        WHERE user_id = ?2 OR user_id IN (
          SELECT id FROM users WHERE normalized_email = ?3
        )) AS roles,
       (SELECT COUNT(*) FROM editor_permissions
        WHERE assigned_by_user_id = ?2 OR user_id IN (
          SELECT id FROM users WHERE normalized_email = ?3
        )) AS editorPermissions,
       (SELECT COUNT(*) FROM artist_config_revisions
        WHERE created_by_user_id = ?2) AS artistRevisions,
       (SELECT COUNT(*) FROM navigation_items
        WHERE created_by_user_id = ?2) AS navigationItems,
       (SELECT COUNT(*) FROM tracks WHERE slug = ?4) AS tracks,
       (SELECT COUNT(*) FROM track_revisions
        WHERE track_id IN (SELECT id FROM tracks WHERE slug = ?4)) AS trackRevisions,
       (SELECT COUNT(*) FROM releases WHERE slug = ?5) AS releases,
       (SELECT COUNT(*) FROM release_revisions
        WHERE release_id IN (SELECT id FROM releases WHERE slug = ?5)) AS releaseRevisions,
       (SELECT COUNT(*) FROM release_tracks
        WHERE release_revision_id IN (
          SELECT revision.id FROM release_revisions AS revision
          JOIN releases AS release ON release.id = revision.release_id
          WHERE release.slug = ?5
        )) AS releaseTracks,
       (SELECT COUNT(*) FROM collections WHERE slug = ?6) AS collections,
       (SELECT COUNT(*) FROM collection_revisions
        WHERE collection_id IN (SELECT id FROM collections WHERE slug = ?6)) AS collectionRevisions,
       (SELECT COUNT(*) FROM collection_tracks
        WHERE collection_revision_id IN (
          SELECT revision.id FROM collection_revisions AS revision
          JOIN collections AS collection ON collection.id = revision.collection_id
          WHERE collection.slug = ?6
        )) AS collectionTracks,
       (SELECT COUNT(*) FROM access_plans WHERE slug = ?7) AS accessPlans,
       (SELECT COUNT(*) FROM access_plan_items
        WHERE access_plan_id IN (SELECT id FROM access_plans WHERE slug = ?7)) AS accessPlanItems,
       (SELECT COUNT(*) FROM access_grant_templates
        WHERE template_key = ?8) AS accessGrantTemplates,
       (SELECT COUNT(*) FROM membership_plans WHERE slug = ?9) AS membershipPlans,
       (SELECT COUNT(*) FROM membership_plan_revisions
        WHERE membership_plan_id IN (
          SELECT id FROM membership_plans WHERE slug = ?9
        )) AS membershipPlanRevisions,
       (SELECT COUNT(*) FROM subscription_plans WHERE slug = ?10) AS subscriptionPlans,
       (SELECT COUNT(*) FROM membership_credit_rules
        WHERE created_by_user_id = ?2) AS membershipCreditRules,
       (SELECT COUNT(*) FROM commerce_binding_intents
        WHERE created_by_user_id = ?2) AS commerceBindingIntents,
       (SELECT COUNT(*) FROM license_terms WHERE slug = ?11) AS licenseTerms,
       (SELECT COUNT(*) FROM license_terms_versions
        WHERE license_terms_id IN (
          SELECT id FROM license_terms WHERE slug = ?11
        )) AS licenseTermsVersions,
       (SELECT COUNT(*) FROM license_options
        WHERE license_terms_id IN (
          SELECT id FROM license_terms WHERE slug = ?11
        )) AS licenseOptions,
       (SELECT COUNT(*) FROM courses WHERE slug = ?12) AS courses,
       (SELECT COUNT(*) FROM course_revisions
        WHERE course_id IN (SELECT id FROM courses WHERE slug = ?12)) AS courseRevisions,
       (SELECT COUNT(*) FROM course_sections
        WHERE course_revision_id IN (
          SELECT revision.id FROM course_revisions AS revision
          JOIN courses AS course ON course.id = revision.course_id
          WHERE course.slug = ?12
        )) AS courseSections,
       (SELECT COUNT(*) FROM lessons
        WHERE course_revision_id IN (
          SELECT revision.id FROM course_revisions AS revision
          JOIN courses AS course ON course.id = revision.course_id
          WHERE course.slug = ?12
        )) AS lessons,
       (SELECT COUNT(*) FROM lesson_items
        WHERE lesson_id IN (
          SELECT lesson.id FROM lessons AS lesson
          JOIN course_revisions AS revision
            ON revision.id = lesson.course_revision_id
          JOIN courses AS course ON course.id = revision.course_id
          WHERE course.slug = ?12
        )) AS lessonItems,
       (SELECT COUNT(*) FROM videos WHERE slug = ?13) AS videos,
       (SELECT COUNT(*) FROM video_revisions
        WHERE video_id IN (SELECT id FROM videos WHERE slug = ?13)) AS videoRevisions,
       (SELECT COUNT(*) FROM video_transcripts
        WHERE video_revision_id IN (
          SELECT revision.id FROM video_revisions AS revision
          JOIN videos AS video ON video.id = revision.video_id
          WHERE video.slug = ?13
        )) AS videoTranscripts,
       (SELECT COUNT(*) FROM contact_forms
        WHERE public_contact_details = ?14) AS contactForms,
       (SELECT COUNT(*) FROM contact_consent_versions
        WHERE approved_by_user_id = ?2) AS contactConsentVersions,
       (SELECT COUNT(*) FROM telemetry_settings
        WHERE updated_by_user_id = ?2) AS telemetrySettings,
       (SELECT COUNT(*) FROM legal_document_versions
        WHERE created_by_user_id = ?2 OR approved_by_user_id = ?2) AS legalVersions,
       (SELECT COUNT(*) FROM audit_events
        WHERE actor_user_id = ?2) AS auditEvents,
       (SELECT COUNT(*) FROM audit_events
        WHERE actor_user_id = ?2 AND action = 'setup.operation.apply') AS setupReceipts,
       (SELECT COUNT(*) FROM setup_applications
        WHERE approved_by_user_id = ?2) AS setupApplications,
       (SELECT COUNT(*) FROM export_manifests
        WHERE exported_by_user_id = ?2) AS exportManifests,
       (SELECT COUNT(*) FROM media_objects
        WHERE owner_user_id = ?2) AS mediaObjects,
       (SELECT COUNT(*) FROM media_jobs
        WHERE requested_by_user_id = ?2) AS mediaJobs`,
    [
      `${SNAPSHOT_PREFIX}${run.runId}`,
      run.ownerId,
      run.editorEmail,
      run.trackKey,
      run.releaseKey,
      run.collectionKey,
      run.accessPlanKey,
      run.grantKey,
      run.membershipPlanKey,
      run.subscriptionPlanKey,
      run.licenseTermsKey,
      run.courseKey,
      run.videoKey,
      run.contactEmail,
    ],
  );
  if (!row) {
    throw runtimeError(
      "M9_RUNTIME_STATE_INVALID",
      "The Milestone 9 runtime artifacts are unavailable.",
      500,
    );
  }
  return row;
}

async function readRunDefinitions(run: RunFacts): Promise<unknown> {
  const [
    activeModules,
    primaryNavigation,
    footerNavigation,
    track,
    release,
    collection,
    accessPlan,
    grantTemplate,
    membershipPlan,
    subscriptionPlan,
    creditRules,
    commerceBindingIntents,
    licenseDefinition,
    course,
    video,
    contact,
    telemetry,
    legalDrafts,
    editor,
    rightsReceipt,
  ] = await Promise.all([
    rows(`SELECT module_key AS moduleKey
          FROM artist_modules
          WHERE active = 1
          ORDER BY module_key`),
    rows(`SELECT item.item_key AS navigationKey, item.label, item.href,
                 item.position, item.module_key AS moduleKey
          FROM navigation_sets AS navigation
          JOIN navigation_items AS item
            ON item.navigation_set_id = navigation.id
           AND item.version = navigation.published_version
          WHERE navigation.id = 'primary'
          ORDER BY item.position, item.item_key`),
    rows(`SELECT item.item_key AS navigationKey, item.label, item.href,
                 item.position, item.module_key AS moduleKey
          FROM navigation_sets AS navigation
          JOIN navigation_items AS item
            ON item.navigation_set_id = navigation.id
           AND item.version = navigation.published_version
          WHERE navigation.id = 'footer'
          ORDER BY item.position, item.item_key`),
    firstRow<D1Row>(
      `SELECT track.slug, track.publication_state AS publicationState,
              revision.revision, revision.title, revision.subtitle,
              revision.stream_mode AS streamMode,
              revision.download_mode AS downloadMode,
              revision.original_media_id AS originalMediaId,
              revision.streaming_derivative_id AS streamingDerivativeId,
              revision.download_derivative_id AS downloadDerivativeId
       FROM tracks AS track
       JOIN track_revisions AS revision
         ON revision.id = track.draft_revision_id
       WHERE track.slug = ?1
       LIMIT 1`,
      [run.trackKey],
    ),
    firstRow<D1Row>(
      `SELECT release.slug, release.publication_state AS publicationState,
              revision.title, revision.release_date AS releaseDate,
              COUNT(item.id) AS trackCount
       FROM releases AS release
       JOIN release_revisions AS revision
         ON revision.id = release.draft_revision_id
       LEFT JOIN release_tracks AS item
         ON item.release_revision_id = revision.id
       WHERE release.slug = ?1
       GROUP BY release.id, revision.id
       LIMIT 1`,
      [run.releaseKey],
    ),
    firstRow<D1Row>(
      `SELECT collection.slug,
              collection.publication_state AS publicationState,
              revision.title, COUNT(item.id) AS trackCount
       FROM collections AS collection
       JOIN collection_revisions AS revision
         ON revision.id = collection.draft_revision_id
       LEFT JOIN collection_tracks AS item
         ON item.collection_revision_id = revision.id
       WHERE collection.slug = ?1
       GROUP BY collection.id, revision.id
       LIMIT 1`,
      [run.collectionKey],
    ),
    firstRow<D1Row>(
      `SELECT plan.slug, plan.name, plan.state, plan.revision,
              item.resource_type AS resourceType,
              item.resource_id AS resourceId, item.actions_json AS actionsJson,
              track.slug AS trackKey
       FROM access_plans AS plan
       JOIN access_plan_items AS item ON item.access_plan_id = plan.id
       LEFT JOIN tracks AS track
         ON item.resource_type = 'track' AND track.id = item.resource_id
       WHERE plan.slug = ?1
       LIMIT 1`,
      [run.accessPlanKey],
    ),
    firstRow<D1Row>(
      `SELECT template.template_key AS grantKey, template.label,
              template.default_duration_days AS defaultDurationDays,
              template.state, template.revision, plan.slug AS accessPlanKey,
              template.access_plan_revision AS accessPlanRevision
       FROM access_grant_templates AS template
       JOIN access_plans AS plan ON plan.id = template.access_plan_id
       WHERE template.template_key = ?1
       LIMIT 1`,
      [run.grantKey],
    ),
    firstRow<D1Row>(
      `SELECT plan.slug, plan.state, revision.revision, revision.name,
              revision.description, revision.benefits_json AS benefitsJson,
              revision.download_credits AS downloadCredits,
              revision.license_credits AS licenseCredits,
              revision.duration_days AS durationDays,
              access.slug AS accessPlanKey
       FROM membership_plans AS plan
       JOIN membership_plan_revisions AS revision
         ON revision.membership_plan_id = plan.id
        AND revision.revision = plan.current_revision
       LEFT JOIN access_plans AS access ON access.id = revision.access_plan_id
       WHERE plan.slug = ?1
       LIMIT 1`,
      [run.membershipPlanKey],
    ),
    firstRow<D1Row>(
      `SELECT subscription.slug, subscription.name,
              subscription.description, subscription.billing_interval AS billingInterval,
              subscription.interval_count AS intervalCount,
              subscription.state, subscription.revision,
              membership.slug AS membershipPlanKey,
              subscription.membership_plan_revision AS membershipPlanRevision
       FROM subscription_plans AS subscription
       JOIN membership_plans AS membership
         ON membership.id = subscription.membership_plan_id
       WHERE subscription.slug = ?1
       LIMIT 1`,
      [run.subscriptionPlanKey],
    ),
    rows(
      `SELECT rule_key AS ruleKey, credit_kind AS creditKind, amount,
                 cadence, state, revision
          FROM membership_credit_rules
          WHERE created_by_user_id = ?1
          ORDER BY rule_key`,
      [run.ownerId],
    ),
    rows(
      `SELECT intent_key AS intentKey, intent_kind AS intentKind,
                 amount_minor AS amountMinor, currency,
                 billing_interval AS billingInterval,
                 interval_count AS intervalCount,
                 binding_state AS bindingState,
                 stripe_environment AS stripeEnvironment, livemode,
                 commerce_product_id AS commerceProductId,
                 commerce_price_id AS commercePriceId
          FROM commerce_binding_intents
          WHERE created_by_user_id = ?1
          ORDER BY intent_key`,
      [run.ownerId],
    ),
    firstRow<D1Row>(
      `SELECT terms.slug, terms.state, version.version, version.title,
              version.general_terms AS body, option.option_key AS optionKey,
              option.label AS optionLabel,
              option.usage_category AS usageCategory,
              option.allowed_media_json AS allowedMediaJson,
              option.license_credit_cost AS licenseCreditCost,
              option.includes_track_download AS includesTrackDownload
       FROM license_terms AS terms
       JOIN license_terms_versions AS version
         ON version.license_terms_id = terms.id
        AND version.version = terms.current_version
       JOIN license_options AS option
         ON option.license_terms_version_id = version.id
        AND option.option_key = ?2
       WHERE terms.slug = ?1
       LIMIT 1`,
      [run.licenseTermsKey, run.licenseOptionKey],
    ),
    firstRow<D1Row>(
      `SELECT course.slug, course.publication_state AS publicationState,
              revision.title, revision.description,
              revision.access_mode AS accessMode,
              access.slug AS accessPlanKey, lesson.lesson_key AS lessonKey,
              lesson.title AS lessonTitle, lesson.summary AS lessonSummary,
              COUNT(item.id) AS lessonItemCount,
              MAX(item.item_type) AS lessonItemType,
              MAX(item.media_derivative_id) AS lessonMediaDerivativeId
       FROM courses AS course
       JOIN course_revisions AS revision
         ON revision.id = course.published_revision_id
       LEFT JOIN access_plans AS access ON access.id = revision.access_plan_id
       JOIN lessons AS lesson ON lesson.course_revision_id = revision.id
       LEFT JOIN lesson_items AS item ON item.lesson_id = lesson.id
       WHERE course.slug = ?1 AND lesson.lesson_key = ?2
       GROUP BY course.id, revision.id, lesson.id
       LIMIT 1`,
      [run.courseKey, run.lessonKey],
    ),
    firstRow<D1Row>(
      `SELECT video.slug, video.publication_state AS publicationState,
              revision.title, revision.summary,
              revision.delivery_kind AS deliveryKind,
              revision.external_provider AS externalProvider,
              revision.external_embed_url AS externalEmbedUrl,
              transcript.language, transcript.transcript_text AS transcriptText,
              revision.hosted_derivative_id AS hostedDerivativeId,
              revision.poster_derivative_id AS posterDerivativeId,
              transcript.captions_derivative_id AS captionsDerivativeId
       FROM videos AS video
       JOIN video_revisions AS revision
         ON revision.id = video.published_revision_id
       JOIN video_transcripts AS transcript
         ON transcript.video_revision_id = revision.id
       WHERE video.slug = ?1
       LIMIT 1`,
      [run.videoKey],
    ),
    firstRow<D1Row>(
      `SELECT form.form_key AS formKey, form.title, form.description,
              form.public_contact_details AS publicContactDetails,
              form.categories_json AS categoriesJson, form.state,
              form.delivery_adapter AS deliveryAdapter,
              consent.version AS consentVersion,
              consent.consent_text AS consentText
       FROM contact_forms AS form
       JOIN contact_consent_versions AS consent
         ON consent.contact_form_id = form.id
        AND consent.version = form.current_consent_version
       WHERE form.public_contact_details = ?1
       LIMIT 1`,
      [run.contactEmail],
    ),
    firstRow<D1Row>(
      `SELECT collection_mode AS collectionMode,
              retention_days AS retentionDays,
              meaningful_listen_seconds AS meaningfulListenSeconds,
              revision
       FROM telemetry_settings
       WHERE id = 'telemetry'
       LIMIT 1`,
    ),
    rows(`SELECT document.id, version.title, version.body_text AS body,
                 document.current_version AS currentVersion
          FROM legal_documents AS document
          JOIN legal_document_versions AS version
            ON version.id = document.draft_version_id
          WHERE document.id IN ('privacy', 'terms')
          ORDER BY document.id`),
    firstRow<D1Row>(
      `SELECT user.normalized_email AS email, profile.display_name AS displayName,
              role.role_key AS roleKey,
              permission.permission_key AS permissionKey,
              permission.scope_id AS scopeId
       FROM users AS user
       JOIN profiles AS profile ON profile.user_id = user.id
       JOIN role_assignments AS role
         ON role.user_id = user.id AND role.role_key = 'editor'
        AND role.revoked_at IS NULL
       JOIN editor_permissions AS permission
         ON permission.user_id = user.id AND permission.revoked_at IS NULL
       WHERE user.normalized_email = ?1
       LIMIT 1`,
      [run.editorEmail],
    ),
    firstRow<D1Row>(
      `SELECT result_json AS resultJson
       FROM audit_events
       WHERE actor_user_id = ?1
         AND action = 'setup.operation.apply'
         AND json_extract(details_json, '$.topic') = 'rights-media'
       LIMIT 1`,
      [run.ownerId],
    ),
  ]);
  return Object.freeze({
    activeModules,
    primaryNavigation,
    footerNavigation,
    track,
    release,
    collection,
    accessPlan,
    grantTemplate,
    membershipPlan,
    subscriptionPlan,
    creditRules,
    commerceBindingIntents,
    licenseDefinition,
    course,
    video,
    contact,
    telemetry,
    legalDrafts,
    editor,
    rightsReceipt,
  });
}

async function readRunState(
  runId: string,
  requestId: string,
): Promise<Response> {
  const snapshot = await readSnapshot(runId);
  const source = await readSetupSourceState(env.DB);
  return apiJson(
    {
      run: snapshot.run,
      state: {
        currentCounts: await readTableCounts(),
        artifacts: await readRunArtifacts(snapshot.run),
        definitions: await readRunDefinitions(snapshot.run),
        sourceFingerprint: source.fingerprint,
        stripeEnvironment: "test",
        livemode: false,
        statement: "No real payment will be accepted.",
      },
    },
    requestId,
  );
}

function snapshotValue(row: D1Row, column: string): D1Scalar {
  if (!Object.hasOwn(row, column)) {
    throw runtimeError(
      "M9_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 9 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  const value = row[column];
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  throw runtimeError(
    "M9_RUNTIME_SNAPSHOT_INVALID",
    "The Milestone 9 runtime cleanup snapshot is invalid.",
    500,
  );
}

function restoreStatements(
  table: RestoreTable,
  baselineRows: readonly D1Row[],
): D1PreparedStatement[] {
  const definition = RESTORE_DEFINITIONS[table];
  const updateColumns = definition.columns.filter(
    (column) => column !== definition.primaryKey,
  );
  return baselineRows.map((row) =>
    env.DB.prepare(
      `UPDATE ${table}
       SET ${updateColumns.map((column) => `${column} = ?`).join(", ")}
       WHERE ${definition.primaryKey} = ?`,
    ).bind(
      ...updateColumns.map((column) => snapshotValue(row, column)),
      snapshotValue(row, definition.primaryKey),
    ),
  );
}

function countsEqual(left: TableCounts, right: TableCounts): boolean {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

function statesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function cleanupRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  requireSameOrigin(request);
  const runId = requireCleanupInput(await readJsonMutation(request));
  const snapshot = await readSnapshot(runId);
  const { run, baseline } = snapshot;
  const contactExisted = baseline.contactForms.some(
    (row) => row.form_key === "contact",
  );

  await runAtomicBatch(env.DB, [
    ...restoreStatements("artist_config", baseline.artistConfig),
    ...restoreStatements("artist_modules", baseline.artistModules),
    ...restoreStatements("module_registry_state", baseline.moduleRegistryState),
    ...restoreStatements("navigation_sets", baseline.navigationSets),
    ...restoreStatements("legal_documents", baseline.legalDocuments),
    ...restoreStatements("contact_forms", baseline.contactForms),
    ...restoreStatements("telemetry_settings", baseline.telemetrySettings),
    ...restoreStatements("setup_state", baseline.setupState),
    env.DB.prepare(
      "DELETE FROM export_manifests WHERE exported_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare(
      "DELETE FROM setup_applications WHERE approved_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare(
      "DELETE FROM commerce_binding_intents WHERE created_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare(
      "DELETE FROM membership_credit_rules WHERE created_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare(
      "DELETE FROM subscription_plans WHERE created_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare(
      "DELETE FROM membership_plan_revisions WHERE created_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare(
      "DELETE FROM membership_plans WHERE created_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare(
      `DELETE FROM license_options
       WHERE license_terms_id IN (
         SELECT id FROM license_terms WHERE slug = ?1
       )`,
    ).bind(run.licenseTermsKey),
    env.DB.prepare(
      `DELETE FROM license_terms_versions
       WHERE license_terms_id IN (
         SELECT id FROM license_terms WHERE slug = ?1
       )`,
    ).bind(run.licenseTermsKey),
    env.DB.prepare("DELETE FROM license_terms WHERE slug = ?1").bind(
      run.licenseTermsKey,
    ),
    env.DB.prepare("DELETE FROM videos WHERE slug = ?1").bind(run.videoKey),
    env.DB.prepare("DELETE FROM courses WHERE slug = ?1").bind(run.courseKey),
    env.DB.prepare(
      "DELETE FROM access_grant_templates WHERE template_key = ?1",
    ).bind(run.grantKey),
    env.DB.prepare(
      `DELETE FROM access_plan_items
       WHERE access_plan_id IN (
         SELECT id FROM access_plans WHERE slug = ?1
       )`,
    ).bind(run.accessPlanKey),
    env.DB.prepare("DELETE FROM access_plans WHERE slug = ?1").bind(
      run.accessPlanKey,
    ),
    env.DB.prepare("DELETE FROM releases WHERE slug = ?1").bind(run.releaseKey),
    env.DB.prepare("DELETE FROM collections WHERE slug = ?1").bind(
      run.collectionKey,
    ),
    env.DB.prepare("DELETE FROM tracks WHERE slug = ?1").bind(run.trackKey),
    env.DB.prepare(
      "DELETE FROM contact_consent_versions WHERE approved_by_user_id = ?1",
    ).bind(run.ownerId),
    ...(contactExisted
      ? []
      : [
          env.DB.prepare(
            "DELETE FROM contact_forms WHERE form_key = 'contact' AND public_contact_details = ?1",
          ).bind(run.contactEmail),
        ]),
    env.DB.prepare(
      `DELETE FROM legal_document_versions
       WHERE created_by_user_id = ?1 OR approved_by_user_id = ?1`,
    ).bind(run.ownerId),
    env.DB.prepare(
      "DELETE FROM navigation_items WHERE created_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare(
      "DELETE FROM artist_config_revisions WHERE created_by_user_id = ?1",
    ).bind(run.ownerId),
    env.DB.prepare("DELETE FROM audit_events WHERE actor_user_id = ?1").bind(
      run.ownerId,
    ),
    env.DB.prepare(
      `DELETE FROM editor_permissions
       WHERE assigned_by_user_id = ?1 OR user_id IN (
         SELECT id FROM users WHERE normalized_email = ?2
       )`,
    ).bind(run.ownerId, run.editorEmail),
    env.DB.prepare(
      `DELETE FROM role_assignments
       WHERE assigned_by_user_id = ?1 OR user_id = ?1 OR user_id IN (
         SELECT id FROM users WHERE normalized_email = ?2
       )`,
    ).bind(run.ownerId, run.editorEmail),
    env.DB.prepare(
      `DELETE FROM profiles
       WHERE user_id = ?1 OR user_id IN (
         SELECT id FROM users WHERE normalized_email = ?2
       )`,
    ).bind(run.ownerId, run.editorEmail),
    env.DB.prepare(
      "DELETE FROM users WHERE id = ?1 OR normalized_email = ?2",
    ).bind(run.ownerId, run.editorEmail),
    env.DB.prepare("DELETE FROM runtime_proofs WHERE key = ?1").bind(
      `${SNAPSHOT_PREFIX}${run.runId}`,
    ),
  ]);

  const [retained, restoredCounts, restoredState, restoredSource, foreignKeys] =
    await Promise.all([
      readRunArtifacts(run),
      readTableCounts(),
      readMutableBaseline(),
      readSetupSourceState(env.DB),
      rows("PRAGMA foreign_key_check"),
    ]);
  const retainedVerificationRows = Object.values(retained).reduce<number>(
    (total, value) => total + (typeof value === "number" ? value : 0),
    0,
  );
  const countDifferences = Object.fromEntries(
    COUNT_KEYS.filter(
      (key) => restoredCounts[key] !== snapshot.baselineCounts[key],
    ).map((key) => [
      key,
      {
        baseline: snapshot.baselineCounts[key],
        restored: restoredCounts[key],
      },
    ]),
  );
  const mutableStateRestored = statesEqual(restoredState, baseline);
  const sourceFingerprintRestored =
    restoredSource.fingerprint === snapshot.baselineSourceFingerprint;
  if (
    retainedVerificationRows !== 0 ||
    !countsEqual(restoredCounts, snapshot.baselineCounts) ||
    !mutableStateRestored ||
    !sourceFingerprintRestored ||
    foreignKeys.length !== 0
  ) {
    throw new RuntimeError(
      "M9_RUNTIME_CLEANUP_FAILED",
      "The Milestone 9 runtime state was not restored exactly.",
      {
        status: 500,
        publicMessage:
          "The Milestone 9 runtime state was not restored exactly.",
        details: {
          retainedVerificationRows,
          countDifferences,
          mutableStateRestored,
          sourceFingerprintRestored,
          foreignKeyViolationCount: foreignKeys.length,
        },
      },
    );
  }

  return apiJson(
    {
      cleanup: {
        restored: true,
        retainedVerificationRows,
        baselineCountsRestored: true,
        mutableStateRestored: true,
        sourceFingerprintRestored: true,
        foreignKeyViolationCount: 0,
        r2Calls: 0,
        r2ObjectsTouched: 0,
        mediaBytesCreated: 0,
        temporaryFilesCreated: 0,
        externalCalls: 0,
      },
    },
    requestId,
  );
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("runtime.m9_begin_failed", async (requestId) => {
    requireLab();
    return beginRun(request, requestId);
  });
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute("runtime.m9_read_failed", async (requestId) => {
    requireLab();
    const runId = new URL(request.url).searchParams.get("run");
    if (!runId) {
      throw runtimeError("INVALID_INPUT", "Provide a runtime run ID.", 400);
    }
    return readRunState(requireRunId(runId), requestId);
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return runApiRoute("runtime.m9_cleanup_failed", async (requestId) => {
    requireLab();
    return cleanupRun(request, requestId);
  });
}
