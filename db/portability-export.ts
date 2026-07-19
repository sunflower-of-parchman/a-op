import { activeOwnerCondition } from "./authority-guards.ts";
import {
  canonicalJson,
  createArtistExportArchive,
  createSemanticFingerprint,
  readSnapshotFromD1Adapter,
  serializeArtistExportArchive,
  verifyArtistExportArchive,
  type ArtistExportArchive,
  type ArtistInstallationSnapshot,
  type D1ArtistExportSourceAdapter,
  type PortableDocumentName,
  type PortableEntityKind,
  type PortableField,
  type PortableRecord,
  type PortableRelation,
  type PortableValue,
  type VerifiedArtistExportArchive,
} from "@/lib/portability/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_OPERATION_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SAFE_DIGEST = /^[a-f0-9]{64}$/;

type Row = Record<string, unknown>;
type PortableFields = Readonly<Record<string, PortableValue | undefined>>;
type RelationTarget = readonly [PortableEntityKind, string];
type PortableRelations = Readonly<Record<string, RelationTarget | undefined>>;

interface ExportManifestRow {
  id: string;
  export_key: string;
  schema_version: number;
  source_state_fingerprint: string;
  manifest_sha256: string;
  file_count: number;
  media_object_count: number;
  byte_count: number;
  status: string;
  contains_customer_data: number | boolean;
  contains_provider_payload: number | boolean;
  exported_by_user_id: string;
  verified_at: string | null;
  last_operation_key: string | null;
  created_at: string;
}

export interface PortableExportResult {
  readonly archive: ArtistExportArchive;
  readonly bytes: Uint8Array;
  readonly exportId: string;
  readonly exportKey: string;
  readonly archiveSha256: string;
  readonly semanticFingerprint: string;
  readonly fileCount: number;
  readonly mediaObjectCount: number;
  readonly byteCount: number;
  readonly replayed: boolean;
}

export interface PortableExportVerificationResult {
  readonly exportId: string;
  readonly exportKey: string;
  readonly archiveSha256: string;
  readonly semanticFingerprint: string;
  readonly fileCount: number;
  readonly mediaObjectCount: number;
  readonly byteCount: number;
  readonly verifiedAt: string;
  readonly replayed: boolean;
}

function portabilityStateError(
  code: string,
  message: string,
  publicMessage: string,
  status = 409,
): RuntimeError {
  return new RuntimeError(code, message, { status, publicMessage });
}

function invalidStoredState(label: string): never {
  throw portabilityStateError(
    "PORTABILITY_SOURCE_INVALID",
    `D1 returned invalid portable ${label}.`,
    "The artist definitions could not be exported safely.",
    500,
  );
}

async function rows(binding: D1Database, sql: string): Promise<readonly Row[]> {
  const result = await binding.prepare(sql).all<Row>();
  if (!result.success) invalidStoredState("source state");
  return result.results;
}

function string(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") invalidStoredState(key);
  return value;
}

function nullableString(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") invalidStoredState(key);
  return value;
}

function integer(row: Row, key: string): number {
  const value = row[key];
  if (!Number.isSafeInteger(value)) invalidStoredState(key);
  return value as number;
}

function nullableInteger(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) invalidStoredState(key);
  return value as number;
}

function boolean(row: Row, key: string): boolean {
  const value = row[key];
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return invalidStoredState(key);
}

function parseJson(row: Row, key: string): unknown {
  try {
    return JSON.parse(string(row, key)) as unknown;
  } catch {
    return invalidStoredState(`${key} JSON`);
  }
}

function stringArray(row: Row, key: string): readonly string[] {
  const value = parseJson(row, key);
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    return invalidStoredState(`${key} string list`);
  }
  return value;
}

function structuredText(row: Row, key: string): string {
  const value = parseJson(row, key);
  if (!Array.isArray(value)) invalidStoredState(`${key} structured text`);
  return canonicalJson(value);
}

function contentObject(row: Row, key: string): Row {
  const value = parseJson(row, key);
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    return invalidStoredState(`${key} object`);
  }
  return value as Row;
}

function contentString(value: Row, key: string): string {
  const result = value[key];
  if (typeof result !== "string") invalidStoredState(`content ${key}`);
  return result;
}

function isoInstant(value: string): string {
  const candidate = value.includes("T")
    ? value.endsWith("Z")
      ? value
      : `${value}Z`
    : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(candidate);
  if (!Number.isFinite(parsed.valueOf())) invalidStoredState("timestamp");
  return parsed.toISOString();
}

function nullableInstant(row: Row, key: string): string | null {
  const value = nullableString(row, key);
  return value === null ? null : isoInstant(value);
}

function portableRecord(
  entity: PortableEntityKind,
  id: string,
  fields: PortableFields,
  relations: PortableRelations = {},
): PortableRecord {
  const portableFields: PortableField[] = Object.entries(fields)
    .filter((entry): entry is [string, PortableValue] => entry[1] !== undefined)
    .map(([name, value]) => ({ name, value }));
  const portableRelations: PortableRelation[] = Object.entries(relations)
    .filter(
      (entry): entry is [string, RelationTarget] => entry[1] !== undefined,
    )
    .map(([name, [targetEntity, targetId]]) => ({
      name,
      targetEntity,
      targetId,
    }));
  return { entity, id, fields: portableFields, relations: portableRelations };
}

function optionalRelation(
  entity: PortableEntityKind,
  targetId: string | null,
): RelationTarget | undefined {
  return targetId === null ? undefined : [entity, targetId];
}

async function readArtist(binding: D1Database): Promise<PortableRecord[]> {
  const source = await rows(
    binding,
    `SELECT aggregate.id, revision.revision, revision.display_name,
            revision.site_title, revision.headline, revision.introduction,
            revision.footer_text
     FROM artist_config AS aggregate
     JOIN artist_config_revisions AS revision
       ON revision.id = aggregate.draft_revision_id
      AND revision.artist_config_id = aggregate.id
     ORDER BY aggregate.id`,
  );
  return source.map((row) =>
    portableRecord("artist-config", string(row, "id"), {
      revision: integer(row, "revision"),
      displayName: string(row, "display_name"),
      siteTitle: string(row, "site_title"),
      headline: string(row, "headline"),
      introduction: string(row, "introduction"),
      footerText: string(row, "footer_text"),
    }),
  );
}

async function readModules(binding: D1Database): Promise<PortableRecord[]> {
  const source = await rows(
    binding,
    `SELECT module_key, active, revision
     FROM artist_modules ORDER BY module_key`,
  );
  return source.map((row) =>
    portableRecord("module", string(row, "module_key"), {
      key: string(row, "module_key"),
      active: boolean(row, "active"),
      revision: integer(row, "revision"),
    }),
  );
}

async function readNavigation(binding: D1Database): Promise<PortableRecord[]> {
  const [sets, items] = await Promise.all([
    rows(
      binding,
      `SELECT id, label, revision, published_version
       FROM navigation_sets ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, navigation_set_id, version, item_key, label, href,
              position, module_key, external
       FROM navigation_items
       ORDER BY navigation_set_id, version, position, id`,
    ),
  ]);
  return [
    ...sets.map((row) =>
      portableRecord("navigation-set", string(row, "id"), {
        key: string(row, "id"),
        label: string(row, "label"),
        revision: integer(row, "revision"),
        publishedVersion: nullableInteger(row, "published_version"),
      }),
    ),
    ...items.map((row) =>
      portableRecord(
        "navigation-item",
        string(row, "id"),
        {
          key: string(row, "item_key"),
          label: string(row, "label"),
          href: string(row, "href"),
          position: integer(row, "position"),
          external: boolean(row, "external"),
          moduleKey: nullableString(row, "module_key"),
          version: integer(row, "version"),
        },
        {
          navigationSet: ["navigation-set", string(row, "navigation_set_id")],
        },
      ),
    ),
  ];
}

