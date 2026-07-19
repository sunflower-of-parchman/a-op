import {
  SOURCE_STATE_SCHEMA_VERSION,
  SETUP_TOPIC_KEYS,
  type SetupTopicKey,
  type SourceStateResource,
  type SourceStateSnapshot,
} from "@/lib/setup/types.ts";
import { canonicalSha256 } from "@/lib/setup/canonical.ts";
import { createSourceStateFingerprint } from "@/lib/setup/source-state.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface InstallationRow {
  id: string;
  schema_version: number;
}

interface SetupRevisionRow {
  revision: number;
}

interface VersionRow {
  id: string;
  revision: number;
}

interface ResourceQuery {
  readonly kind: SetupTopicKey | "media" | "source";
  readonly table: string;
  readonly sql: string;
}

const RESOURCE_QUERIES: readonly ResourceQuery[] = Object.freeze([
  {
    kind: "artist",
    table: "artist_config",
    sql: "SELECT id, version AS revision FROM artist_config ORDER BY id",
  },
  {
    kind: "capabilities-navigation",
    table: "module_registry_state",
    sql: "SELECT id, revision FROM module_registry_state ORDER BY id",
  },
  {
    kind: "capabilities-navigation",
    table: "artist_modules",
    sql: "SELECT module_key AS id, revision FROM artist_modules ORDER BY module_key",
  },
  {
    kind: "capabilities-navigation",
    table: "navigation_sets",
    sql: "SELECT id, revision FROM navigation_sets ORDER BY id",
  },
  {
    kind: "capabilities-navigation",
    table: "navigation_items",
    sql: "SELECT id, CASE WHEN version < 1 THEN 1 ELSE version END AS revision FROM navigation_items ORDER BY id",
  },
  {
    kind: "rights-media",
    table: "media_objects",
    sql: "SELECT id, revision FROM media_objects ORDER BY id",
  },
  {
    kind: "rights-media",
    table: "media_derivatives",
    sql: "SELECT id, revision FROM media_derivatives ORDER BY id",
  },
  {
    kind: "catalog-releases",
    table: "tracks",
    sql: "SELECT id, version AS revision FROM tracks ORDER BY id",
  },
  {
    kind: "catalog-releases",
    table: "releases",
    sql: "SELECT id, version AS revision FROM releases ORDER BY id",
  },
  {
    kind: "catalog-releases",
    table: "collections",
    sql: "SELECT id, version AS revision FROM collections ORDER BY id",
  },
  {
    kind: "catalog-releases",
    table: "credits",
    sql: "SELECT id, CASE WHEN position < 1 THEN 1 ELSE position END AS revision FROM credits ORDER BY id",
  },
  {
    kind: "streaming-downloads",
    table: "track_revisions",
    sql: "SELECT id, revision FROM track_revisions ORDER BY id",
  },
  {
    kind: "streaming-downloads",
    table: "media_derivatives",
    sql: "SELECT id, revision FROM media_derivatives ORDER BY id",
  },
  {
    kind: "customer-access",
    table: "access_plans",
    sql: "SELECT id, revision FROM access_plans ORDER BY id",
  },
  {
    kind: "customer-access",
    table: "access_plan_items",
    sql: "SELECT id, CASE WHEN position < 1 THEN 1 ELSE position END AS revision FROM access_plan_items ORDER BY id",
  },
  {
    kind: "customer-access",
    table: "access_grant_templates",
    sql: "SELECT id, revision FROM access_grant_templates ORDER BY id",
  },
  {
    kind: "memberships-subscriptions",
    table: "membership_plans",
    sql: "SELECT id, current_revision AS revision FROM membership_plans ORDER BY id",
  },
  {
    kind: "memberships-subscriptions",
    table: "subscription_plans",
    sql: "SELECT id, revision FROM subscription_plans ORDER BY id",
  },
  {
    kind: "memberships-subscriptions",
    table: "commerce_products",
    sql: "SELECT id, revision FROM commerce_products WHERE product_type IN ('membership', 'subscription') ORDER BY id",
  },
  {
    kind: "memberships-subscriptions",
    table: "commerce_binding_intents_memberships",
    sql: "SELECT id, revision FROM commerce_binding_intents WHERE intent_kind IN ('membership', 'subscription') ORDER BY id",
  },
  {
    kind: "credits",
    table: "membership_credit_rules",
    sql: "SELECT id, revision FROM membership_credit_rules ORDER BY id",
  },
  {
    kind: "credits",
    table: "commerce_products",
    sql: "SELECT id, revision FROM commerce_products WHERE product_type IN ('download-credits', 'license-credits') ORDER BY id",
  },
  {
    kind: "credits",
    table: "commerce_prices",
    sql: "SELECT id, revision FROM commerce_prices ORDER BY id",
  },
  {
    kind: "licensing",
    table: "license_terms",
    sql: "SELECT id, current_version AS revision FROM license_terms ORDER BY id",
  },
  {
    kind: "licensing",
    table: "license_options",
    sql: "SELECT id, CASE WHEN position < 1 THEN 1 ELSE position END AS revision FROM license_options ORDER BY id",
  },
  {
    kind: "licensing",
    table: "license_offers",
    sql: "SELECT id, revision FROM license_offers ORDER BY id",
  },
  {
    kind: "licensing",
    table: "commerce_binding_intents_licensing",
    sql: "SELECT id, revision FROM commerce_binding_intents WHERE intent_kind = 'license' ORDER BY id",
  },
  {
    kind: "courses-video",
    table: "courses",
    sql: "SELECT id, revision FROM courses ORDER BY id",
  },
  {
    kind: "courses-video",
    table: "lessons",
    sql: "SELECT id, CASE WHEN position < 1 THEN 1 ELSE position END AS revision FROM lessons ORDER BY id",
  },
  {
    kind: "courses-video",
    table: "videos",
    sql: "SELECT id, revision FROM videos ORDER BY id",
  },
  {
    kind: "contact-consent",
    table: "contact_forms",
    sql: "SELECT id, revision FROM contact_forms ORDER BY id",
  },
  {
    kind: "telemetry-retention",
    table: "telemetry_settings",
    sql: "SELECT id, revision FROM telemetry_settings ORDER BY id",
  },
  {
    kind: "privacy-terms",
    table: "legal_documents",
    sql: "SELECT id, revision FROM legal_documents ORDER BY id",
  },
  {
    kind: "accounts-publication",
    table: "installation_state",
    sql: "SELECT id, schema_version AS revision FROM installation_state ORDER BY id",
  },
  {
    kind: "accounts-publication",
    table: "role_assignments",
    sql: "SELECT id, CASE WHEN revoked_at IS NULL THEN 1 ELSE 2 END AS revision FROM role_assignments WHERE role_key IN ('owner', 'editor') ORDER BY id",
  },
  {
    kind: "source",
    table: "pages",
    sql: "SELECT id, version AS revision FROM pages ORDER BY id",
  },
  {
    kind: "source",
    table: "content_sections",
    sql: "SELECT id, version AS revision FROM content_sections ORDER BY id",
  },
  {
    kind: "source",
    table: "editorial_posts",
    sql: "SELECT id, revision FROM editorial_posts ORDER BY id",
  },
  {
    kind: "source",
    table: "updates",
    sql: "SELECT id, revision FROM updates ORDER BY id",
  },
  {
    kind: "media",
    table: "media_objects",
    sql: "SELECT id, revision FROM media_objects ORDER BY id",
  },
  {
    kind: "media",
    table: "media_derivatives",
    sql: "SELECT id, revision FROM media_derivatives ORDER BY id",
  },
  {
    kind: "media",
    table: "media_jobs",
    sql: "SELECT id, attempt_count + 1 AS revision FROM media_jobs ORDER BY id",
  },
]);