async function readPages(binding: D1Database): Promise<PortableRecord[]> {
  const [pages, revisions, placements] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, module_key, kind, draft_revision_id,
              published_revision_id, publication_state, version, published_at
       FROM pages ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, page_id, revision, module_key, kind, title,
              introduction, body_text
       FROM page_revisions ORDER BY page_id, revision, id`,
    ),
    rows(
      binding,
      `SELECT id, page_revision_id, content_section_revision_id, position
       FROM page_revision_sections
       ORDER BY page_revision_id, position, id`,
    ),
  ]);
  return [
    ...pages.map((row) =>
      portableRecord(
        "page",
        string(row, "id"),
        {
          slug: string(row, "slug"),
          publicationState: string(row, "publication_state"),
          revision: integer(row, "version"),
          publishedAt: nullableInstant(row, "published_at"),
          moduleKey: nullableString(row, "module_key"),
          kind: string(row, "kind"),
        },
        {
          draftRevision: ["page-revision", string(row, "draft_revision_id")],
          publishedRevision: optionalRelation(
            "page-revision",
            nullableString(row, "published_revision_id"),
          ),
        },
      ),
    ),
    ...revisions.map((row) =>
      portableRecord(
        "page-revision",
        string(row, "id"),
        {
          revision: integer(row, "revision"),
          moduleKey: nullableString(row, "module_key"),
          kind: string(row, "kind"),
          title: string(row, "title"),
          introduction: string(row, "introduction"),
          bodyText: string(row, "body_text"),
        },
        { page: ["page", string(row, "page_id")] },
      ),
    ),
    ...placements.map((row) =>
      portableRecord(
        "page-section-placement",
        string(row, "id"),
        { position: integer(row, "position") },
        {
          pageRevision: ["page-revision", string(row, "page_revision_id")],
          contentSectionRevision: [
            "content-section-revision",
            string(row, "content_section_revision_id"),
          ],
        },
      ),
    ),
  ];
}

async function readSections(binding: D1Database): Promise<PortableRecord[]> {
  const [sections, revisions] = await Promise.all([
    rows(
      binding,
      `SELECT id, section_key, draft_revision_id, published_revision_id,
              publication_state, version, published_at
       FROM content_sections ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, content_section_id, revision, kind, heading, body_text
       FROM content_section_revisions
       ORDER BY content_section_id, revision, id`,
    ),
  ]);
  return [
    ...sections.map((row) =>
      portableRecord(
        "content-section",
        string(row, "id"),
        {
          key: string(row, "section_key"),
          publicationState: string(row, "publication_state"),
          revision: integer(row, "version"),
          publishedAt: nullableInstant(row, "published_at"),
        },
        {
          draftRevision: [
            "content-section-revision",
            string(row, "draft_revision_id"),
          ],
          publishedRevision: optionalRelation(
            "content-section-revision",
            nullableString(row, "published_revision_id"),
          ),
        },
      ),
    ),
    ...revisions.map((row) =>
      portableRecord(
        "content-section-revision",
        string(row, "id"),
        {
          revision: integer(row, "revision"),
          kind: string(row, "kind"),
          heading: string(row, "heading"),
          bodyText: string(row, "body_text"),
        },
        {
          contentSection: [
            "content-section",
            string(row, "content_section_id"),
          ],
        },
      ),
    ),
  ];
}

async function readCatalog(binding: D1Database): Promise<PortableRecord[]> {
  const [
    trackRows,
    trackRevisionRows,
    releaseRows,
    releaseRevisionRows,
    releaseTrackRows,
    collectionRows,
    collectionRevisionRows,
    collectionTrackRows,
    creditRows,
  ] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, draft_revision_id, published_revision_id,
              publication_state, version, published_at
       FROM tracks ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, track_id, revision, title, subtitle, description,
              duration_ms, isrc, copyright_notice, explicit, view_mode,
              stream_mode, download_mode, original_media_id,
              streaming_derivative_id, download_derivative_id, tags_json
       FROM track_revisions ORDER BY track_id, revision, id`,
    ),
    rows(
      binding,
      `SELECT id, slug, draft_revision_id, published_revision_id,
              publication_state, version, published_at
       FROM releases ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, release_id, revision, release_type, title, subtitle,
              description, release_date, catalog_number, copyright_notice,
              view_mode, artwork_derivative_id, tags_json
       FROM release_revisions ORDER BY release_id, revision, id`,
    ),
    rows(
      binding,
      `SELECT id, release_revision_id, track_id, track_revision_id,
              position, disc_number, track_number
       FROM release_tracks ORDER BY release_revision_id, position, id`,
    ),
    rows(
      binding,
      `SELECT id, slug, draft_revision_id, published_revision_id,
              publication_state, version, published_at
       FROM collections ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, collection_id, revision, title, description, view_mode,
              artwork_derivative_id, tags_json
       FROM collection_revisions ORDER BY collection_id, revision, id`,
    ),
    rows(
      binding,
      `SELECT id, collection_revision_id, track_id, track_revision_id, position
       FROM collection_tracks
       ORDER BY collection_revision_id, position, id`,
    ),
    rows(
      binding,
      `SELECT id, release_revision_id, track_revision_id,
              collection_revision_id, name, role, details, position
       FROM credits ORDER BY id`,
    ),
  ]);

  const publicationAggregate = (
    entity: "track" | "release" | "collection",
    revisionEntity:
      "track-revision" | "release-revision" | "collection-revision",
    row: Row,
  ) =>
    portableRecord(
      entity,
      string(row, "id"),
      {
        slug: string(row, "slug"),
        publicationState: string(row, "publication_state"),
        revision: integer(row, "version"),
        publishedAt: nullableInstant(row, "published_at"),
      },
      {
        draftRevision: [revisionEntity, string(row, "draft_revision_id")],
        publishedRevision: optionalRelation(
          revisionEntity,
          nullableString(row, "published_revision_id"),
        ),
      },
    );

  return [
    ...trackRows.map((row) =>
      publicationAggregate("track", "track-revision", row),
    ),
    ...trackRevisionRows.map((row) =>
      portableRecord(
        "track-revision",
        string(row, "id"),
        {
          revision: integer(row, "revision"),
          title: string(row, "title"),
          subtitle: nullableString(row, "subtitle"),
          description: string(row, "description"),
          durationMs: nullableInteger(row, "duration_ms"),
          isrc: nullableString(row, "isrc"),
          copyrightNotice: string(row, "copyright_notice"),
          explicit: boolean(row, "explicit"),
          viewMode: string(row, "view_mode"),
          streamMode: string(row, "stream_mode"),
          downloadMode: string(row, "download_mode"),
          tags: stringArray(row, "tags_json"),
        },
        {
          track: ["track", string(row, "track_id")],
          originalMedia: optionalRelation(
            "media-object",
            nullableString(row, "original_media_id"),
          ),
          streamingDerivative: optionalRelation(
            "media-derivative",
            nullableString(row, "streaming_derivative_id"),
          ),
          downloadDerivative: optionalRelation(
            "media-derivative",
            nullableString(row, "download_derivative_id"),
          ),
        },
      ),
    ),
    ...releaseRows.map((row) =>
      publicationAggregate("release", "release-revision", row),
    ),
    ...releaseRevisionRows.map((row) =>
      portableRecord(
        "release-revision",
        string(row, "id"),
        {
          revision: integer(row, "revision"),
          releaseType: string(row, "release_type"),
          title: string(row, "title"),
          subtitle: nullableString(row, "subtitle"),
          description: string(row, "description"),
          releaseDate: nullableString(row, "release_date"),
          catalogNumber: nullableString(row, "catalog_number"),
          copyrightNotice: string(row, "copyright_notice"),
          viewMode: string(row, "view_mode"),
          tags: stringArray(row, "tags_json"),
        },
        {
          release: ["release", string(row, "release_id")],
          artworkDerivative: optionalRelation(
            "media-derivative",
            nullableString(row, "artwork_derivative_id"),
          ),
        },
      ),
    ),
    ...releaseTrackRows.map((row) =>
      portableRecord(
        "release-track",
        string(row, "id"),
        {
          position: integer(row, "position"),
          discNumber: integer(row, "disc_number"),
          trackNumber: integer(row, "track_number"),
        },
        {
          releaseRevision: [
            "release-revision",
            string(row, "release_revision_id"),
          ],
          track: ["track", string(row, "track_id")],
          trackRevision: ["track-revision", string(row, "track_revision_id")],
        },
      ),
    ),
    ...collectionRows.map((row) =>
      publicationAggregate("collection", "collection-revision", row),
    ),
    ...collectionRevisionRows.map((row) =>
      portableRecord(
        "collection-revision",
        string(row, "id"),
        {
          revision: integer(row, "revision"),
          title: string(row, "title"),
          description: string(row, "description"),
          viewMode: string(row, "view_mode"),
          tags: stringArray(row, "tags_json"),
        },
        {
          collection: ["collection", string(row, "collection_id")],
          artworkDerivative: optionalRelation(
            "media-derivative",
            nullableString(row, "artwork_derivative_id"),
          ),
        },
      ),
    ),
    ...collectionTrackRows.map((row) =>
      portableRecord(
        "collection-track",
        string(row, "id"),
        { position: integer(row, "position") },
        {
          collectionRevision: [
            "collection-revision",
            string(row, "collection_revision_id"),
          ],
          track: ["track", string(row, "track_id")],
          trackRevision: ["track-revision", string(row, "track_revision_id")],
        },
      ),
    ),
    ...creditRows.map((row) => {
      const releaseRevisionId = nullableString(row, "release_revision_id");
      const trackRevisionId = nullableString(row, "track_revision_id");
      const collectionRevisionId = nullableString(
        row,
        "collection_revision_id",
      );
      const subject: RelationTarget = releaseRevisionId
        ? ["release-revision", releaseRevisionId]
        : trackRevisionId
          ? ["track-revision", trackRevisionId]
          : collectionRevisionId
            ? ["collection-revision", collectionRevisionId]
            : invalidStoredState("credit subject");
      return portableRecord(
        "credit",
        string(row, "id"),
        {
          name: string(row, "name"),
          role: string(row, "role"),
          details: string(row, "details"),
          position: integer(row, "position"),
        },
        { subject },
      );
    }),
  ];
}