function invalidState(message: string): RuntimeError {
  return new RuntimeError("SETUP_SOURCE_STATE_INVALID", message, {
    status: 500,
    publicMessage: "The current installation state could not be fingerprinted.",
  });
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw invalidState(`${label} must be a positive safe integer.`);
  }
  return value as number;
}

function compareResource(
  left: SourceStateResource,
  right: SourceStateResource,
): number {
  const leftKey = `${left.kind}\u0000${left.resourceKey}`;
  const rightKey = `${right.kind}\u0000${right.resourceKey}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

export async function readSetupSourceStateSnapshot(
  binding: D1Database,
): Promise<SourceStateSnapshot> {
  const [installation, setup, ...groups] = await Promise.all([
    binding
      .prepare(
        `SELECT id, schema_version
         FROM installation_state
         WHERE id = 'installation'
         LIMIT 1`,
      )
      .first<InstallationRow>(),
    binding
      .prepare("SELECT revision FROM setup_state WHERE id = 'setup' LIMIT 1")
      .first<SetupRevisionRow>(),
    ...RESOURCE_QUERIES.map((query) =>
      binding.prepare(query.sql).all<VersionRow>(),
    ),
  ]);
  if (!installation || !setup) {
    throw invalidState("The installation or setup checkpoint is missing.");
  }

  const resources: SourceStateResource[] = SETUP_TOPIC_KEYS.map((kind) => ({
    kind,
    resourceKey: `topic-${kind}`,
    revision: 1,
    contentHash: null,
  }));
  resources.push(
    {
      kind: "media",
      resourceKey: "topic-media",
      revision: 1,
      contentHash: null,
    },
    {
      kind: "source",
      resourceKey: "topic-source",
      revision: 1,
      contentHash: null,
    },
  );

  const storedResources = await Promise.all(
    RESOURCE_QUERIES.map(async (query, index): Promise<SourceStateResource> => {
      const rows = groups[index].results.map((row) => {
        if (typeof row.id !== "string" || row.id.length === 0) {
          throw invalidState(`${query.table} returned an invalid resource ID.`);
        }
        return {
          id: row.id,
          revision: positiveInteger(row.revision, `${query.table} revision`),
        };
      });
      return {
        kind: query.kind,
        resourceKey: `table-${query.table.replaceAll("_", "-")}`,
        revision: rows.reduce(
          (maximum, row) => Math.max(maximum, row.revision),
          1,
        ),
        contentHash: await canonicalSha256(rows),
      };
    }),
  );
  resources.push(...storedResources);

  resources.sort(compareResource);
  return Object.freeze({
    schemaVersion: SOURCE_STATE_SCHEMA_VERSION,
    installationId: installation.id,
    d1SchemaVersion: positiveInteger(
      installation.schema_version,
      "D1 schema version",
    ),
    setupRevision: positiveInteger(setup.revision, "setup revision"),
    resources: Object.freeze(
      resources.map((resource) => Object.freeze(resource)),
    ),
  });
}

export async function readSetupSourceState(binding: D1Database): Promise<{
  readonly snapshot: SourceStateSnapshot;
  readonly fingerprint: string;
}> {
  const snapshot = await readSetupSourceStateSnapshot(binding);
  const fingerprint = await createSourceStateFingerprint(snapshot);
  return Object.freeze({ snapshot, fingerprint });
}