async function readAccess(binding: D1Database): Promise<PortableRecord[]> {
  const [plans, items, templates] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, name, description, state, revision
       FROM access_plans ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, access_plan_id, position, resource_type, resource_id,
              actions_json, remaining_uses, download_disposition
       FROM access_plan_items
       WHERE resource_type != 'license-document'
      ORDER BY access_plan_id, position, id`,
    ),
    rows(
      binding,
      `SELECT id, template_key, label, access_plan_id, access_plan_revision,
              default_duration_days, state, revision
       FROM access_grant_templates
       ORDER BY template_key, id`,
    ),
  ]);
  return [
    ...plans.map((row) =>
      portableRecord("access-plan", string(row, "id"), {
        slug: string(row, "slug"),
        name: string(row, "name"),
        description: string(row, "description"),
        state: string(row, "state"),
        revision: integer(row, "revision"),
      }),
    ),
    ...items.map((row) => {
      const resourceType = string(row, "resource_type");
      if (
        resourceType !== "track" &&
        resourceType !== "release" &&
        resourceType !== "collection" &&
        resourceType !== "course" &&
        resourceType !== "lesson"
      ) {
        return invalidStoredState("portable access resource");
      }
      return portableRecord(
        "access-plan-item",
        string(row, "id"),
        {
          position: integer(row, "position"),
          actions: stringArray(row, "actions_json"),
          remainingUses: nullableInteger(row, "remaining_uses"),
          downloadDisposition: nullableString(row, "download_disposition"),
        },
        {
          accessPlan: ["access-plan", string(row, "access_plan_id")],
          resource: [resourceType, string(row, "resource_id")],
        },
      );
    }),
    ...templates.map((row) =>
      portableRecord(
        "access-grant-template",
        string(row, "id"),
        {
          key: string(row, "template_key"),
          label: string(row, "label"),
          accessPlanRevision: integer(row, "access_plan_revision"),
          defaultDurationDays: nullableInteger(row, "default_duration_days"),
          state: string(row, "state"),
          revision: integer(row, "revision"),
        },
        {
          accessPlan: ["access-plan", string(row, "access_plan_id")],
        },
      ),
    ),
  ];
}

async function readMemberships(binding: D1Database): Promise<PortableRecord[]> {
  const [plans, revisions, creditRules] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, state, current_revision
       FROM membership_plans ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, membership_plan_id, revision, name, description,
              benefits_json, access_plan_id, download_credits,
              license_credits, duration_days
      FROM membership_plan_revisions
       ORDER BY membership_plan_id, revision, id`,
    ),
    rows(
      binding,
      `SELECT id, rule_key, credit_kind, membership_plan_id,
              membership_plan_revision_id, subscription_plan_id, amount,
              cadence, state, revision
       FROM membership_credit_rules
       ORDER BY rule_key, id`,
    ),
  ]);
  return [
    ...plans.map((row) =>
      portableRecord("membership-plan", string(row, "id"), {
        slug: string(row, "slug"),
        state: string(row, "state"),
        currentRevision: integer(row, "current_revision"),
      }),
    ),
    ...revisions.map((row) =>
      portableRecord(
        "membership-plan-revision",
        string(row, "id"),
        {
          revision: integer(row, "revision"),
          name: string(row, "name"),
          description: string(row, "description"),
          benefits: stringArray(row, "benefits_json"),
          downloadCredits: integer(row, "download_credits"),
          licenseCredits: integer(row, "license_credits"),
          durationDays: nullableInteger(row, "duration_days"),
        },
        {
          membershipPlan: [
            "membership-plan",
            string(row, "membership_plan_id"),
          ],
          accessPlan: optionalRelation(
            "access-plan",
            nullableString(row, "access_plan_id"),
          ),
        },
      ),
    ),
    ...creditRules.map((row) => {
      const membershipPlanId = nullableString(row, "membership_plan_id");
      const membershipPlanRevisionId = nullableString(
        row,
        "membership_plan_revision_id",
      );
      const subscriptionPlanId = nullableString(row, "subscription_plan_id");
      const subjectKind =
        membershipPlanId === null ? "subscription" : "membership";
      return portableRecord(
        "membership-credit-rule",
        string(row, "id"),
        {
          key: string(row, "rule_key"),
          creditKind: string(row, "credit_kind"),
          subjectKind,
          amount: integer(row, "amount"),
          cadence: string(row, "cadence"),
          state: string(row, "state"),
          revision: integer(row, "revision"),
        },
        {
          membershipPlan: optionalRelation("membership-plan", membershipPlanId),
          membershipPlanRevision: optionalRelation(
            "membership-plan-revision",
            membershipPlanRevisionId,
          ),
          subscriptionPlan: optionalRelation(
            "subscription-plan",
            subscriptionPlanId,
          ),
        },
      );
    }),
  ];
}

async function readSubscriptions(
  binding: D1Database,
): Promise<PortableRecord[]> {
  const source = await rows(
    binding,
    `SELECT id, slug, name, description, membership_plan_id,
            membership_plan_revision_id, billing_interval, interval_count,
            state, revision
     FROM subscription_plans ORDER BY id`,
  );
  return source.map((row) =>
    portableRecord(
      "subscription-plan",
      string(row, "id"),
      {
        slug: string(row, "slug"),
        name: string(row, "name"),
        description: string(row, "description"),
        billingInterval: string(row, "billing_interval"),
        intervalCount: integer(row, "interval_count"),
        state: string(row, "state"),
        revision: integer(row, "revision"),
      },
      {
        membershipPlan: ["membership-plan", string(row, "membership_plan_id")],
        membershipPlanRevision: [
          "membership-plan-revision",
          string(row, "membership_plan_revision_id"),
        ],
      },
    ),
  );
}

async function readCommerce(binding: D1Database): Promise<PortableRecord[]> {
  const [products, prices, intents] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, name, description, product_type, resource_type,
              resource_id, access_plan_id, membership_plan_id,
              membership_plan_revision_id, subscription_plan_id,
              credit_kind, credit_quantity, state, revision
       FROM commerce_products ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, commerce_product_id, amount_minor, currency,
              billing_interval, interval_count, active, revision
      FROM commerce_prices ORDER BY commerce_product_id, id`,
    ),
    rows(
      binding,
      `SELECT id, intent_key, intent_kind, name, description,
              membership_plan_id, membership_plan_revision_id,
              subscription_plan_id, track_id, track_revision_id,
              license_terms_version_id, license_option_id, amount_minor,
              currency, billing_interval, interval_count, revision
       FROM commerce_binding_intents
       WHERE binding_state != 'archived'
       ORDER BY intent_key, id`,
    ),
  ]);
  return [
    ...products.map((row) => {
      const resourceType = nullableString(row, "resource_type");
      if (
        resourceType !== null &&
        resourceType !== "track" &&
        resourceType !== "release" &&
        resourceType !== "collection"
      ) {
        return invalidStoredState("commerce resource type");
      }
      const resourceId = nullableString(row, "resource_id");
      return portableRecord(
        "commerce-product",
        string(row, "id"),
        {
          slug: string(row, "slug"),
          name: string(row, "name"),
          description: string(row, "description"),
          productType: string(row, "product_type"),
          creditKind: nullableString(row, "credit_kind"),
          creditQuantity: nullableInteger(row, "credit_quantity"),
          state: string(row, "state"),
          revision: integer(row, "revision"),
        },
        {
          resource:
            resourceType === null || resourceId === null
              ? undefined
              : [resourceType, resourceId],
          accessPlan: optionalRelation(
            "access-plan",
            nullableString(row, "access_plan_id"),
          ),
          membershipPlan: optionalRelation(
            "membership-plan",
            nullableString(row, "membership_plan_id"),
          ),
          membershipPlanRevision: optionalRelation(
            "membership-plan-revision",
            nullableString(row, "membership_plan_revision_id"),
          ),
          subscriptionPlan: optionalRelation(
            "subscription-plan",
            nullableString(row, "subscription_plan_id"),
          ),
        },
      );
    }),
    ...prices.map((row) =>
      portableRecord(
        "commerce-price-definition",
        string(row, "id"),
        {
          amountMinor: integer(row, "amount_minor"),
          currency: string(row, "currency"),
          billingInterval: string(row, "billing_interval"),
          intervalCount: integer(row, "interval_count"),
          active: boolean(row, "active"),
          revision: integer(row, "revision"),
          bindingState: "pending",
        },
        {
          commerceProduct: [
            "commerce-product",
            string(row, "commerce_product_id"),
          ],
        },
      ),
    ),
    ...intents.map((row) =>
      portableRecord(
        "commerce-binding-intent",
        string(row, "id"),
        {
          key: string(row, "intent_key"),
          intentKind: string(row, "intent_kind"),
          name: string(row, "name"),
          description: string(row, "description"),
          amountMinor: integer(row, "amount_minor"),
          currency: string(row, "currency"),
          billingInterval: string(row, "billing_interval"),
          intervalCount: integer(row, "interval_count"),
          bindingState: "pending",
          revision: integer(row, "revision"),
        },
        {
          membershipPlan: optionalRelation(
            "membership-plan",
            nullableString(row, "membership_plan_id"),
          ),
          membershipPlanRevision: optionalRelation(
            "membership-plan-revision",
            nullableString(row, "membership_plan_revision_id"),
          ),
          subscriptionPlan: optionalRelation(
            "subscription-plan",
            nullableString(row, "subscription_plan_id"),
          ),
          track: optionalRelation("track", nullableString(row, "track_id")),
          trackRevision: optionalRelation(
            "track-revision",
            nullableString(row, "track_revision_id"),
          ),
          licenseTermsVersion: optionalRelation(
            "license-terms-version",
            nullableString(row, "license_terms_version_id"),
          ),
          licenseOption: optionalRelation(
            "license-option",
            nullableString(row, "license_option_id"),
          ),
        },
      ),
    ),
  ];
}

async function readLicensing(binding: D1Database): Promise<PortableRecord[]> {
  const [terms, versions, options, offers] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, state, current_version
       FROM license_terms ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, license_terms_id, version, name, title, introduction,
              general_terms, disclaimer
       FROM license_terms_versions
       ORDER BY license_terms_id, version, id`,
    ),
    rows(
      binding,
      `SELECT id, license_terms_version_id, option_key, label, description,
              usage_category, allowed_media_json, audience_label,
              max_audience, distribution_label, max_copies, term_months,
              territory, attribution_required, attribution_text, exclusive,
              requires_approval, license_credit_cost,
              includes_track_download, position
       FROM license_options
       ORDER BY license_terms_version_id, position, id`,
    ),
    rows(
      binding,
      `SELECT id, slug, track_id, track_revision_id,
              license_terms_version_id, license_option_id,
              commerce_product_id, commerce_price_id, state, revision
       FROM license_offers ORDER BY id`,
    ),
  ]);
  return [
    ...terms.map((row) =>
      portableRecord("license-terms", string(row, "id"), {
        slug: string(row, "slug"),
        state: string(row, "state"),
        currentVersion: integer(row, "current_version"),
      }),
    ),
    ...versions.map((row) =>
      portableRecord(
        "license-terms-version",
        string(row, "id"),
        {
          version: integer(row, "version"),
          name: string(row, "name"),
          title: string(row, "title"),
          introduction: string(row, "introduction"),
          generalTerms: string(row, "general_terms"),
          disclaimer: string(row, "disclaimer"),
        },
        {
          licenseTerms: ["license-terms", string(row, "license_terms_id")],
        },
      ),
    ),
    ...options.map((row) =>
      portableRecord(
        "license-option",
        string(row, "id"),
        {
          optionKey: string(row, "option_key"),
          label: string(row, "label"),
          description: string(row, "description"),
          usageCategory: string(row, "usage_category"),
          allowedMedia: stringArray(row, "allowed_media_json"),
          audienceLabel: nullableString(row, "audience_label"),
          maxAudience: nullableInteger(row, "max_audience"),
          distributionLabel: nullableString(row, "distribution_label"),
          maxCopies: nullableInteger(row, "max_copies"),
          termMonths: nullableInteger(row, "term_months"),
          territory: string(row, "territory"),
          attributionRequired: boolean(row, "attribution_required"),
          attributionText: nullableString(row, "attribution_text"),
          exclusive: boolean(row, "exclusive"),
          requiresApproval: boolean(row, "requires_approval"),
          licenseCreditCost: integer(row, "license_credit_cost"),
          includesTrackDownload: boolean(row, "includes_track_download"),
          position: integer(row, "position"),
        },
        {
          licenseTermsVersion: [
            "license-terms-version",
            string(row, "license_terms_version_id"),
          ],
        },
      ),
    ),
    ...offers.map((row) =>
      portableRecord(
        "license-offer",
        string(row, "id"),
        {
          slug: string(row, "slug"),
          state: string(row, "state"),
          revision: integer(row, "revision"),
        },
        {
          track: ["track", string(row, "track_id")],
          trackRevision: ["track-revision", string(row, "track_revision_id")],
          licenseTermsVersion: [
            "license-terms-version",
            string(row, "license_terms_version_id"),
          ],
          licenseOption: ["license-option", string(row, "license_option_id")],
          commerceProduct: [
            "commerce-product",
            string(row, "commerce_product_id"),
          ],
          priceDefinition: [
            "commerce-price-definition",
            string(row, "commerce_price_id"),
          ],
        },
      ),
    ),
  ];
}

async function readCourses(binding: D1Database): Promise<PortableRecord[]> {
  const [courses, revisions, sections, lessons, items] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, draft_revision_id, published_revision_id,
              publication_state, revision, published_at
       FROM courses ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, course_id, revision, title, description, access_mode,
              access_plan_id, estimated_minutes
       FROM course_revisions ORDER BY course_id, revision, id`,
    ),
    rows(
      binding,
      `SELECT id, course_revision_id, section_key, position, title, description
       FROM course_sections ORDER BY course_revision_id, position, id`,
    ),
    rows(
      binding,
      `SELECT id, course_revision_id, course_section_id, lesson_key, slug,
              position, title, summary, access_mode, estimated_minutes
       FROM lessons ORDER BY course_revision_id, course_section_id, position, id`,
    ),
    rows(
      binding,
      `SELECT id, lesson_id, item_key, position, item_type, content_json,
              media_derivative_id, alt_text, transcript_text
       FROM lesson_items ORDER BY lesson_id, position, id`,
    ),
  ]);
  return [
    ...courses.map((row) =>
      portableRecord(
        "course",
        string(row, "id"),
        {
          slug: string(row, "slug"),
          publicationState: string(row, "publication_state"),
          revision: integer(row, "revision"),
          publishedAt: nullableInstant(row, "published_at"),
        },
        {
          draftRevision: ["course-revision", string(row, "draft_revision_id")],
          publishedRevision: optionalRelation(
            "course-revision",
            nullableString(row, "published_revision_id"),
          ),
        },
      ),
    ),
    ...revisions.map((row) =>
      portableRecord(
        "course-revision",
        string(row, "id"),
        {
          revision: integer(row, "revision"),
          title: string(row, "title"),
          description: string(row, "description"),
          accessMode: string(row, "access_mode"),
          estimatedMinutes: nullableInteger(row, "estimated_minutes"),
        },
        {
          course: ["course", string(row, "course_id")],
          accessPlan: optionalRelation(
            "access-plan",
            nullableString(row, "access_plan_id"),
          ),
        },
      ),
    ),
    ...sections.map((row) =>
      portableRecord(
        "course-section",
        string(row, "id"),
        {
          key: string(row, "section_key"),
          position: integer(row, "position"),
          title: string(row, "title"),
          description: string(row, "description"),
        },
        {
          courseRevision: [
            "course-revision",
            string(row, "course_revision_id"),
          ],
        },
      ),
    ),
    ...lessons.map((row) =>
      portableRecord(
        "lesson",
        string(row, "id"),
        {
          key: string(row, "lesson_key"),
          slug: string(row, "slug"),
          position: integer(row, "position"),
          title: string(row, "title"),
          summary: string(row, "summary"),
          accessMode: string(row, "access_mode"),
          estimatedMinutes: nullableInteger(row, "estimated_minutes"),
        },
        {
          courseRevision: [
            "course-revision",
            string(row, "course_revision_id"),
          ],
          courseSection: ["course-section", string(row, "course_section_id")],
        },
      ),
    ),
    ...items.map((row) => {
      const itemType = string(row, "item_type");
      const content = contentObject(row, "content_json");
      const text = contentString(content, "text");
      const caption = contentString(content, "caption");
      return portableRecord(
        "lesson-item",
        string(row, "id"),
        {
          key: string(row, "item_key"),
          position: integer(row, "position"),
          itemType,
          bodyText: itemType === "text" ? text : null,
          promptText: itemType === "prompt" ? text : null,
          caption: caption.length === 0 ? null : caption,
          altText: nullableString(row, "alt_text"),
          transcriptText: nullableString(row, "transcript_text"),
        },
        {
          lesson: ["lesson", string(row, "lesson_id")],
          mediaDerivative: optionalRelation(
            "media-derivative",
            nullableString(row, "media_derivative_id"),
          ),
        },
      );
    }),
  ];
}

async function readVideo(binding: D1Database): Promise<PortableRecord[]> {
  const [videos, revisions, transcripts] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, draft_revision_id, published_revision_id,
              publication_state, revision, published_at
       FROM videos ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, video_id, revision, title, summary, artist_context,
              credits_json, delivery_kind, poster_derivative_id,
              hosted_derivative_id
       FROM video_revisions ORDER BY video_id, revision, id`,
    ),
    rows(
      binding,
      `SELECT id, video_revision_id, language, transcript_text,
              captions_derivative_id, revision
       FROM video_transcripts ORDER BY video_revision_id, language, id`,
    ),
  ]);
  return [
    ...videos.map((row) =>
      portableRecord(
        "video",
        string(row, "id"),
        {
          slug: string(row, "slug"),
          publicationState: string(row, "publication_state"),
          revision: integer(row, "revision"),
          publishedAt: nullableInstant(row, "published_at"),
        },
        {
          draftRevision: ["video-revision", string(row, "draft_revision_id")],
          publishedRevision: optionalRelation(
            "video-revision",
            nullableString(row, "published_revision_id"),
          ),
        },
      ),
    ),
    ...revisions.map((row) =>
      portableRecord(
        "video-revision",
        string(row, "id"),
        {
          revision: integer(row, "revision"),
          title: string(row, "title"),
          summary: string(row, "summary"),
          artistContext: string(row, "artist_context"),
          credits: stringArray(row, "credits_json"),
          deliveryKind: string(row, "delivery_kind"),
          bindingState: "pending",
        },
        {
          video: ["video", string(row, "video_id")],
          posterDerivative: optionalRelation(
            "media-derivative",
            nullableString(row, "poster_derivative_id"),
          ),
          hostedDerivative: optionalRelation(
            "media-derivative",
            nullableString(row, "hosted_derivative_id"),
          ),
        },
      ),
    ),
    ...transcripts.map((row) =>
      portableRecord(
        "video-transcript",
        string(row, "id"),
        {
          language: string(row, "language"),
          transcriptText: string(row, "transcript_text"),
          revision: integer(row, "revision"),
        },
        {
          videoRevision: ["video-revision", string(row, "video_revision_id")],
          captionsDerivative: optionalRelation(
            "media-derivative",
            nullableString(row, "captions_derivative_id"),
          ),
        },
      ),
    ),
  ];
}

function updateResourceTarget(row: Row): RelationTarget | undefined {
  const resourceType = nullableString(row, "resource_type");
  const resourceId = nullableString(row, "resource_id");
  if (resourceType === null && resourceId === null) return undefined;
  if (resourceType === null || resourceId === null) {
    return invalidStoredState("update resource");
  }
  const entity: PortableEntityKind =
    resourceType === "license"
      ? "license-offer"
      : resourceType === "membership"
        ? "membership-plan"
        : resourceType === "subscription"
          ? "subscription-plan"
          : resourceType === "track" ||
              resourceType === "release" ||
              resourceType === "collection" ||
              resourceType === "course" ||
              resourceType === "video" ||
              resourceType === "page"
            ? resourceType
            : invalidStoredState("portable update resource");
  return [entity, resourceId];
}

async function readUpdates(binding: D1Database): Promise<PortableRecord[]> {
  const [posts, updates] = await Promise.all([
    rows(
      binding,
      `SELECT id, slug, title, excerpt, body_json, state, published_at,
              revision
       FROM editorial_posts ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, slug, title, summary, body_json, audience, resource_type,
              resource_id, state, published_at, revision
       FROM updates
       WHERE resource_type IS NULL OR resource_type != 'order'
       ORDER BY id`,
    ),
  ]);
  return [
    ...posts.map((row) =>
      portableRecord("editorial-post", string(row, "id"), {
        slug: string(row, "slug"),
        title: string(row, "title"),
        excerpt: string(row, "excerpt"),
        bodyText: structuredText(row, "body_json"),
        state: string(row, "state"),
        publishedAt: nullableInstant(row, "published_at"),
        revision: integer(row, "revision"),
      }),
    ),
    ...updates.map((row) =>
      portableRecord(
        "update",
        string(row, "id"),
        {
          slug: string(row, "slug"),
          title: string(row, "title"),
          summary: string(row, "summary"),
          bodyText: structuredText(row, "body_json"),
          audience: string(row, "audience"),
          state: string(row, "state"),
          publishedAt: nullableInstant(row, "published_at"),
          revision: integer(row, "revision"),
        },
        { resource: updateResourceTarget(row) },
      ),
    ),
  ];
}

async function readContact(binding: D1Database): Promise<PortableRecord[]> {
  const [forms, consentVersions] = await Promise.all([
    rows(
      binding,
      `SELECT id, form_key, title, description, booking_information,
              public_contact_details, categories_json, state,
              current_consent_version, delivery_adapter, revision
       FROM contact_forms ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, contact_form_id, version, consent_text, effective_at
       FROM contact_consent_versions
       ORDER BY contact_form_id, version, id`,
    ),
  ]);
  return [
    ...forms.map((row) =>
      portableRecord("contact-form", string(row, "id"), {
        key: string(row, "form_key"),
        title: string(row, "title"),
        description: string(row, "description"),
        bookingInformation: string(row, "booking_information"),
        publicContactDetails: string(row, "public_contact_details"),
        categories: stringArray(row, "categories_json"),
        state: string(row, "state"),
        currentConsentVersion: integer(row, "current_consent_version"),
        deliveryAdapter: string(row, "delivery_adapter"),
        revision: integer(row, "revision"),
      }),
    ),
    ...consentVersions.map((row) =>
      portableRecord(
        "contact-consent-version",
        string(row, "id"),
        {
          version: integer(row, "version"),
          consentText: string(row, "consent_text"),
          effectiveAt: isoInstant(string(row, "effective_at")),
        },
        {
          contactForm: ["contact-form", string(row, "contact_form_id")],
        },
      ),
    ),
  ];
}

async function readTelemetry(binding: D1Database): Promise<PortableRecord[]> {
  const source = await rows(
    binding,
    `SELECT id, collection_mode, retention_days,
            meaningful_listen_seconds, revision
     FROM telemetry_settings ORDER BY id`,
  );
  return source.map((row) =>
    portableRecord("telemetry-settings", string(row, "id"), {
      collectionMode: string(row, "collection_mode"),
      retentionDays: integer(row, "retention_days"),
      meaningfulListenSeconds: integer(row, "meaningful_listen_seconds"),
      revision: integer(row, "revision"),
    }),
  );
}

async function readLegal(binding: D1Database): Promise<PortableRecord[]> {
  const [documents, versions] = await Promise.all([
    rows(
      binding,
      `SELECT id, title, draft_version_id, approved_version_id,
              published_version_id, current_version, revision, published_at
       FROM legal_documents ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT id, document_id, version, title, introduction, body_text,
              approved_at
       FROM legal_document_versions
       ORDER BY document_id, version, id`,
    ),
  ]);
  return [
    ...documents.map((row) =>
      portableRecord(
        "legal-document",
        string(row, "id"),
        {
          documentKind: string(row, "id"),
          title: string(row, "title"),
          currentVersion: integer(row, "current_version"),
          revision: integer(row, "revision"),
          publishedAt: nullableInstant(row, "published_at"),
        },
        {
          draftVersion: [
            "legal-document-version",
            string(row, "draft_version_id"),
          ],
          approvedVersion: optionalRelation(
            "legal-document-version",
            nullableString(row, "approved_version_id"),
          ),
          publishedVersion: optionalRelation(
            "legal-document-version",
            nullableString(row, "published_version_id"),
          ),
        },
      ),
    ),
    ...versions.map((row) => {
      const approvedAt = nullableInstant(row, "approved_at");
      return portableRecord(
        "legal-document-version",
        string(row, "id"),
        {
          documentKind: string(row, "document_id"),
          version: integer(row, "version"),
          title: string(row, "title"),
          introduction: string(row, "introduction"),
          bodyText: string(row, "body_text"),
          approved: approvedAt !== null,
          approvedAt,
        },
        {
          legalDocument: ["legal-document", string(row, "document_id")],
        },
      );
    }),
  ];
}

async function readMedia(binding: D1Database): Promise<PortableRecord[]> {
  const [objects, derivatives] = await Promise.all([
    rows(
      binding,
      `SELECT id, kind, visibility, content_type, byte_length,
              source_version, status, approval_state, content_sha256,
              duration_ms, channels, sample_rate, revision
       FROM media_objects
       WHERE kind != 'export'
       ORDER BY id`,
    ),
    rows(
      binding,
      `SELECT derivative.id, derivative.source_media_id, derivative.kind,
              derivative.processing_profile, derivative.processing_version,
              derivative.status, derivative.approval_state,
              derivative.content_type, derivative.format,
              derivative.bitrate_kbps, derivative.duration_ms,
              derivative.channels, derivative.sample_rate,
              derivative.byte_length, derivative.content_sha256,
              derivative.revision
       FROM media_derivatives AS derivative
       JOIN media_objects AS source ON source.id = derivative.source_media_id
       WHERE source.kind != 'export'
       ORDER BY derivative.id`,
    ),
  ]);
  return [
    ...objects.map((row) =>
      portableRecord("media-object", string(row, "id"), {
        kind: string(row, "kind"),
        visibility: string(row, "visibility"),
        contentType: string(row, "content_type"),
        byteLength: integer(row, "byte_length"),
        sourceVersion: integer(row, "source_version"),
        status: string(row, "status"),
        approvalState: string(row, "approval_state"),
        contentSha256: nullableString(row, "content_sha256"),
        durationMs: nullableInteger(row, "duration_ms"),
        channels: nullableInteger(row, "channels"),
        sampleRate: nullableInteger(row, "sample_rate"),
        revision: integer(row, "revision"),
      }),
    ),
    ...derivatives.map((row) =>
      portableRecord(
        "media-derivative",
        string(row, "id"),
        {
          kind: string(row, "kind"),
          processingProfile: string(row, "processing_profile"),
          processingVersion: string(row, "processing_version"),
          status: string(row, "status"),
          approvalState: string(row, "approval_state"),
          contentType: nullableString(row, "content_type"),
          format: nullableString(row, "format"),
          bitrateKbps: nullableInteger(row, "bitrate_kbps"),
          durationMs: nullableInteger(row, "duration_ms"),
          channels: nullableInteger(row, "channels"),
          sampleRate: nullableInteger(row, "sample_rate"),
          byteLength: nullableInteger(row, "byte_length"),
          contentSha256: nullableString(row, "content_sha256"),
          revision: integer(row, "revision"),
        },
        {
          sourceMedia: ["media-object", string(row, "source_media_id")],
        },
      ),
    ),
  ];
}

const DOCUMENT_READERS: Readonly<
  Record<
    PortableDocumentName,
    (binding: D1Database) => Promise<PortableRecord[]>
  >
> = Object.freeze({
  artist: readArtist,
  modules: readModules,
  navigation: readNavigation,
  pages: readPages,
  sections: readSections,
  catalog: readCatalog,
  access: readAccess,
  memberships: readMemberships,
  subscriptions: readSubscriptions,
  commerce: readCommerce,
  licensing: readLicensing,
  courses: readCourses,
  video: readVideo,
  updates: readUpdates,
  contact: readContact,
  telemetry: readTelemetry,
  legal: readLegal,
  media: readMedia,
});

export function createD1ArtistExportSourceAdapter(
  binding: D1Database,
): D1ArtistExportSourceAdapter {
  const cache = new Map<
    PortableDocumentName,
    Promise<readonly PortableRecord[]>
  >();
  return Object.freeze({
    readPortableRecords(document: PortableDocumentName) {
      const existing = cache.get(document);
      if (existing) return existing;
      const pending = DOCUMENT_READERS[document](binding).then((records) =>
        Object.freeze(records),
      );
      cache.set(document, pending);
      return pending;
    },
  });
}

export async function readPortableArtistSnapshot(
  binding: D1Database,
): Promise<ArtistInstallationSnapshot> {
  return readSnapshotFromD1Adapter(createD1ArtistExportSourceAdapter(binding));
}

function requireSafeOperationKey(value: string): string {
  if (!SAFE_OPERATION_KEY.test(value)) {
    throw portabilityStateError(
      "PORTABILITY_OPERATION_KEY_INVALID",
      "The portability operation key is invalid.",
      "This export requires a valid operation key.",
      400,
    );
  }
  return value;
}

function requireSchemaVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw portabilityStateError(
      "PORTABILITY_SCHEMA_VERSION_INVALID",
      "The portability application schema version is invalid.",
      "The export schema version is not available.",
      500,
    );
  }
  return value;
}

async function requireOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const allowed = await binding
    .prepare(`SELECT 1 AS allowed WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<{ allowed: number }>();
  if (allowed?.allowed !== 1) {
    throw portabilityStateError(
      "ROLE_REQUIRED",
      "Artist installation export requires active owner authority.",
      "Only the active owner can export artist definitions.",
      403,
    );
  }
}

const MANIFEST_SELECT = `SELECT id, export_key, schema_version,
    source_state_fingerprint, manifest_sha256, file_count,
    media_object_count, byte_count, status, contains_customer_data,
    contains_provider_payload, exported_by_user_id, verified_at,
    last_operation_key, created_at
  FROM export_manifests`;

async function readManifestByExportKey(
  binding: D1Database,
  exportKey: string,
): Promise<ExportManifestRow | null> {
  return binding
    .prepare(`${MANIFEST_SELECT} WHERE export_key = ?1 LIMIT 1`)
    .bind(exportKey)
    .first<ExportManifestRow>();
}

async function readManifestByOperationKey(
  binding: D1Database,
  operationKey: string,
): Promise<ExportManifestRow | null> {
  return binding
    .prepare(`${MANIFEST_SELECT} WHERE last_operation_key = ?1 LIMIT 1`)
    .bind(operationKey)
    .first<ExportManifestRow>();
}

async function readManifestByArchiveHash(
  binding: D1Database,
  archiveSha256: string,
): Promise<ExportManifestRow | null> {
  return binding
    .prepare(`${MANIFEST_SELECT} WHERE manifest_sha256 = ?1 LIMIT 1`)
    .bind(archiveSha256)
    .first<ExportManifestRow>();
}

function validateManifestRow(row: ExportManifestRow): ExportManifestRow {
  if (
    !SAFE_DIGEST.test(row.source_state_fingerprint) ||
    !SAFE_DIGEST.test(row.manifest_sha256) ||
    !Number.isSafeInteger(row.schema_version) ||
    row.schema_version < 1 ||
    !Number.isSafeInteger(row.file_count) ||
    row.file_count < 1 ||
    !Number.isSafeInteger(row.media_object_count) ||
    row.media_object_count < 0 ||
    !Number.isSafeInteger(row.byte_count) ||
    row.byte_count < 1 ||
    (row.status !== "ready" && row.status !== "verified") ||
    (row.contains_customer_data !== 0 &&
      row.contains_customer_data !== false) ||
    (row.contains_provider_payload !== 0 &&
      row.contains_provider_payload !== false) ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    (row.status === "verified" &&
      (row.verified_at === null ||
        !Number.isFinite(Date.parse(row.verified_at))))
  ) {
    return invalidStoredState("export manifest");
  }
  return row;
}

function countMediaObjects(snapshot: ArtistInstallationSnapshot): number {
  return snapshot.media.filter(({ entity }) => entity === "media-object")
    .length;
}

async function materializePersistedExport(
  rowInput: ExportManifestRow,
  snapshot: ArtistInstallationSnapshot,
): Promise<Omit<PortableExportResult, "replayed">> {
  const row = validateManifestRow(rowInput);
  const archive = await createArtistExportArchive(snapshot, {
    applicationSchemaVersion: row.schema_version,
    createdAt: isoInstant(row.created_at),
  });
  const verified = await verifyArtistExportArchive(archive);
  const bytes = serializeArtistExportArchive(verified.archive);
  const mediaObjectCount = countMediaObjects(verified.snapshot);
  if (
    row.source_state_fingerprint !== verified.semanticFingerprint ||
    row.manifest_sha256 !== verified.archiveSha256 ||
    row.file_count !== verified.archive.files.length ||
    row.media_object_count !== mediaObjectCount ||
    row.byte_count !== bytes.byteLength
  ) {
    return invalidStoredState("export manifest evidence");
  }
  return Object.freeze({
    archive: verified.archive,
    bytes,
    exportId: row.id,
    exportKey: row.export_key,
    archiveSha256: verified.archiveSha256,
    semanticFingerprint: verified.semanticFingerprint,
    fileCount: verified.archive.files.length,
    mediaObjectCount,
    byteCount: bytes.byteLength,
  });
}

export async function createPortableArtistExport(
  binding: D1Database,
  input: {
    readonly applicationSchemaVersion: number;
    readonly actorUserId: string;
    readonly idempotencyKey: string;
    readonly now?: () => Date;
  },
): Promise<PortableExportResult> {
  const schemaVersion = requireSchemaVersion(input.applicationSchemaVersion);
  const idempotencyKey = requireSafeOperationKey(input.idempotencyKey);
  const operationKey = `artist-export:create:${idempotencyKey}`;
  await requireOwner(binding, input.actorUserId);

  const snapshot = await readPortableArtistSnapshot(binding);
  const semanticFingerprint = await createSemanticFingerprint(snapshot);
  const exportKey = `artist-export:v${schemaVersion}:${semanticFingerprint}`;

  const operationReplay = await readManifestByOperationKey(
    binding,
    operationKey,
  );
  if (operationReplay) {
    if (
      operationReplay.export_key !== exportKey ||
      operationReplay.schema_version !== schemaVersion
    ) {
      throw portabilityStateError(
        "PORTABILITY_IDEMPOTENCY_CONFLICT",
        "The export operation key is bound to different artist definitions.",
        "This export operation key has already been used.",
      );
    }
    return Object.freeze({
      ...(await materializePersistedExport(operationReplay, snapshot)),
      replayed: true,
    });
  }

  const definitionReplay = await readManifestByExportKey(binding, exportKey);
  if (definitionReplay) {
    if (definitionReplay.schema_version !== schemaVersion) {
      throw portabilityStateError(
        "PORTABILITY_EXPORT_CONFLICT",
        "The artist definition fingerprint is bound to another schema version.",
        "The saved export does not match the current application schema.",
      );
    }
    return Object.freeze({
      ...(await materializePersistedExport(definitionReplay, snapshot)),
      replayed: true,
    });
  }

  const now = (input.now ?? (() => new Date()))();
  if (!Number.isFinite(now.valueOf())) invalidStoredState("export timestamp");
  const createdAt = now.toISOString();
  const archive = await createArtistExportArchive(snapshot, {
    applicationSchemaVersion: schemaVersion,
    createdAt,
  });
  const verified = await verifyArtistExportArchive(archive);
  const bytes = serializeArtistExportArchive(verified.archive);
  const mediaObjectCount = countMediaObjects(verified.snapshot);
  const exportId = `artist_export_v${schemaVersion}_${semanticFingerprint.slice(0, 32)}`;
  const authority = activeOwnerCondition(input.actorUserId);
  try {
    await binding
      .prepare(
        `INSERT INTO export_manifests
          (id, export_key, schema_version, source_state_fingerprint,
           manifest_sha256, file_count, media_object_count, byte_count,
           status, contains_customer_data, contains_provider_payload,
           exported_by_user_id, last_operation_key, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                'ready', 0, 0, ?9, ?10, ?11, ?11
         WHERE ${authority.sql}
         ON CONFLICT(export_key) DO NOTHING`,
      )
      .bind(
        exportId,
        exportKey,
        schemaVersion,
        verified.semanticFingerprint,
        verified.archiveSha256,
        verified.archive.files.length,
        mediaObjectCount,
        bytes.byteLength,
        input.actorUserId,
        operationKey,
        createdAt,
        ...authority.bindings,
      )
      .run();
  } catch (error) {
    const racedByOperation = await readManifestByOperationKey(
      binding,
      operationKey,
    );
    if (!racedByOperation) throw error;
  }

  const persisted = await readManifestByExportKey(binding, exportKey);
  if (!persisted) {
    throw portabilityStateError(
      "PORTABILITY_EXPORT_PERSIST_FAILED",
      "The portable export manifest could not be persisted.",
      "The artist export could not be recorded.",
      500,
    );
  }
  return Object.freeze({
    ...(await materializePersistedExport(persisted, snapshot)),
    replayed: persisted.last_operation_key !== operationKey,
  });
}

function verificationFacts(verified: VerifiedArtistExportArchive): {
  readonly fileCount: number;
  readonly mediaObjectCount: number;
  readonly byteCount: number;
} {
  return {
    fileCount: verified.archive.files.length,
    mediaObjectCount: countMediaObjects(verified.snapshot),
    byteCount: serializeArtistExportArchive(verified.archive).byteLength,
  };
}

function assertManifestMatchesVerification(
  rowInput: ExportManifestRow,
  verified: VerifiedArtistExportArchive,
): ExportManifestRow {
  const row = validateManifestRow(rowInput);
  const facts = verificationFacts(verified);
  if (
    row.schema_version !== verified.archive.manifest.applicationSchemaVersion ||
    row.source_state_fingerprint !== verified.semanticFingerprint ||
    row.manifest_sha256 !== verified.archiveSha256 ||
    row.file_count !== facts.fileCount ||
    row.media_object_count !== facts.mediaObjectCount ||
    row.byte_count !== facts.byteCount
  ) {
    throw portabilityStateError(
      "PORTABILITY_MANIFEST_MISMATCH",
      "The verified archive does not match its persisted manifest evidence.",
      "This archive does not match the saved artist export.",
    );
  }
  return row;
}

export async function markPortableArtistExportVerified(
  binding: D1Database,
  verified: VerifiedArtistExportArchive,
  input: {
    readonly actorUserId: string;
    readonly idempotencyKey: string;
    readonly now?: () => Date;
  },
): Promise<PortableExportVerificationResult> {
  requireSafeOperationKey(input.idempotencyKey);
  await requireOwner(binding, input.actorUserId);

  const existing = await readManifestByArchiveHash(
    binding,
    verified.archiveSha256,
  );
  if (!existing) {
    throw portabilityStateError(
      "PORTABILITY_MANIFEST_NOT_FOUND",
      "No persisted export manifest matches the verified archive.",
      "Create this artist export before verifying it.",
      404,
    );
  }
  const matched = assertManifestMatchesVerification(existing, verified);
  const facts = verificationFacts(verified);
  if (matched.status === "verified") {
    return Object.freeze({
      exportId: matched.id,
      exportKey: matched.export_key,
      archiveSha256: verified.archiveSha256,
      semanticFingerprint: verified.semanticFingerprint,
      ...facts,
      verifiedAt: isoInstant(matched.verified_at!),
      replayed: true,
    });
  }

  const now = (input.now ?? (() => new Date()))();
  if (!Number.isFinite(now.valueOf())) invalidStoredState("verification time");
  const verifiedAt = now.toISOString();
  const authority = activeOwnerCondition(input.actorUserId);
  const mutation = await binding
    .prepare(
      `UPDATE export_manifests
       SET status = 'verified', verified_at = ?1, updated_at = ?1
       WHERE id = ?2 AND status = 'ready'
         AND manifest_sha256 = ?3
         AND source_state_fingerprint = ?4
         AND ${authority.sql}`,
    )
    .bind(
      verifiedAt,
      matched.id,
      verified.archiveSha256,
      verified.semanticFingerprint,
      ...authority.bindings,
    )
    .run();

  const completed = await readManifestByArchiveHash(
    binding,
    verified.archiveSha256,
  );
  if (!completed || completed.status !== "verified" || !completed.verified_at) {
    throw portabilityStateError(
      "PORTABILITY_VERIFY_PERSIST_FAILED",
      "The export verification state could not be persisted.",
      "The artist export could not be marked verified.",
      500,
    );
  }
  assertManifestMatchesVerification(completed, verified);
  return Object.freeze({
    exportId: completed.id,
    exportKey: completed.export_key,
    archiveSha256: verified.archiveSha256,
    semanticFingerprint: verified.semanticFingerprint,
    ...facts,
    verifiedAt: isoInstant(completed.verified_at),
    replayed: mutation.meta.changes !== 1,
  });
}
