import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("users_normalized_email_unique").on(table.normalizedEmail),
    check(
      "users_email_normalized",
      sql`${table.normalizedEmail} = lower(trim(${table.email}))`,
    ),
    check("users_status_valid", sql`${table.status} in ('active', 'disabled')`),
  ],
);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  revision: integer("revision").notNull().default(1),
  lastOperationKey: text("last_operation_key"),
  createdAt: createdAt(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const roles = sqliteTable(
  "roles",
  {
    key: text("key", { enum: ["owner", "editor", "customer"] }).primaryKey(),
    label: text("label").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "roles_key_valid",
      sql`${table.key} in ('owner', 'editor', 'customer')`,
    ),
  ],
);

export const roleAssignments = sqliteTable(
  "role_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleKey: text("role_key", {
      enum: ["owner", "editor", "customer"],
    })
      .notNull()
      .references(() => roles.key, { onDelete: "restrict" }),
    assignedByUserId: text("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
  },
  (table) => [
    uniqueIndex("role_assignments_active_user_role_unique")
      .on(table.userId, table.roleKey)
      .where(sql`${table.revokedAt} is null`),
    index("role_assignments_active_lookup").on(table.userId, table.revokedAt),
  ],
);

export const mediaObjects = sqliteTable(
  "media_objects",
  {
    id: text("id").primaryKey(),
    objectKey: text("object_key").notNull(),
    kind: text("kind", {
      enum: ["audio", "image", "video", "document", "export", "other"],
    })
      .notNull()
      .default("other"),
    visibility: text("visibility", {
      enum: ["public", "protected"],
    })
      .notNull()
      .default("protected"),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    contentType: text("content_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    etag: text("etag"),
    sourceVersion: integer("source_version").notNull().default(1),
    status: text("status", {
      enum: ["pending", "ready", "failed", "archived"],
    })
      .notNull()
      .default("ready"),
    approvalState: text("approval_state", {
      enum: ["pending", "approved", "rejected"],
    })
      .notNull()
      .default("pending"),
    contentSha256: text("content_sha256"),
    durationMs: integer("duration_ms"),
    channels: integer("channels"),
    sampleRate: integer("sample_rate"),
    revision: integer("revision").notNull().default(1),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: text("approved_at"),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("media_objects_object_key_unique").on(table.objectKey),
    index("media_objects_visibility_idx").on(table.visibility),
    check(
      "media_objects_byte_length_nonnegative",
      sql`${table.byteLength} >= 0`,
    ),
    check(
      "media_objects_visibility_valid",
      sql`${table.visibility} in ('public', 'protected')`,
    ),
    check(
      "media_objects_kind_valid",
      sql`${table.kind} in ('audio', 'image', 'video', 'document', 'export', 'other')`,
    ),
    check(
      "media_objects_source_version_positive",
      sql`${table.sourceVersion} > 0`,
    ),
    check(
      "media_objects_status_valid",
      sql`${table.status} in ('pending', 'ready', 'failed', 'archived')`,
    ),
    check(
      "media_objects_approval_valid",
      sql`${table.approvalState} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      "media_objects_duration_nonnegative",
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
    check("media_objects_revision_positive", sql`${table.revision} > 0`),
    check(
      "media_objects_key_namespace",
      sql`${table.objectKey} glob 'originals/*'`,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    idempotencyKey: text("idempotency_key"),
    requestFingerprint: text("request_fingerprint"),
    requestId: text("request_id"),
    detailsJson: text("details_json").notNull().default("{}"),
    resultJson: text("result_json").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_subject_idx").on(
      table.subjectType,
      table.subjectId,
      table.createdAt,
    ),
    index("audit_events_actor_idx").on(table.actorUserId, table.createdAt),
    uniqueIndex("audit_events_idempotency_key_unique").on(table.idempotencyKey),
    check(
      "audit_events_details_json_valid",
      sql`json_valid(${table.detailsJson})`,
    ),
    check(
      "audit_events_result_json_valid",
      sql`json_valid(${table.resultJson})`,
    ),
  ],
);

export const installationState = sqliteTable(
  "installation_state",
  {
    id: text("id").primaryKey(),
    status: text("status", { enum: ["pending", "active"] })
      .notNull()
      .default("pending"),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    schemaVersion: integer("schema_version").notNull().default(19),
    lastOperationKey: text("last_operation_key"),
    bootstrapCompletedAt: text("bootstrap_completed_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "installation_state_status_valid",
      sql`${table.status} in ('pending', 'active')`,
    ),
    check(
      "installation_state_schema_version_positive",
      sql`${table.schemaVersion} > 0`,
    ),
  ],
);

export const artistConfig = sqliteTable(
  "artist_config",
  {
    id: text("id").primaryKey(),
    draftRevisionId: text("draft_revision_id").notNull(),
    publishedRevisionId: text("published_revision_id"),
    version: integer("version").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
  },
  (table) => [
    check("artist_config_version_positive", sql`${table.version} > 0`),
  ],
);

export const artistConfigRevisions = sqliteTable(
  "artist_config_revisions",
  {
    id: text("id").primaryKey(),
    artistConfigId: text("artist_config_id")
      .notNull()
      .references(() => artistConfig.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    displayName: text("display_name").notNull(),
    siteTitle: text("site_title").notNull(),
    headline: text("headline").notNull(),
    introduction: text("introduction").notNull(),
    footerText: text("footer_text").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("artist_config_revisions_number_unique").on(
      table.artistConfigId,
      table.revision,
    ),
    check(
      "artist_config_revisions_number_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);

export const artistModules = sqliteTable(
  "artist_modules",
  {
    moduleKey: text("module_key", {
      enum: [
        "downloads",
        "customer-library",
        "licensing",
        "memberships",
        "subscriptions",
        "courses",
        "video",
        "whats-new",
        "contact",
        "telemetry",
      ],
    }).primaryKey(),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    settingsJson: text("settings_json").notNull().default("{}"),
    activatedAt: text("activated_at"),
    deactivatedAt: text("deactivated_at"),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("artist_modules_active_idx").on(table.active, table.moduleKey),
    check("artist_modules_active_valid", sql`${table.active} in (0, 1)`),
    check("artist_modules_revision_positive", sql`${table.revision} > 0`),
    check(
      "artist_modules_settings_json_valid",
      sql`json_valid(${table.settingsJson})`,
    ),
  ],
);

export const moduleRegistryState = sqliteTable(
  "module_registry_state",
  {
    id: text("id").primaryKey(),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("module_registry_state_id_valid", sql`${table.id} = 'registry'`),
    check(
      "module_registry_state_revision_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);

export const artistDomains = sqliteTable(
  "artist_domains",
  {
    id: text("id").primaryKey(),
    hostname: text("hostname").notNull(),
    kind: text("kind", { enum: ["canonical", "redirect"] }).notNull(),
    status: text("status", {
      enum: ["pending", "verified", "active", "disabled"],
    })
      .notNull()
      .default("pending"),
    verifiedAt: text("verified_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("artist_domains_hostname_unique").on(table.hostname),
    index("artist_domains_status_idx").on(table.status),
    check(
      "artist_domains_hostname_normalized",
      sql`${table.hostname} = lower(trim(${table.hostname}))`,
    ),
    check(
      "artist_domains_kind_valid",
      sql`${table.kind} in ('canonical', 'redirect')`,
    ),
    check(
      "artist_domains_status_valid",
      sql`${table.status} in ('pending', 'verified', 'active', 'disabled')`,
    ),
  ],
);

export const navigationSets = sqliteTable(
  "navigation_sets",
  {
    id: text("id", { enum: ["primary", "footer"] }).primaryKey(),
    label: text("label").notNull(),
    draftVersion: integer("draft_version").notNull().default(1),
    publishedVersion: integer("published_version"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
  },
  (table) => [
    check(
      "navigation_sets_id_valid",
      sql`${table.id} in ('primary', 'footer')`,
    ),
    check(
      "navigation_sets_draft_version_positive",
      sql`${table.draftVersion} > 0`,
    ),
    check(
      "navigation_sets_published_version_positive",
      sql`${table.publishedVersion} is null or ${table.publishedVersion} > 0`,
    ),
    check("navigation_sets_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const navigationItems = sqliteTable(
  "navigation_items",
  {
    id: text("id").primaryKey(),
    navigationSetId: text("navigation_set_id", {
      enum: ["primary", "footer"],
    })
      .notNull()
      .references(() => navigationSets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    itemKey: text("item_key").notNull(),
    label: text("label").notNull(),
    href: text("href").notNull(),
    position: integer("position").notNull(),
    moduleKey: text("module_key", {
      enum: [
        "downloads",
        "customer-library",
        "licensing",
        "memberships",
        "subscriptions",
        "courses",
        "video",
        "whats-new",
        "contact",
        "telemetry",
      ],
    }),
    external: integer("external", { mode: "boolean" }).notNull().default(false),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("navigation_items_version_key_unique").on(
      table.navigationSetId,
      table.version,
      table.itemKey,
    ),
    uniqueIndex("navigation_items_version_position_unique").on(
      table.navigationSetId,
      table.version,
      table.position,
    ),
    index("navigation_items_published_lookup").on(
      table.navigationSetId,
      table.version,
      table.position,
    ),
    check("navigation_items_version_positive", sql`${table.version} > 0`),
    check("navigation_items_position_nonnegative", sql`${table.position} >= 0`),
    check("navigation_items_external_valid", sql`${table.external} in (0, 1)`),
  ],
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    moduleKey: text("module_key", {
      enum: [
        "downloads",
        "customer-library",
        "licensing",
        "memberships",
        "subscriptions",
        "courses",
        "video",
        "whats-new",
        "contact",
        "telemetry",
      ],
    }),
    kind: text("kind", { enum: ["standard", "legal", "system"] })
      .notNull()
      .default("standard"),
    draftRevisionId: text("draft_revision_id").notNull(),
    publishedRevisionId: text("published_revision_id"),
    publicationState: text("publication_state", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
  },
  (table) => [
    uniqueIndex("pages_slug_unique").on(table.slug),
    index("pages_public_lookup").on(
      table.publicationState,
      table.moduleKey,
      table.slug,
    ),
    check(
      "pages_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check("pages_slug_no_slash", sql`instr(${table.slug}, '/') = 0`),
    check(
      "pages_kind_valid",
      sql`${table.kind} in ('standard', 'legal', 'system')`,
    ),
    check(
      "pages_publication_state_valid",
      sql`${table.publicationState} in ('draft', 'published', 'archived')`,
    ),
    check("pages_version_positive", sql`${table.version} > 0`),
  ],
);

export const pageRevisions = sqliteTable(
  "page_revisions",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    moduleKey: text("module_key", {
      enum: [
        "downloads",
        "customer-library",
        "licensing",
        "memberships",
        "subscriptions",
        "courses",
        "video",
        "whats-new",
        "contact",
        "telemetry",
      ],
    }),
    kind: text("kind", { enum: ["standard", "legal", "system"] })
      .notNull()
      .default("standard"),
    title: text("title").notNull(),
    introduction: text("introduction").notNull(),
    bodyText: text("body_text").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("page_revisions_number_unique").on(
      table.pageId,
      table.revision,
    ),
    index("page_revisions_page_created_idx").on(table.pageId, table.createdAt),
    check("page_revisions_number_positive", sql`${table.revision} > 0`),
  ],
);

export const contentSections = sqliteTable(
  "content_sections",
  {
    id: text("id").primaryKey(),
    sectionKey: text("section_key").notNull(),
    draftRevisionId: text("draft_revision_id").notNull(),
    publishedRevisionId: text("published_revision_id"),
    publicationState: text("publication_state", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    publishedAt: text("published_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("content_sections_key_unique").on(table.sectionKey),
    index("content_sections_publication_key_idx").on(
      table.publicationState,
      table.sectionKey,
    ),
    check(
      "content_sections_key_normalized",
      sql`${table.sectionKey} = lower(trim(${table.sectionKey})) and instr(${table.sectionKey}, '/') = 0`,
    ),
    check(
      "content_sections_publication_state_valid",
      sql`${table.publicationState} in ('draft', 'published', 'archived')`,
    ),
    check(
      "content_sections_publication_fields_valid",
      sql`(${table.publicationState} = 'published' and ${table.publishedRevisionId} is not null and ${table.publishedAt} is not null) or (${table.publicationState} <> 'published')`,
    ),
    check("content_sections_version_positive", sql`${table.version} > 0`),
  ],
);

export const contentSectionRevisions = sqliteTable(
  "content_section_revisions",
  {
    id: text("id").primaryKey(),
    contentSectionId: text("content_section_id")
      .notNull()
      .references(() => contentSections.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    kind: text("kind", { enum: ["prose", "quote", "callout"] })
      .notNull()
      .default("prose"),
    heading: text("heading").notNull().default(""),
    bodyText: text("body_text").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("content_section_revisions_number_unique").on(
      table.contentSectionId,
      table.revision,
    ),
    uniqueIndex("content_section_revisions_identity_section_unique").on(
      table.id,
      table.contentSectionId,
    ),
    check(
      "content_section_revisions_kind_valid",
      sql`${table.kind} in ('prose', 'quote', 'callout')`,
    ),
    check(
      "content_section_revisions_body_present",
      sql`length(trim(${table.bodyText})) > 0`,
    ),
    check(
      "content_section_revisions_number_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);

export const pageRevisionSections = sqliteTable(
  "page_revision_sections",
  {
    id: text("id").primaryKey(),
    pageRevisionId: text("page_revision_id")
      .notNull()
      .references(() => pageRevisions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    contentSectionId: text("content_section_id").notNull(),
    contentSectionRevisionId: text("content_section_revision_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("page_revision_sections_position_unique").on(
      table.pageRevisionId,
      table.position,
    ),
    uniqueIndex("page_revision_sections_section_unique").on(
      table.pageRevisionId,
      table.contentSectionId,
    ),
    index("page_revision_sections_section_revision_idx").on(
      table.contentSectionId,
      table.contentSectionRevisionId,
    ),
    foreignKey({
      columns: [table.contentSectionRevisionId, table.contentSectionId],
      foreignColumns: [
        contentSectionRevisions.id,
        contentSectionRevisions.contentSectionId,
      ],
      name: "page_revision_sections_section_revision_fk",
    }).onDelete("restrict"),
    check(
      "page_revision_sections_position_positive",
      sql`${table.position} > 0`,
    ),
  ],
);

export const editorPermissions = sqliteTable(
  "editor_permissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key", {
      enum: ["pages.write", "catalog.write", "media.write"],
    }).notNull(),
    scopeId: text("scope_id").notNull().default("*"),
    assignedByUserId: text("assigned_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
  },
  (table) => [
    uniqueIndex("editor_permissions_active_user_scope_unique")
      .on(table.userId, table.permissionKey, table.scopeId)
      .where(sql`${table.revokedAt} is null`),
    index("editor_permissions_active_lookup").on(
      table.userId,
      table.permissionKey,
      table.revokedAt,
    ),
    check(
      "editor_permissions_key_valid",
      sql`${table.permissionKey} in ('pages.write', 'catalog.write', 'media.write')`,
    ),
  ],
);

export const mediaDerivatives = sqliteTable(
  "media_derivatives",
  {
    id: text("id").primaryKey(),
    sourceMediaId: text("source_media_id")
      .notNull()
      .references(() => mediaObjects.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "streaming",
        "download",
        "waveform",
        "artwork",
        "poster",
        "thumbnail",
        "transcript",
        "document",
        "other",
      ],
    }).notNull(),
    processingProfile: text("processing_profile").notNull(),
    processingVersion: text("processing_version").notNull(),
    objectKey: text("object_key"),
    status: text("status", {
      enum: ["pending", "processing", "ready", "failed"],
    })
      .notNull()
      .default("pending"),
    approvalState: text("approval_state", {
      enum: ["pending", "approved", "rejected"],
    })
      .notNull()
      .default("pending"),
    contentType: text("content_type"),
    format: text("format"),
    bitrateKbps: integer("bitrate_kbps"),
    durationMs: integer("duration_ms"),
    channels: integer("channels"),
    sampleRate: integer("sample_rate"),
    byteLength: integer("byte_length"),
    contentSha256: text("content_sha256"),
    revision: integer("revision").notNull().default(1),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: text("approved_at"),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("media_derivatives_object_key_unique")
      .on(table.objectKey)
      .where(sql`${table.objectKey} is not null`),
    uniqueIndex("media_derivatives_profile_unique").on(
      table.sourceMediaId,
      table.kind,
      table.processingProfile,
      table.processingVersion,
    ),
    index("media_derivatives_delivery_idx").on(
      table.status,
      table.approvalState,
      table.kind,
    ),
    check(
      "media_derivatives_status_valid",
      sql`${table.status} in ('pending', 'processing', 'ready', 'failed')`,
    ),
    check(
      "media_derivatives_kind_valid",
      sql`${table.kind} in ('streaming', 'download', 'waveform', 'artwork', 'poster', 'thumbnail', 'transcript', 'document', 'other')`,
    ),
    check(
      "media_derivatives_approval_valid",
      sql`${table.approvalState} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      "media_derivatives_byte_length_nonnegative",
      sql`${table.byteLength} is null or ${table.byteLength} >= 0`,
    ),
    check(
      "media_derivatives_duration_nonnegative",
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
    check(
      "media_derivatives_ready_complete",
      sql`${table.status} != 'ready' or (${table.objectKey} is not null and ${table.contentType} is not null and ${table.byteLength} is not null)`,
    ),
    check("media_derivatives_revision_positive", sql`${table.revision} > 0`),
    check(
      "media_derivatives_key_namespace",
      sql`${table.objectKey} is null or ${table.objectKey} glob 'derivatives/*'`,
    ),
  ],
);

export const mediaJobs = sqliteTable(
  "media_jobs",
  {
    id: text("id").primaryKey(),
    sourceMediaId: text("source_media_id")
      .notNull()
      .references(() => mediaObjects.id, { onDelete: "cascade" }),
    derivativeKind: text("derivative_kind", {
      enum: [
        "streaming",
        "download",
        "waveform",
        "artwork",
        "poster",
        "thumbnail",
        "transcript",
        "document",
        "other",
      ],
    }).notNull(),
    processingProfile: text("processing_profile").notNull(),
    processingVersion: text("processing_version").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "ready", "failed"],
    })
      .notNull()
      .default("pending"),
    requestedByUserId: text("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    leaseToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    resultDerivativeId: text("result_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "set null" },
    ),
    lastErrorCode: text("last_error_code"),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("media_jobs_claim_idx").on(
      table.status,
      table.leaseExpiresAt,
      table.createdAt,
    ),
    uniqueIndex("media_jobs_profile_unique").on(
      table.sourceMediaId,
      table.derivativeKind,
      table.processingProfile,
      table.processingVersion,
    ),
    check(
      "media_jobs_status_valid",
      sql`${table.status} in ('pending', 'processing', 'ready', 'failed')`,
    ),
    check(
      "media_jobs_derivative_kind_valid",
      sql`${table.derivativeKind} in ('streaming', 'download', 'waveform', 'artwork', 'poster', 'thumbnail', 'transcript', 'document', 'other')`,
    ),
    check(
      "media_jobs_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);

export const mediaJobAttempts = sqliteTable(
  "media_job_attempts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => mediaJobs.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    status: text("status", {
      enum: ["processing", "ready", "failed", "stale"],
    }).notNull(),
    workerId: text("worker_id"),
    leaseToken: text("lease_token").notNull(),
    errorCode: text("error_code"),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    startedAt: createdAt(),
    finishedAt: text("finished_at"),
  },
  (table) => [
    uniqueIndex("media_job_attempts_number_unique").on(
      table.jobId,
      table.attempt,
    ),
    check("media_job_attempts_positive", sql`${table.attempt} > 0`),
    check(
      "media_job_attempts_status_valid",
      sql`${table.status} in ('processing', 'ready', 'failed', 'stale')`,
    ),
    check(
      "media_job_attempts_evidence_json_valid",
      sql`json_valid(${table.evidenceJson})`,
    ),
  ],
);

export const tracks = sqliteTable(
  "tracks",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    draftRevisionId: text("draft_revision_id").notNull(),
    publishedRevisionId: text("published_revision_id"),
    publicationState: text("publication_state", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
  },
  (table) => [
    uniqueIndex("tracks_slug_unique").on(table.slug),
    index("tracks_public_lookup").on(table.publicationState, table.slug),
    check(
      "tracks_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check("tracks_slug_no_slash", sql`instr(${table.slug}, '/') = 0`),
    check(
      "tracks_publication_state_valid",
      sql`${table.publicationState} in ('draft', 'published', 'archived')`,
    ),
    check("tracks_version_positive", sql`${table.version} > 0`),
  ],
);

export const trackRevisions = sqliteTable(
  "track_revisions",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description").notNull().default(""),
    durationMs: integer("duration_ms"),
    meter: text("meter"),
    tempoBpm: integer("tempo_bpm"),
    musicalKey: text("musical_key"),
    isrc: text("isrc"),
    copyrightNotice: text("copyright_notice").notNull().default(""),
    explicit: integer("explicit", { mode: "boolean" }).notNull().default(false),
    viewMode: text("view_mode", {
      enum: ["public", "account", "protected", "unavailable"],
    })
      .notNull()
      .default("public"),
    streamMode: text("stream_mode", {
      enum: ["public", "account", "protected", "unavailable"],
    })
      .notNull()
      .default("unavailable"),
    downloadMode: text("download_mode", {
      enum: ["public", "account", "protected", "unavailable"],
    })
      .notNull()
      .default("unavailable"),
    originalMediaId: text("original_media_id").references(
      () => mediaObjects.id,
      { onDelete: "set null" },
    ),
    streamingDerivativeId: text("streaming_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "set null" },
    ),
    downloadDerivativeId: text("download_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "set null" },
    ),
    tagsJson: text("tags_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("track_revisions_number_unique").on(
      table.trackId,
      table.revision,
    ),
    uniqueIndex("track_revisions_owner_id_unique").on(table.trackId, table.id),
    uniqueIndex("track_revisions_identity_number_unique").on(
      table.trackId,
      table.id,
      table.revision,
    ),
    index("track_revisions_stream_idx").on(
      table.streamMode,
      table.streamingDerivativeId,
    ),
    check("track_revisions_number_positive", sql`${table.revision} > 0`),
    check(
      "track_revisions_duration_nonnegative",
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
    check(
      "track_revisions_tempo_positive",
      sql`${table.tempoBpm} is null or (${table.tempoBpm} > 0 and ${table.tempoBpm} <= 1000)`,
    ),
    check("track_revisions_explicit_valid", sql`${table.explicit} in (0, 1)`),
    check(
      "track_revisions_view_mode_valid",
      sql`${table.viewMode} in ('public', 'account', 'protected', 'unavailable')`,
    ),
    check(
      "track_revisions_stream_mode_valid",
      sql`${table.streamMode} in ('public', 'account', 'protected', 'unavailable')`,
    ),
    check(
      "track_revisions_download_mode_valid",
      sql`${table.downloadMode} in ('public', 'account', 'protected', 'unavailable')`,
    ),
    check(
      "track_revisions_tags_json_valid",
      sql`json_valid(${table.tagsJson})`,
    ),
  ],
);

export const releases = sqliteTable(
  "releases",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    draftRevisionId: text("draft_revision_id").notNull(),
    publishedRevisionId: text("published_revision_id"),
    publicationState: text("publication_state", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
  },
  (table) => [
    uniqueIndex("releases_slug_unique").on(table.slug),
    index("releases_public_lookup").on(table.publicationState, table.slug),
    check(
      "releases_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check("releases_slug_no_slash", sql`instr(${table.slug}, '/') = 0`),
    check(
      "releases_publication_state_valid",
      sql`${table.publicationState} in ('draft', 'published', 'archived')`,
    ),
    check("releases_version_positive", sql`${table.version} > 0`),
  ],
);

export const releaseRevisions = sqliteTable(
  "release_revisions",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    releaseType: text("release_type", {
      enum: ["single", "ep", "album", "compilation", "live", "other"],
    })
      .notNull()
      .default("album"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description").notNull().default(""),
    releaseDate: text("release_date"),
    catalogNumber: text("catalog_number"),
    copyrightNotice: text("copyright_notice").notNull().default(""),
    viewMode: text("view_mode", {
      enum: ["public", "account", "protected", "unavailable"],
    })
      .notNull()
      .default("public"),
    artworkDerivativeId: text("artwork_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "set null" },
    ),
    tagsJson: text("tags_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("release_revisions_number_unique").on(
      table.releaseId,
      table.revision,
    ),
    index("release_revisions_date_idx").on(
      table.releaseDate,
      table.releaseType,
    ),
    check("release_revisions_number_positive", sql`${table.revision} > 0`),
    check(
      "release_revisions_type_valid",
      sql`${table.releaseType} in ('single', 'ep', 'album', 'compilation', 'live', 'other')`,
    ),
    check(
      "release_revisions_view_mode_valid",
      sql`${table.viewMode} in ('public', 'account', 'protected', 'unavailable')`,
    ),
    check(
      "release_revisions_tags_json_valid",
      sql`json_valid(${table.tagsJson})`,
    ),
  ],
);

export const releaseTracks = sqliteTable(
  "release_tracks",
  {
    id: text("id").primaryKey(),
    releaseRevisionId: text("release_revision_id")
      .notNull()
      .references(() => releaseRevisions.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    trackRevisionId: text("track_revision_id").notNull(),
    position: integer("position").notNull(),
    discNumber: integer("disc_number").notNull().default(1),
    trackNumber: integer("track_number").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("release_tracks_position_unique").on(
      table.releaseRevisionId,
      table.position,
    ),
    uniqueIndex("release_tracks_track_unique").on(
      table.releaseRevisionId,
      table.trackId,
    ),
    uniqueIndex("release_tracks_revision_unique").on(
      table.releaseRevisionId,
      table.trackRevisionId,
    ),
    uniqueIndex("release_tracks_number_unique").on(
      table.releaseRevisionId,
      table.discNumber,
      table.trackNumber,
    ),
    foreignKey({
      columns: [table.trackId, table.trackRevisionId],
      foreignColumns: [trackRevisions.trackId, trackRevisions.id],
      name: "release_tracks_track_revision_owner_fk",
    }).onDelete("restrict"),
    check("release_tracks_position_positive", sql`${table.position} > 0`),
    check("release_tracks_disc_positive", sql`${table.discNumber} > 0`),
    check("release_tracks_number_positive", sql`${table.trackNumber} > 0`),
  ],
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    draftRevisionId: text("draft_revision_id").notNull(),
    publishedRevisionId: text("published_revision_id"),
    publicationState: text("publication_state", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
  },
  (table) => [
    uniqueIndex("collections_slug_unique").on(table.slug),
    index("collections_public_lookup").on(table.publicationState, table.slug),
    check(
      "collections_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check("collections_slug_no_slash", sql`instr(${table.slug}, '/') = 0`),
    check(
      "collections_publication_state_valid",
      sql`${table.publicationState} in ('draft', 'published', 'archived')`,
    ),
    check("collections_version_positive", sql`${table.version} > 0`),
  ],
);

export const collectionRevisions = sqliteTable(
  "collection_revisions",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    viewMode: text("view_mode", {
      enum: ["public", "account", "protected", "unavailable"],
    })
      .notNull()
      .default("public"),
    artworkDerivativeId: text("artwork_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "set null" },
    ),
    tagsJson: text("tags_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("collection_revisions_number_unique").on(
      table.collectionId,
      table.revision,
    ),
    check("collection_revisions_number_positive", sql`${table.revision} > 0`),
    check(
      "collection_revisions_view_mode_valid",
      sql`${table.viewMode} in ('public', 'account', 'protected', 'unavailable')`,
    ),
    check(
      "collection_revisions_tags_json_valid",
      sql`json_valid(${table.tagsJson})`,
    ),
  ],
);

export const collectionTracks = sqliteTable(
  "collection_tracks",
  {
    id: text("id").primaryKey(),
    collectionRevisionId: text("collection_revision_id")
      .notNull()
      .references(() => collectionRevisions.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    trackRevisionId: text("track_revision_id").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("collection_tracks_position_unique").on(
      table.collectionRevisionId,
      table.position,
    ),
    uniqueIndex("collection_tracks_track_unique").on(
      table.collectionRevisionId,
      table.trackId,
    ),
    uniqueIndex("collection_tracks_revision_unique").on(
      table.collectionRevisionId,
      table.trackRevisionId,
    ),
    foreignKey({
      columns: [table.trackId, table.trackRevisionId],
      foreignColumns: [trackRevisions.trackId, trackRevisions.id],
      name: "collection_tracks_track_revision_owner_fk",
    }).onDelete("restrict"),
    check("collection_tracks_position_positive", sql`${table.position} > 0`),
  ],
);

export const credits = sqliteTable(
  "credits",
  {
    id: text("id").primaryKey(),
    releaseRevisionId: text("release_revision_id").references(
      () => releaseRevisions.id,
      { onDelete: "cascade" },
    ),
    trackRevisionId: text("track_revision_id").references(
      () => trackRevisions.id,
      { onDelete: "cascade" },
    ),
    collectionRevisionId: text("collection_revision_id").references(
      () => collectionRevisions.id,
      { onDelete: "cascade" },
    ),
    name: text("name").notNull(),
    role: text("role").notNull(),
    details: text("details").notNull().default(""),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("credits_release_idx").on(table.releaseRevisionId, table.position),
    index("credits_track_idx").on(table.trackRevisionId, table.position),
    index("credits_collection_idx").on(
      table.collectionRevisionId,
      table.position,
    ),
    uniqueIndex("credits_release_position_unique")
      .on(table.releaseRevisionId, table.position)
      .where(sql`${table.releaseRevisionId} is not null`),
    uniqueIndex("credits_track_position_unique")
      .on(table.trackRevisionId, table.position)
      .where(sql`${table.trackRevisionId} is not null`),
    uniqueIndex("credits_collection_position_unique")
      .on(table.collectionRevisionId, table.position)
      .where(sql`${table.collectionRevisionId} is not null`),
    check("credits_position_positive", sql`${table.position} > 0`),
    check(
      "credits_one_subject",
      sql`((${table.releaseRevisionId} is not null) + (${table.trackRevisionId} is not null) + (${table.collectionRevisionId} is not null)) = 1`,
    ),
  ],
);

export const favorites = sqliteTable(
  "favorites",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type", {
      enum: ["track", "release", "collection"],
    }).notNull(),
    trackId: text("track_id").references(() => tracks.id, {
      onDelete: "restrict",
    }),
    releaseId: text("release_id").references(() => releases.id, {
      onDelete: "restrict",
    }),
    collectionId: text("collection_id").references(() => collections.id, {
      onDelete: "restrict",
    }),
    state: text("state", { enum: ["active", "removed"] })
      .notNull()
      .default("active"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("favorites_user_track_unique")
      .on(table.userId, table.trackId)
      .where(sql`${table.trackId} is not null`),
    uniqueIndex("favorites_user_release_unique")
      .on(table.userId, table.releaseId)
      .where(sql`${table.releaseId} is not null`),
    uniqueIndex("favorites_user_collection_unique")
      .on(table.userId, table.collectionId)
      .where(sql`${table.collectionId} is not null`),
    index("favorites_user_state_updated_idx").on(
      table.userId,
      table.state,
      table.updatedAt,
    ),
    check(
      "favorites_target_type_valid",
      sql`${table.targetType} in ('track', 'release', 'collection')`,
    ),
    check(
      "favorites_exact_target",
      sql`(
        (${table.targetType} = 'track' and ${table.trackId} is not null and ${table.releaseId} is null and ${table.collectionId} is null)
        or
        (${table.targetType} = 'release' and ${table.releaseId} is not null and ${table.trackId} is null and ${table.collectionId} is null)
        or
        (${table.targetType} = 'collection' and ${table.collectionId} is not null and ${table.trackId} is null and ${table.releaseId} is null)
      )`,
    ),
    check(
      "favorites_state_valid",
      sql`${table.state} in ('active', 'removed')`,
    ),
    check("favorites_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const playlists = sqliteTable(
  "playlists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("playlists_user_state_updated_idx").on(
      table.userId,
      table.state,
      table.updatedAt,
    ),
    check(
      "playlists_name_length_valid",
      sql`length(${table.name}) between 1 and 120`,
    ),
    check(
      "playlists_description_length_valid",
      sql`length(${table.description}) <= 1000`,
    ),
    check(
      "playlists_state_valid",
      sql`${table.state} in ('active', 'archived')`,
    ),
    check("playlists_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const playlistTracks = sqliteTable(
  "playlist_tracks",
  {
    id: text("id").primaryKey(),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("playlist_tracks_position_unique").on(
      table.playlistId,
      table.position,
    ),
    uniqueIndex("playlist_tracks_track_unique").on(
      table.playlistId,
      table.trackId,
    ),
    index("playlist_tracks_track_idx").on(table.trackId, table.playlistId),
    check("playlist_tracks_position_positive", sql`${table.position} > 0`),
  ],
);

export const listeningHistory = sqliteTable(
  "listening_history",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    trackRevisionId: text("track_revision_id").notNull(),
    positionMs: integer("position_ms").notNull().default(0),
    meaningfulListenCount: integer("meaningful_listen_count")
      .notNull()
      .default(0),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    firstListenedAt: text("first_listened_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastListenedAt: text("last_listened_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("listening_history_user_track_unique").on(
      table.userId,
      table.trackId,
    ),
    index("listening_history_user_recent_idx").on(
      table.userId,
      table.lastListenedAt,
    ),
    index("listening_history_track_recent_idx").on(
      table.trackId,
      table.lastListenedAt,
    ),
    foreignKey({
      columns: [table.trackId, table.trackRevisionId],
      foreignColumns: [trackRevisions.trackId, trackRevisions.id],
      name: "listening_history_track_revision_owner_fk",
    }).onDelete("restrict"),
    check(
      "listening_history_position_nonnegative",
      sql`${table.positionMs} >= 0`,
    ),
    check(
      "listening_history_meaningful_count_nonnegative",
      sql`${table.meaningfulListenCount} >= 0`,
    ),
    check("listening_history_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const accessPlans = sqliteTable(
  "access_plans",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("access_plans_slug_unique").on(table.slug),
    uniqueIndex("access_plans_identity_revision_unique").on(
      table.id,
      table.revision,
    ),
    index("access_plans_state_name_idx").on(table.state, table.name),
    check(
      "access_plans_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check("access_plans_slug_no_slash", sql`instr(${table.slug}, '/') = 0`),
    check(
      "access_plans_name_length_valid",
      sql`length(trim(${table.name})) between 1 and 120`,
    ),
    check(
      "access_plans_description_length_valid",
      sql`length(${table.description}) <= 2000`,
    ),
    check(
      "access_plans_state_valid",
      sql`${table.state} in ('active', 'archived')`,
    ),
    check("access_plans_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const accessPlanItems = sqliteTable(
  "access_plan_items",
  {
    id: text("id").primaryKey(),
    accessPlanId: text("access_plan_id")
      .notNull()
      .references(() => accessPlans.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    resourceType: text("resource_type", {
      enum: [
        "track",
        "release",
        "collection",
        "course",
        "lesson",
        "license-document",
      ],
    }).notNull(),
    resourceId: text("resource_id").notNull(),
    actionsJson: text("actions_json").notNull(),
    remainingUses: integer("remaining_uses"),
    downloadDisposition: text("download_disposition", {
      enum: ["inline", "attachment"],
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("access_plan_items_position_unique").on(
      table.accessPlanId,
      table.position,
    ),
    uniqueIndex("access_plan_items_resource_unique").on(
      table.accessPlanId,
      table.resourceType,
      table.resourceId,
    ),
    uniqueIndex("access_plan_items_identity_unique").on(
      table.id,
      table.accessPlanId,
      table.resourceType,
      table.resourceId,
    ),
    index("access_plan_items_resource_idx").on(
      table.resourceType,
      table.resourceId,
    ),
    check("access_plan_items_position_positive", sql`${table.position} > 0`),
    check(
      "access_plan_items_resource_type_valid",
      sql`${table.resourceType} in ('track', 'release', 'collection', 'course', 'lesson', 'license-document')`,
    ),
    check(
      "access_plan_items_actions_json_valid",
      sql`json_valid(${table.actionsJson}) and json_type(${table.actionsJson}) = 'array' and json_array_length(${table.actionsJson}) between 1 and 3`,
    ),
    check(
      "access_plan_items_remaining_uses_nonnegative",
      sql`${table.remainingUses} is null or ${table.remainingUses} >= 0`,
    ),
    check(
      "access_plan_items_download_disposition_valid",
      sql`${table.downloadDisposition} is null or ${table.downloadDisposition} in ('inline', 'attachment')`,
    ),
  ],
);

export const accessGrantTemplates = sqliteTable(
  "access_grant_templates",
  {
    id: text("id").primaryKey(),
    templateKey: text("template_key").notNull(),
    label: text("label").notNull(),
    accessPlanId: text("access_plan_id").notNull(),
    accessPlanRevision: integer("access_plan_revision").notNull(),
    defaultDurationDays: integer("default_duration_days"),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    revision: integer("revision").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("access_grant_templates_key_unique").on(table.templateKey),
    uniqueIndex("access_grant_templates_operation_key_unique").on(
      table.lastOperationKey,
    ),
    index("access_grant_templates_state_label_idx").on(
      table.state,
      table.label,
    ),
    foreignKey({
      columns: [table.accessPlanId, table.accessPlanRevision],
      foreignColumns: [accessPlans.id, accessPlans.revision],
      name: "access_grant_templates_plan_revision_fk",
    }).onDelete("restrict"),
    check(
      "access_grant_templates_key_valid",
      sql`length(${table.templateKey}) between 1 and 100 and ${table.templateKey} = lower(trim(${table.templateKey})) and ${table.templateKey} not glob '*[^a-z0-9-]*' and ${table.templateKey} not like '-%' and ${table.templateKey} not like '%-' and instr(${table.templateKey}, '--') = 0`,
    ),
    check(
      "access_grant_templates_label_valid",
      sql`length(trim(${table.label})) between 1 and 160`,
    ),
    check(
      "access_grant_templates_plan_revision_positive",
      sql`${table.accessPlanRevision} > 0`,
    ),
    check(
      "access_grant_templates_duration_valid",
      sql`${table.defaultDurationDays} is null or ${table.defaultDurationDays} between 1 and 36500`,
    ),
    check(
      "access_grant_templates_state_valid",
      sql`${table.state} in ('active', 'archived')`,
    ),
    check(
      "access_grant_templates_revision_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);

export const accessGrantSets = sqliteTable(
  "access_grant_sets",
  {
    id: text("id").primaryKey(),
    accessPlanId: text("access_plan_id")
      .notNull()
      .references(() => accessPlans.id, { onDelete: "restrict" }),
    accessPlanRevision: integer("access_plan_revision").notNull(),
    granteeUserId: text("grantee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: text("state", {
      enum: ["pending", "active", "revoked", "expired"],
    })
      .notNull()
      .default("pending"),
    startsAt: text("starts_at"),
    expiresAt: text("expires_at"),
    reason: text("reason").notNull().default(""),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activatedAt: text("activated_at"),
    revokedAt: text("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiredAt: text("expired_at"),
    expiredByUserId: text("expired_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("access_grant_sets_grantee_state_idx").on(
      table.granteeUserId,
      table.state,
      table.createdAt,
    ),
    index("access_grant_sets_plan_state_idx").on(
      table.accessPlanId,
      table.state,
    ),
    index("access_grant_sets_expiry_idx").on(table.state, table.expiresAt),
    uniqueIndex("access_grant_sets_identity_unique").on(
      table.id,
      table.accessPlanId,
      table.granteeUserId,
    ),
    check(
      "access_grant_sets_state_valid",
      sql`${table.state} in ('pending', 'active', 'revoked', 'expired')`,
    ),
    check(
      "access_grant_sets_window_valid",
      sql`${table.startsAt} is null or ${table.expiresAt} is null or ${table.startsAt} < ${table.expiresAt}`,
    ),
    check(
      "access_grant_sets_reason_length_valid",
      sql`length(${table.reason}) <= 1000`,
    ),
    check(
      "access_grant_sets_terminal_state_valid",
      sql`(${table.state} = 'pending' and ${table.activatedAt} is null and ${table.revokedAt} is null and ${table.expiredAt} is null) or (${table.state} = 'active' and ${table.activatedAt} is not null and ${table.revokedAt} is null and ${table.expiredAt} is null) or (${table.state} = 'revoked' and ${table.activatedAt} is not null and ${table.revokedAt} is not null and ${table.expiredAt} is null) or (${table.state} = 'expired' and ${table.activatedAt} is not null and ${table.expiredAt} is not null and ${table.revokedAt} is null)`,
    ),
    check(
      "access_grant_sets_plan_revision_positive",
      sql`${table.accessPlanRevision} > 0`,
    ),
    check("access_grant_sets_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const accessGrants = sqliteTable(
  "access_grants",
  {
    id: text("id").primaryKey(),
    granteeUserId: text("grantee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantSetId: text("grant_set_id"),
    accessPlanId: text("access_plan_id").references(() => accessPlans.id, {
      onDelete: "restrict",
    }),
    accessPlanItemId: text("access_plan_item_id"),
    resourceType: text("resource_type", {
      enum: [
        "track",
        "release",
        "collection",
        "course",
        "lesson",
        "license-document",
      ],
    }).notNull(),
    resourceId: text("resource_id").notNull(),
    actionsJson: text("actions_json").notNull().default("[]"),
    state: text("state", { enum: ["active", "revoked", "expired"] })
      .notNull()
      .default("active"),
    startsAt: text("starts_at"),
    expiresAt: text("expires_at"),
    remainingUses: integer("remaining_uses"),
    downloadDisposition: text("download_disposition", {
      enum: ["inline", "attachment"],
    }),
    reason: text("reason").notNull().default(""),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: text("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiredAt: text("expired_at"),
    expiredByUserId: text("expired_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("access_grants_grantee_state_resource_idx").on(
      table.granteeUserId,
      table.state,
      table.resourceType,
      table.resourceId,
    ),
    index("access_grants_expiry_idx").on(table.state, table.expiresAt),
    uniqueIndex("access_grants_set_item_unique")
      .on(table.grantSetId, table.accessPlanItemId)
      .where(sql`${table.grantSetId} is not null`),
    uniqueIndex("access_grants_identity_unique").on(
      table.id,
      table.granteeUserId,
      table.resourceType,
      table.resourceId,
    ),
    foreignKey({
      columns: [table.grantSetId, table.accessPlanId, table.granteeUserId],
      foreignColumns: [
        accessGrantSets.id,
        accessGrantSets.accessPlanId,
        accessGrantSets.granteeUserId,
      ],
      name: "access_grants_set_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.accessPlanItemId,
        table.accessPlanId,
        table.resourceType,
        table.resourceId,
      ],
      foreignColumns: [
        accessPlanItems.id,
        accessPlanItems.accessPlanId,
        accessPlanItems.resourceType,
        accessPlanItems.resourceId,
      ],
      name: "access_grants_plan_item_resource_fk",
    }).onDelete("restrict"),
    check(
      "access_grants_resource_type_valid",
      sql`${table.resourceType} in ('track', 'release', 'collection', 'course', 'lesson', 'license-document')`,
    ),
    check(
      "access_grants_actions_json_valid",
      sql`json_valid(${table.actionsJson}) and json_type(${table.actionsJson}) = 'array'`,
    ),
    check(
      "access_grants_state_valid",
      sql`${table.state} in ('active', 'revoked', 'expired')`,
    ),
    check(
      "access_grants_remaining_uses_nonnegative",
      sql`${table.remainingUses} is null or ${table.remainingUses} >= 0`,
    ),
    check(
      "access_grants_download_disposition_valid",
      sql`${table.downloadDisposition} is null or ${table.downloadDisposition} in ('inline', 'attachment')`,
    ),
    check(
      "access_grants_reason_length_valid",
      sql`length(${table.reason}) <= 1000`,
    ),
    check(
      "access_grants_plan_link_valid",
      sql`(${table.grantSetId} is null and ${table.accessPlanId} is null and ${table.accessPlanItemId} is null) or (${table.grantSetId} is not null and ${table.accessPlanId} is not null and ${table.accessPlanItemId} is not null)`,
    ),
    check(
      "access_grants_terminal_state_valid",
      sql`(${table.state} = 'active' and ${table.revokedAt} is null and ${table.expiredAt} is null) or (${table.state} = 'revoked' and ${table.revokedAt} is not null and ${table.expiredAt} is null) or (${table.state} = 'expired' and ${table.expiredAt} is not null and ${table.revokedAt} is null)`,
    ),
    check("access_grants_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const entitlements = sqliteTable(
  "entitlements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type", {
      enum: [
        "grant",
        "order",
        "membership",
        "subscription",
        "license",
        "credit",
      ],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    grantId: text("grant_id"),
    resourceType: text("resource_type", {
      enum: [
        "track",
        "release",
        "collection",
        "course",
        "lesson",
        "license-document",
      ],
    }).notNull(),
    resourceId: text("resource_id").notNull(),
    actionsJson: text("actions_json").notNull().default("[]"),
    state: text("state", {
      enum: ["active", "revoked", "expired", "exhausted"],
    })
      .notNull()
      .default("active"),
    startsAt: text("starts_at"),
    expiresAt: text("expires_at"),
    remainingUses: integer("remaining_uses"),
    downloadDisposition: text("download_disposition", {
      enum: ["inline", "attachment"],
    }),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] }),
    livemode: integer("livemode", { mode: "boolean" }),
    fulfillmentEventId: text("fulfillment_event_id"),
    creditReservationId: text("credit_reservation_id"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("entitlements_source_resource_unique").on(
      table.sourceType,
      table.sourceId,
      table.resourceType,
      table.resourceId,
    ),
    index("entitlements_user_state_resource_idx").on(
      table.userId,
      table.state,
      table.resourceType,
      table.resourceId,
    ),
    index("entitlements_expiry_idx").on(table.state, table.expiresAt),
    foreignKey({
      columns: [
        table.grantId,
        table.userId,
        table.resourceType,
        table.resourceId,
      ],
      foreignColumns: [
        accessGrants.id,
        accessGrants.granteeUserId,
        accessGrants.resourceType,
        accessGrants.resourceId,
      ],
      name: "entitlements_grant_subject_fk",
    }).onDelete("restrict"),
    check(
      "entitlements_source_type_valid",
      sql`${table.sourceType} in ('grant', 'order', 'membership', 'subscription', 'license', 'credit')`,
    ),
    check(
      "entitlements_grant_source_valid",
      sql`(
        (${table.sourceType} = 'grant' and ${table.grantId} is not null and ${table.sourceId} = ${table.grantId})
        or
        (${table.sourceType} <> 'grant' and ${table.grantId} is null)
      )`,
    ),
    check(
      "entitlements_resource_type_valid",
      sql`${table.resourceType} in ('track', 'release', 'collection', 'course', 'lesson', 'license-document')`,
    ),
    check(
      "entitlements_actions_json_valid",
      sql`json_valid(${table.actionsJson}) and json_type(${table.actionsJson}) = 'array'`,
    ),
    check(
      "entitlements_state_valid",
      sql`${table.state} in ('active', 'revoked', 'expired', 'exhausted')`,
    ),
    check(
      "entitlements_remaining_uses_nonnegative",
      sql`${table.remainingUses} is null or ${table.remainingUses} >= 0`,
    ),
    check(
      "entitlements_download_disposition_valid",
      sql`${table.downloadDisposition} is null or ${table.downloadDisposition} in ('inline', 'attachment')`,
    ),
    check(
      "entitlements_commerce_environment_valid",
      sql`(
        ${table.sourceType} = 'grant'
        and ${table.stripeEnvironment} is null
        and ${table.livemode} is null
        and ${table.fulfillmentEventId} is null
      ) or (
        ${table.sourceType} <> 'grant'
        and ${table.stripeEnvironment} = 'test'
        and ${table.livemode} = 0
        and ${table.fulfillmentEventId} is not null
      ) or (
        ${table.sourceType} not in ('grant', 'order')
        and ${table.stripeEnvironment} = 'test'
        and ${table.livemode} = 0
        and ${table.fulfillmentEventId} is null
        and ${table.lastOperationKey} is not null
      ) or (
        ${table.sourceType} <> 'grant'
        and ${table.stripeEnvironment} is null
        and ${table.livemode} is null
        and ${table.fulfillmentEventId} is null
        and ${table.lastOperationKey} is null
      )`,
    ),
    check(
      "entitlements_credit_reservation_valid",
      sql`${table.sourceType} = 'credit' or ${table.creditReservationId} is null`,
    ),
    check("entitlements_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const downloadEvents = sqliteTable(
  "download_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    resourceType: text("resource_type", {
      enum: ["track", "release", "collection"],
    }).notNull(),
    resourceId: text("resource_id").notNull(),
    mediaDerivativeId: text("media_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "set null" },
    ),
    entitlementId: text("entitlement_id").references(() => entitlements.id, {
      onDelete: "set null",
    }),
    accessSource: text("access_source", {
      enum: [
        "public",
        "account",
        "role",
        "ownership",
        "grant",
        "order",
        "membership",
        "subscription",
        "license",
        "credit",
      ],
    }).notNull(),
    entitlementSourceType: text("entitlement_source_type", {
      enum: [
        "grant",
        "order",
        "membership",
        "subscription",
        "license",
        "credit",
      ],
    }),
    entitlementSourceId: text("entitlement_source_id"),
    creditReservationId: text("credit_reservation_id"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] }),
    livemode: integer("livemode", { mode: "boolean" }),
    byteLength: integer("byte_length").notNull(),
    requestId: text("request_id").notNull(),
    deliveredAt: text("delivered_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("download_events_request_unique").on(table.requestId),
    index("download_events_user_delivered_idx").on(
      table.userId,
      table.deliveredAt,
    ),
    index("download_events_resource_delivered_idx").on(
      table.resourceType,
      table.resourceId,
      table.deliveredAt,
    ),
    check(
      "download_events_resource_type_valid",
      sql`${table.resourceType} in ('track', 'release', 'collection')`,
    ),
    check(
      "download_events_access_source_valid",
      sql`${table.accessSource} in ('public', 'account', 'role', 'ownership', 'grant', 'order', 'membership', 'subscription', 'license', 'credit')`,
    ),
    check(
      "download_events_entitlement_source_valid",
      sql`(
        ${table.entitlementId} is null
        and ${table.entitlementSourceType} is null
        and ${table.entitlementSourceId} is null
      ) or (
        ${table.entitlementId} is not null
        and (
          (${table.entitlementSourceType} is null and ${table.entitlementSourceId} is null)
          or
          (${table.entitlementSourceType} is not null and ${table.entitlementSourceId} is not null)
        )
      )`,
    ),
    check(
      "download_events_commerce_environment_valid",
      sql`(
        ${table.accessSource} in ('order', 'membership', 'subscription', 'license', 'credit')
        and ${table.stripeEnvironment} = 'test'
        and ${table.livemode} = 0
      ) or (
        ${table.accessSource} not in ('order', 'membership', 'subscription', 'license', 'credit')
        and ${table.stripeEnvironment} is null
        and ${table.livemode} is null
      )`,
    ),
    check(
      "download_events_credit_reservation_valid",
      sql`${table.accessSource} = 'credit' or ${table.creditReservationId} is null`,
    ),
    check(
      "download_events_anonymous_public_only",
      sql`${table.userId} is not null or ${table.accessSource} = 'public'`,
    ),
    check(
      "download_events_byte_length_nonnegative",
      sql`${table.byteLength} >= 0`,
    ),
  ],
);

export const membershipPlans = sqliteTable(
  "membership_plans",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    state: text("state", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    currentRevision: integer("current_revision").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("membership_plans_slug_unique").on(table.slug),
    uniqueIndex("membership_plans_identity_revision_unique").on(
      table.id,
      table.currentRevision,
    ),
    index("membership_plans_state_slug_idx").on(table.state, table.slug),
    check(
      "membership_plans_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check("membership_plans_slug_no_slash", sql`instr(${table.slug}, '/') = 0`),
    check(
      "membership_plans_state_valid",
      sql`${table.state} in ('draft', 'active', 'archived')`,
    ),
    check(
      "membership_plans_revision_positive",
      sql`${table.currentRevision} > 0`,
    ),
  ],
);

export const membershipPlanRevisions = sqliteTable(
  "membership_plan_revisions",
  {
    id: text("id").primaryKey(),
    membershipPlanId: text("membership_plan_id")
      .notNull()
      .references(() => membershipPlans.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    benefitsJson: text("benefits_json").notNull().default("[]"),
    accessPlanId: text("access_plan_id").references(() => accessPlans.id, {
      onDelete: "restrict",
    }),
    accessPlanRevision: integer("access_plan_revision"),
    downloadCredits: integer("download_credits").notNull().default(0),
    licenseCredits: integer("license_credits").notNull().default(0),
    durationDays: integer("duration_days"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("membership_plan_revisions_plan_revision_unique").on(
      table.membershipPlanId,
      table.revision,
    ),
    uniqueIndex("membership_plan_revisions_identity_unique").on(
      table.id,
      table.membershipPlanId,
      table.revision,
    ),
    index("membership_plan_revisions_access_plan_idx").on(table.accessPlanId),
    check(
      "membership_plan_revisions_name_length_valid",
      sql`length(trim(${table.name})) between 1 and 120`,
    ),
    check(
      "membership_plan_revisions_description_length_valid",
      sql`length(${table.description}) <= 4000`,
    ),
    check(
      "membership_plan_revisions_benefits_json_valid",
      sql`json_valid(${table.benefitsJson}) and json_type(${table.benefitsJson}) = 'array'`,
    ),
    check(
      "membership_plan_revisions_access_plan_valid",
      sql`(${table.accessPlanId} is null and ${table.accessPlanRevision} is null) or (${table.accessPlanId} is not null and ${table.accessPlanRevision} > 0)`,
    ),
    check(
      "membership_plan_revisions_credits_nonnegative",
      sql`${table.downloadCredits} >= 0 and ${table.licenseCredits} >= 0`,
    ),
    check(
      "membership_plan_revisions_duration_positive",
      sql`${table.durationDays} is null or ${table.durationDays} > 0`,
    ),
    check(
      "membership_plan_revisions_revision_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);

export const subscriptionPlans = sqliteTable(
  "subscription_plans",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    membershipPlanId: text("membership_plan_id")
      .notNull()
      .references(() => membershipPlans.id, { onDelete: "restrict" }),
    membershipPlanRevisionId: text("membership_plan_revision_id").notNull(),
    membershipPlanRevision: integer("membership_plan_revision").notNull(),
    billingInterval: text("billing_interval", { enum: ["month", "year"] })
      .notNull()
      .default("month"),
    intervalCount: integer("interval_count").notNull().default(1),
    state: text("state", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("subscription_plans_slug_unique").on(table.slug),
    uniqueIndex("subscription_plans_identity_revision_unique").on(
      table.id,
      table.revision,
    ),
    index("subscription_plans_state_slug_idx").on(table.state, table.slug),
    foreignKey({
      columns: [
        table.membershipPlanRevisionId,
        table.membershipPlanId,
        table.membershipPlanRevision,
      ],
      foreignColumns: [
        membershipPlanRevisions.id,
        membershipPlanRevisions.membershipPlanId,
        membershipPlanRevisions.revision,
      ],
      name: "subscription_plans_membership_revision_fk",
    }).onDelete("restrict"),
    check(
      "subscription_plans_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check(
      "subscription_plans_slug_no_slash",
      sql`instr(${table.slug}, '/') = 0`,
    ),
    check(
      "subscription_plans_name_length_valid",
      sql`length(trim(${table.name})) between 1 and 120`,
    ),
    check(
      "subscription_plans_description_length_valid",
      sql`length(${table.description}) <= 4000`,
    ),
    check(
      "subscription_plans_interval_valid",
      sql`${table.billingInterval} in ('month', 'year') and ${table.intervalCount} > 0`,
    ),
    check(
      "subscription_plans_state_valid",
      sql`${table.state} in ('draft', 'active', 'archived')`,
    ),
    check("subscription_plans_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const membershipCreditRules = sqliteTable(
  "membership_credit_rules",
  {
    id: text("id").primaryKey(),
    ruleKey: text("rule_key").notNull(),
    creditKind: text("credit_kind", {
      enum: ["download", "license"],
    }).notNull(),
    membershipPlanId: text("membership_plan_id"),
    membershipPlanRevisionId: text("membership_plan_revision_id"),
    membershipPlanRevision: integer("membership_plan_revision"),
    subscriptionPlanId: text("subscription_plan_id"),
    subscriptionPlanRevision: integer("subscription_plan_revision"),
    amount: integer("amount").notNull(),
    cadence: text("cadence", { enum: ["once", "month", "year"] }).notNull(),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    revision: integer("revision").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("membership_credit_rules_key_unique").on(table.ruleKey),
    uniqueIndex("membership_credit_rules_operation_key_unique").on(
      table.lastOperationKey,
    ),
    uniqueIndex("membership_credit_rules_membership_kind_unique")
      .on(table.membershipPlanRevisionId, table.creditKind)
      .where(sql`${table.membershipPlanRevisionId} is not null`),
    uniqueIndex("membership_credit_rules_subscription_kind_unique")
      .on(
        table.subscriptionPlanId,
        table.subscriptionPlanRevision,
        table.creditKind,
      )
      .where(sql`${table.subscriptionPlanId} is not null`),
    index("membership_credit_rules_state_kind_idx").on(
      table.state,
      table.creditKind,
      table.ruleKey,
    ),
    foreignKey({
      columns: [
        table.membershipPlanRevisionId,
        table.membershipPlanId,
        table.membershipPlanRevision,
      ],
      foreignColumns: [
        membershipPlanRevisions.id,
        membershipPlanRevisions.membershipPlanId,
        membershipPlanRevisions.revision,
      ],
      name: "membership_credit_rules_membership_revision_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.subscriptionPlanId, table.subscriptionPlanRevision],
      foreignColumns: [subscriptionPlans.id, subscriptionPlans.revision],
      name: "membership_credit_rules_subscription_revision_fk",
    }).onDelete("restrict"),
    check(
      "membership_credit_rules_key_valid",
      sql`length(${table.ruleKey}) between 1 and 100 and ${table.ruleKey} = lower(trim(${table.ruleKey})) and ${table.ruleKey} not glob '*[^a-z0-9-]*' and ${table.ruleKey} not like '-%' and ${table.ruleKey} not like '%-' and instr(${table.ruleKey}, '--') = 0`,
    ),
    check(
      "membership_credit_rules_subject_valid",
      sql`(
        ${table.membershipPlanId} is not null
        and ${table.membershipPlanRevisionId} is not null
        and ${table.membershipPlanRevision} > 0
        and ${table.subscriptionPlanId} is null
        and ${table.subscriptionPlanRevision} is null
        and ${table.cadence} = 'once'
      ) or (
        ${table.membershipPlanId} is null
        and ${table.membershipPlanRevisionId} is null
        and ${table.membershipPlanRevision} is null
        and ${table.subscriptionPlanId} is not null
        and ${table.subscriptionPlanRevision} > 0
        and ${table.cadence} in ('month', 'year')
      )`,
    ),
    check(
      "membership_credit_rules_kind_valid",
      sql`${table.creditKind} in ('download', 'license')`,
    ),
    check("membership_credit_rules_amount_positive", sql`${table.amount} > 0`),
    check(
      "membership_credit_rules_state_valid",
      sql`${table.state} in ('active', 'archived')`,
    ),
    check(
      "membership_credit_rules_revision_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);

export const commerceProducts = sqliteTable(
  "commerce_products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    productType: text("product_type", {
      enum: [
        "track",
        "release",
        "collection",
        "membership",
        "subscription",
        "license",
        "download-credits",
        "license-credits",
      ],
    }).notNull(),
    resourceType: text("resource_type", {
      enum: ["track", "release", "collection"],
    }),
    resourceId: text("resource_id"),
    accessPlanId: text("access_plan_id").references(() => accessPlans.id, {
      onDelete: "restrict",
    }),
    accessPlanRevision: integer("access_plan_revision"),
    membershipPlanId: text("membership_plan_id").references(
      () => membershipPlans.id,
      { onDelete: "restrict" },
    ),
    membershipPlanRevisionId: text("membership_plan_revision_id"),
    membershipPlanRevision: integer("membership_plan_revision"),
    subscriptionPlanId: text("subscription_plan_id").references(
      () => subscriptionPlans.id,
      { onDelete: "restrict" },
    ),
    creditKind: text("credit_kind", { enum: ["download", "license"] }),
    creditQuantity: integer("credit_quantity"),
    state: text("state", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("commerce_products_slug_unique").on(table.slug),
    uniqueIndex("commerce_products_identity_revision_unique").on(
      table.id,
      table.revision,
    ),
    index("commerce_products_state_type_idx").on(
      table.state,
      table.productType,
    ),
    index("commerce_products_resource_idx").on(
      table.resourceType,
      table.resourceId,
    ),
    foreignKey({
      columns: [
        table.membershipPlanRevisionId,
        table.membershipPlanId,
        table.membershipPlanRevision,
      ],
      foreignColumns: [
        membershipPlanRevisions.id,
        membershipPlanRevisions.membershipPlanId,
        membershipPlanRevisions.revision,
      ],
      name: "commerce_products_membership_revision_fk",
    }).onDelete("restrict"),
    check(
      "commerce_products_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check(
      "commerce_products_slug_no_slash",
      sql`instr(${table.slug}, '/') = 0`,
    ),
    check(
      "commerce_products_name_length_valid",
      sql`length(trim(${table.name})) between 1 and 160`,
    ),
    check(
      "commerce_products_description_length_valid",
      sql`length(${table.description}) <= 4000`,
    ),
    check(
      "commerce_products_type_valid",
      sql`${table.productType} in ('track', 'release', 'collection', 'membership', 'subscription', 'license', 'download-credits', 'license-credits')`,
    ),
    check(
      "commerce_products_subject_valid",
      sql`(
        ${table.productType} in ('track', 'release', 'collection')
        and ${table.resourceType} = ${table.productType}
        and ${table.resourceId} is not null
        and ${table.accessPlanId} is not null
        and ${table.accessPlanRevision} > 0
        and ${table.membershipPlanId} is null
        and ${table.membershipPlanRevisionId} is null
        and ${table.membershipPlanRevision} is null
        and ${table.subscriptionPlanId} is null
        and ${table.creditKind} is null
        and ${table.creditQuantity} is null
      ) or (
        ${table.productType} = 'membership'
        and ${table.resourceType} is null
        and ${table.resourceId} is null
        and ${table.accessPlanId} is null
        and ${table.accessPlanRevision} is null
        and ${table.membershipPlanId} is not null
        and ${table.membershipPlanRevisionId} is not null
        and ${table.membershipPlanRevision} > 0
        and ${table.subscriptionPlanId} is null
        and ${table.creditKind} is null
        and ${table.creditQuantity} is null
      ) or (
        ${table.productType} = 'subscription'
        and ${table.resourceType} is null
        and ${table.resourceId} is null
        and ${table.accessPlanId} is null
        and ${table.accessPlanRevision} is null
        and ${table.membershipPlanId} is null
        and ${table.membershipPlanRevisionId} is null
        and ${table.membershipPlanRevision} is null
        and ${table.subscriptionPlanId} is not null
        and ${table.creditKind} is null
        and ${table.creditQuantity} is null
      ) or (
        ${table.productType} = 'license'
        and ${table.resourceType} = 'track'
        and ${table.resourceId} is not null
        and ${table.accessPlanId} is null
        and ${table.accessPlanRevision} is null
        and ${table.membershipPlanId} is null
        and ${table.membershipPlanRevisionId} is null
        and ${table.membershipPlanRevision} is null
        and ${table.subscriptionPlanId} is null
        and ${table.creditKind} is null
        and ${table.creditQuantity} is null
      ) or (
        ${table.productType} in ('download-credits', 'license-credits')
        and ${table.resourceType} is null
        and ${table.resourceId} is null
        and ${table.accessPlanId} is null
        and ${table.accessPlanRevision} is null
        and ${table.membershipPlanId} is null
        and ${table.membershipPlanRevisionId} is null
        and ${table.membershipPlanRevision} is null
        and ${table.subscriptionPlanId} is null
        and ${table.creditKind} = case ${table.productType} when 'download-credits' then 'download' else 'license' end
        and ${table.creditQuantity} > 0
      )`,
    ),
    check(
      "commerce_products_state_valid",
      sql`${table.state} in ('draft', 'active', 'archived')`,
    ),
    check("commerce_products_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const commercePrices = sqliteTable(
  "commerce_prices",
  {
    id: text("id").primaryKey(),
    commerceProductId: text("commerce_product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    billingInterval: text("billing_interval", {
      enum: ["one_time", "month", "year"],
    })
      .notNull()
      .default("one_time"),
    intervalCount: integer("interval_count").notNull().default(1),
    stripePriceId: text("stripe_price_id").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("commerce_prices_product_terms_unique").on(
      table.commerceProductId,
      table.currency,
      table.billingInterval,
      table.intervalCount,
      table.revision,
    ),
    uniqueIndex("commerce_prices_identity_product_unique").on(
      table.id,
      table.commerceProductId,
    ),
    uniqueIndex("commerce_prices_stripe_price_unique").on(table.stripePriceId),
    index("commerce_prices_product_active_idx").on(
      table.commerceProductId,
      table.active,
    ),
    check("commerce_prices_amount_positive", sql`${table.amountMinor} > 0`),
    check(
      "commerce_prices_currency_normalized",
      sql`length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`,
    ),
    check(
      "commerce_prices_interval_valid",
      sql`${table.billingInterval} in ('one_time', 'month', 'year') and ${table.intervalCount} > 0`,
    ),
    check(
      "commerce_prices_stripe_price_valid",
      sql`${table.stripePriceId} like 'price_%' and length(${table.stripePriceId}) between 12 and 255`,
    ),
    check(
      "commerce_prices_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("commerce_prices_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const checkoutSessions = sqliteTable(
  "checkout_sessions",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    commerceProductId: text("commerce_product_id").notNull(),
    commercePriceId: text("commerce_price_id").notNull(),
    licenseRequestId: text("license_request_id"),
    mode: text("mode", { enum: ["payment", "subscription"] }).notNull(),
    status: text("status", {
      enum: ["creating", "open", "completed", "expired", "canceled", "failed"],
    })
      .notNull()
      .default("creating"),
    returnPath: text("return_path").notNull().default("/account/orders"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeCheckoutUrl: text("stripe_checkout_url"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    failureCategory: text("failure_category"),
    expiresAt: text("expires_at"),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("checkout_sessions_operation_unique").on(
      table.customerUserId,
      table.idempotencyKey,
    ),
    uniqueIndex("checkout_sessions_stripe_session_unique")
      .on(table.stripeCheckoutSessionId)
      .where(sql`${table.stripeCheckoutSessionId} is not null`),
    uniqueIndex("checkout_sessions_identity_subject_unique").on(
      table.id,
      table.customerUserId,
      table.commerceProductId,
      table.commercePriceId,
    ),
    index("checkout_sessions_customer_created_idx").on(
      table.customerUserId,
      table.createdAt,
    ),
    index("checkout_sessions_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
    foreignKey({
      columns: [table.commercePriceId, table.commerceProductId],
      foreignColumns: [commercePrices.id, commercePrices.commerceProductId],
      name: "checkout_sessions_price_product_fk",
    }).onDelete("restrict"),
    check(
      "checkout_sessions_mode_valid",
      sql`${table.mode} in ('payment', 'subscription')`,
    ),
    check(
      "checkout_sessions_status_valid",
      sql`${table.status} in ('creating', 'open', 'completed', 'expired', 'canceled', 'failed')`,
    ),
    check(
      "checkout_sessions_return_path_valid",
      sql`substr(${table.returnPath}, 1, 1) = '/' and substr(${table.returnPath}, 1, 2) <> '//' and instr(${table.returnPath}, char(92)) = 0`,
    ),
    check(
      "checkout_sessions_provider_fields_valid",
      sql`(
        ${table.status} = 'creating'
        and ${table.stripeCheckoutSessionId} is null
        and ${table.stripeCheckoutUrl} is null
      ) or (
        ${table.status} = 'failed'
        and (
          (${table.stripeCheckoutSessionId} is null and ${table.stripeCheckoutUrl} is null)
          or ${table.stripeCheckoutSessionId} like 'cs_test_%'
        )
      ) or (
        ${table.status} in ('open', 'completed', 'expired', 'canceled')
        and ${table.stripeCheckoutSessionId} like 'cs_test_%'
      )`,
    ),
    check(
      "checkout_sessions_url_valid",
      sql`${table.stripeCheckoutUrl} is null or ${table.stripeCheckoutUrl} like 'https://checkout.stripe.com/%'`,
    ),
    check(
      "checkout_sessions_amount_currency_valid",
      sql`${table.amountMinor} > 0 and length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`,
    ),
    check(
      "checkout_sessions_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check(
      "checkout_sessions_fingerprint_valid",
      sql`length(${table.requestFingerprint}) = 64 and ${table.requestFingerprint} = lower(${table.requestFingerprint})`,
    ),
    check(
      "checkout_sessions_failure_category_length_valid",
      sql`${table.failureCategory} is null or length(${table.failureCategory}) between 1 and 120`,
    ),
  ],
);

export const commerceEvents = sqliteTable(
  "commerce_events",
  {
    id: text("id").primaryKey(),
    stripeEventId: text("stripe_event_id").notNull(),
    eventType: text("event_type").notNull(),
    stripeObjectId: text("stripe_object_id").notNull(),
    checkoutSessionId: text("checkout_session_id").references(
      () => checkoutSessions.id,
      { onDelete: "restrict" },
    ),
    eventCreatedAt: text("event_created_at").notNull(),
    rawBodyDigest: text("raw_body_digest").notNull(),
    factsFingerprint: text("facts_fingerprint").notNull(),
    status: text("status", {
      enum: ["processing", "completed", "ignored", "failed"],
    })
      .notNull()
      .default("processing"),
    failureCategory: text("failure_category"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    receivedAt: createdAt(),
    processedAt: text("processed_at"),
  },
  (table) => [
    uniqueIndex("commerce_events_stripe_event_unique").on(table.stripeEventId),
    uniqueIndex("commerce_events_identity_fingerprint_unique").on(
      table.id,
      table.factsFingerprint,
    ),
    index("commerce_events_status_received_idx").on(
      table.status,
      table.receivedAt,
    ),
    index("commerce_events_object_idx").on(
      table.eventType,
      table.stripeObjectId,
    ),
    check(
      "commerce_events_stripe_id_valid",
      sql`${table.stripeEventId} like 'evt_%'`,
    ),
    check(
      "commerce_events_type_length_valid",
      sql`length(${table.eventType}) between 3 and 160`,
    ),
    check(
      "commerce_events_object_length_valid",
      sql`length(${table.stripeObjectId}) between 3 and 255`,
    ),
    check(
      "commerce_events_digests_valid",
      sql`length(${table.rawBodyDigest}) = 64 and ${table.rawBodyDigest} = lower(${table.rawBodyDigest}) and length(${table.factsFingerprint}) = 64 and ${table.factsFingerprint} = lower(${table.factsFingerprint})`,
    ),
    check(
      "commerce_events_status_valid",
      sql`${table.status} in ('processing', 'completed', 'ignored', 'failed')`,
    ),
    check(
      "commerce_events_failure_valid",
      sql`(${table.status} = 'failed' and ${table.failureCategory} is not null) or (${table.status} <> 'failed' and ${table.failureCategory} is null)`,
    ),
    check(
      "commerce_events_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    checkoutSessionId: text("checkout_session_id").references(
      () => checkoutSessions.id,
      { onDelete: "restrict" },
    ),
    commerceEventId: text("commerce_event_id")
      .notNull()
      .references(() => commerceEvents.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["pending", "fulfilled", "failed", "canceled", "reversed"],
    })
      .notNull()
      .default("pending"),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("orders_checkout_session_unique")
      .on(table.checkoutSessionId)
      .where(sql`${table.checkoutSessionId} is not null`),
    uniqueIndex("orders_commerce_event_unique").on(table.commerceEventId),
    uniqueIndex("orders_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    index("orders_customer_created_idx").on(
      table.customerUserId,
      table.createdAt,
    ),
    index("orders_status_updated_idx").on(table.status, table.updatedAt),
    index("orders_subscription_created_idx").on(
      table.stripeSubscriptionId,
      table.createdAt,
    ),
    check(
      "orders_status_valid",
      sql`${table.status} in ('pending', 'fulfilled', 'failed', 'canceled', 'reversed')`,
    ),
    check(
      "orders_amount_currency_valid",
      sql`${table.totalMinor} > 0 and length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`,
    ),
    check(
      "orders_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check(
      "orders_source_link_valid",
      sql`${table.checkoutSessionId} is not null or (${table.stripeSubscriptionId} is not null and ${table.stripeSubscriptionId} like 'sub_%')`,
    ),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    commerceProductId: text("commerce_product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "restrict" }),
    commerceProductRevision: integer("commerce_product_revision").notNull(),
    commercePriceId: text("commerce_price_id")
      .notNull()
      .references(() => commercePrices.id, { onDelete: "restrict" }),
    productType: text("product_type").notNull(),
    productName: text("product_name").notNull(),
    fulfillmentSnapshotJson: text("fulfillment_snapshot_json")
      .notNull()
      .default("{}"),
    quantity: integer("quantity").notNull().default(1),
    unitAmountMinor: integer("unit_amount_minor").notNull(),
    currency: text("currency").notNull(),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("order_items_order_position_unique").on(table.orderId),
    index("order_items_product_idx").on(
      table.commerceProductId,
      table.createdAt,
    ),
    check(
      "order_items_product_type_valid",
      sql`${table.productType} in ('track', 'release', 'collection', 'membership', 'subscription', 'license', 'download-credits', 'license-credits')`,
    ),
    check(
      "order_items_snapshot_json_valid",
      sql`json_valid(${table.fulfillmentSnapshotJson}) and json_type(${table.fulfillmentSnapshotJson}) = 'object'`,
    ),
    check(
      "order_items_amount_valid",
      sql`${table.quantity} = 1 and ${table.unitAmountMinor} > 0 and length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`,
    ),
    check(
      "order_items_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
  ],
);

export const fulfillmentEvents = sqliteTable(
  "fulfillment_events",
  {
    id: text("id").primaryKey(),
    commerceEventId: text("commerce_event_id")
      .notNull()
      .references(() => commerceEvents.id, { onDelete: "restrict" }),
    checkoutSessionId: text("checkout_session_id").references(
      () => checkoutSessions.id,
      { onDelete: "restrict" },
    ),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    commerceProductId: text("commerce_product_id").references(
      () => commerceProducts.id,
      { onDelete: "restrict" },
    ),
    kind: text("kind", {
      enum: [
        "one_time",
        "initial_subscription",
        "renewal",
        "subscription_state",
      ],
    }).notNull(),
    providerObjectId: text("provider_object_id").notNull(),
    factsFingerprint: text("facts_fingerprint").notNull(),
    status: text("status", {
      enum: ["processing", "fulfilled", "ignored", "failed"],
    })
      .notNull()
      .default("processing"),
    resultJson: text("result_json").notNull().default("{}"),
    failureCategory: text("failure_category"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("fulfillment_events_commerce_event_unique").on(
      table.commerceEventId,
    ),
    uniqueIndex("fulfillment_events_provider_object_unique")
      .on(table.kind, table.providerObjectId)
      .where(sql`${table.kind} <> 'subscription_state'`),
    uniqueIndex("fulfillment_events_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    index("fulfillment_events_customer_created_idx").on(
      table.customerUserId,
      table.createdAt,
    ),
    index("fulfillment_events_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "fulfillment_events_kind_valid",
      sql`${table.kind} in ('one_time', 'initial_subscription', 'renewal', 'subscription_state')`,
    ),
    check(
      "fulfillment_events_fingerprint_valid",
      sql`length(${table.factsFingerprint}) = 64 and ${table.factsFingerprint} = lower(${table.factsFingerprint})`,
    ),
    check(
      "fulfillment_events_status_valid",
      sql`${table.status} in ('processing', 'fulfilled', 'ignored', 'failed')`,
    ),
    check(
      "fulfillment_events_result_json_valid",
      sql`json_valid(${table.resultJson}) and json_type(${table.resultJson}) = 'object'`,
    ),
    check(
      "fulfillment_events_failure_valid",
      sql`(${table.status} = 'failed' and ${table.failureCategory} is not null) or (${table.status} <> 'failed' and ${table.failureCategory} is null)`,
    ),
    check(
      "fulfillment_events_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
  ],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    membershipPlanId: text("membership_plan_id")
      .notNull()
      .references(() => membershipPlans.id, { onDelete: "restrict" }),
    membershipPlanRevisionId: text("membership_plan_revision_id").notNull(),
    membershipPlanRevision: integer("membership_plan_revision").notNull(),
    source: text("source", { enum: ["owner", "stripe_test"] }).notNull(),
    sourceOrderId: text("source_order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    sourceFulfillmentEventId: text("source_fulfillment_event_id").references(
      () => fulfillmentEvents.id,
      { onDelete: "restrict" },
    ),
    state: text("state", {
      enum: [
        "pending",
        "active",
        "paused",
        "cancellation_scheduled",
        "canceled",
        "expired",
      ],
    })
      .notNull()
      .default("pending"),
    startsAt: text("starts_at").notNull(),
    currentPeriodStart: text("current_period_start").notNull(),
    currentPeriodEnd: text("current_period_end").notNull(),
    cancelAt: text("cancel_at"),
    canceledAt: text("canceled_at"),
    expiredAt: text("expired_at"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("memberships_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    uniqueIndex("memberships_fulfillment_unique")
      .on(table.sourceFulfillmentEventId)
      .where(sql`${table.sourceFulfillmentEventId} is not null`),
    uniqueIndex("memberships_active_customer_plan_unique")
      .on(table.customerUserId, table.membershipPlanId)
      .where(
        sql`${table.state} in ('pending', 'active', 'paused', 'cancellation_scheduled')`,
      ),
    index("memberships_customer_state_idx").on(
      table.customerUserId,
      table.state,
      table.currentPeriodEnd,
    ),
    index("memberships_plan_state_idx").on(table.membershipPlanId, table.state),
    foreignKey({
      columns: [
        table.membershipPlanRevisionId,
        table.membershipPlanId,
        table.membershipPlanRevision,
      ],
      foreignColumns: [
        membershipPlanRevisions.id,
        membershipPlanRevisions.membershipPlanId,
        membershipPlanRevisions.revision,
      ],
      name: "memberships_plan_revision_fk",
    }).onDelete("restrict"),
    check(
      "memberships_source_valid",
      sql`${table.source} in ('owner', 'stripe_test')`,
    ),
    check(
      "memberships_source_links_valid",
      sql`(${table.source} = 'owner' and ${table.sourceOrderId} is null and ${table.sourceFulfillmentEventId} is null) or (${table.source} = 'stripe_test' and ${table.sourceOrderId} is not null and ${table.sourceFulfillmentEventId} is not null)`,
    ),
    check(
      "memberships_state_valid",
      sql`${table.state} in ('pending', 'active', 'paused', 'cancellation_scheduled', 'canceled', 'expired')`,
    ),
    check(
      "memberships_period_valid",
      sql`${table.currentPeriodStart} < ${table.currentPeriodEnd} and ${table.startsAt} <= ${table.currentPeriodStart}`,
    ),
    check(
      "memberships_terminal_state_valid",
      sql`(
        ${table.state} in ('pending', 'active', 'paused')
        and ${table.cancelAt} is null
        and ${table.canceledAt} is null
        and ${table.expiredAt} is null
      ) or (
        ${table.state} = 'cancellation_scheduled'
        and ${table.cancelAt} is not null
        and ${table.canceledAt} is null
        and ${table.expiredAt} is null
      ) or (
        ${table.state} = 'canceled'
        and ${table.canceledAt} is not null
        and ${table.expiredAt} is null
      ) or (
        ${table.state} = 'expired'
        and ${table.expiredAt} is not null
        and ${table.canceledAt} is null
      )`,
    ),
    check(
      "memberships_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("memberships_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id").notNull(),
    membershipId: text("membership_id").notNull(),
    subscriptionPlanId: text("subscription_plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    commerceProductId: text("commerce_product_id").references(
      () => commerceProducts.id,
      { onDelete: "restrict" },
    ),
    commercePriceId: text("commerce_price_id").references(
      () => commercePrices.id,
      { onDelete: "restrict" },
    ),
    source: text("source", { enum: ["owner", "stripe_test"] }).notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCustomerId: text("stripe_customer_id"),
    state: text("state", {
      enum: [
        "pending",
        "active",
        "paused",
        "cancellation_scheduled",
        "canceled",
        "expired",
      ],
    })
      .notNull()
      .default("pending"),
    currentPeriodStart: text("current_period_start").notNull(),
    currentPeriodEnd: text("current_period_end").notNull(),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
      .notNull()
      .default(false),
    cancelAt: text("cancel_at"),
    canceledAt: text("canceled_at"),
    expiredAt: text("expired_at"),
    lastProviderEventCreatedAt: text("last_provider_event_created_at"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("subscriptions_membership_unique").on(table.membershipId),
    uniqueIndex("subscriptions_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    uniqueIndex("subscriptions_stripe_subscription_unique")
      .on(table.stripeSubscriptionId)
      .where(sql`${table.stripeSubscriptionId} is not null`),
    index("subscriptions_customer_state_idx").on(
      table.customerUserId,
      table.state,
      table.currentPeriodEnd,
    ),
    index("subscriptions_plan_state_idx").on(
      table.subscriptionPlanId,
      table.state,
    ),
    foreignKey({
      columns: [table.membershipId, table.customerUserId],
      foreignColumns: [memberships.id, memberships.customerUserId],
      name: "subscriptions_membership_customer_fk",
    }).onDelete("restrict"),
    check(
      "subscriptions_source_valid",
      sql`${table.source} in ('owner', 'stripe_test')`,
    ),
    check(
      "subscriptions_source_fields_valid",
      sql`(${table.source} = 'owner' and ${table.stripeSubscriptionId} is null and ${table.stripeCustomerId} is null and ${table.commerceProductId} is null and ${table.commercePriceId} is null) or (${table.source} = 'stripe_test' and ${table.stripeSubscriptionId} like 'sub_%' and ${table.commerceProductId} is not null and ${table.commercePriceId} is not null)`,
    ),
    check(
      "subscriptions_state_valid",
      sql`${table.state} in ('pending', 'active', 'paused', 'cancellation_scheduled', 'canceled', 'expired')`,
    ),
    check(
      "subscriptions_period_valid",
      sql`${table.currentPeriodStart} < ${table.currentPeriodEnd}`,
    ),
    check(
      "subscriptions_cancellation_valid",
      sql`(
        ${table.state} in ('pending', 'active', 'paused')
        and ${table.cancelAtPeriodEnd} = 0
        and ${table.cancelAt} is null
        and ${table.canceledAt} is null
        and ${table.expiredAt} is null
      ) or (
        ${table.state} = 'cancellation_scheduled'
        and ${table.cancelAtPeriodEnd} = 1
        and ${table.cancelAt} is not null
        and ${table.canceledAt} is null
        and ${table.expiredAt} is null
      ) or (
        ${table.state} = 'canceled'
        and ${table.canceledAt} is not null
        and ${table.expiredAt} is null
      ) or (
        ${table.state} = 'expired'
        and ${table.expiredAt} is not null
        and ${table.canceledAt} is null
      )`,
    ),
    check(
      "subscriptions_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("subscriptions_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const subscriptionEvents = sqliteTable(
  "subscription_events",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull(),
    customerUserId: text("customer_user_id").notNull(),
    eventType: text("event_type", {
      enum: [
        "activated",
        "renewed",
        "paused",
        "resumed",
        "cancellation_scheduled",
        "cancellation_cleared",
        "canceled",
        "expired",
      ],
    }).notNull(),
    source: text("source", { enum: ["owner", "stripe_test"] }).notNull(),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    stripeEventId: text("stripe_event_id"),
    providerObjectId: text("provider_object_id"),
    fulfillmentEventId: text("fulfillment_event_id").references(
      () => fulfillmentEvents.id,
      { onDelete: "restrict" },
    ),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("subscription_events_operation_unique").on(
      table.subscriptionId,
      table.idempotencyKey,
    ),
    uniqueIndex("subscription_events_stripe_event_unique")
      .on(table.stripeEventId)
      .where(sql`${table.stripeEventId} is not null`),
    uniqueIndex("subscription_events_fulfillment_unique")
      .on(table.fulfillmentEventId)
      .where(sql`${table.fulfillmentEventId} is not null`),
    index("subscription_events_customer_created_idx").on(
      table.customerUserId,
      table.createdAt,
    ),
    index("subscription_events_subscription_created_idx").on(
      table.subscriptionId,
      table.createdAt,
    ),
    index("subscription_events_provider_object_idx").on(
      table.providerObjectId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.subscriptionId, table.customerUserId],
      foreignColumns: [subscriptions.id, subscriptions.customerUserId],
      name: "subscription_events_subscription_customer_fk",
    }).onDelete("restrict"),
    check(
      "subscription_events_type_valid",
      sql`${table.eventType} in ('activated', 'renewed', 'paused', 'resumed', 'cancellation_scheduled', 'cancellation_cleared', 'canceled', 'expired')`,
    ),
    check(
      "subscription_events_source_valid",
      sql`${table.source} in ('owner', 'stripe_test')`,
    ),
    check(
      "subscription_events_state_valid",
      sql`(${table.fromState} is null or ${table.fromState} in ('pending', 'active', 'paused', 'cancellation_scheduled', 'canceled', 'expired')) and ${table.toState} in ('pending', 'active', 'paused', 'cancellation_scheduled', 'canceled', 'expired')`,
    ),
    check(
      "subscription_events_period_valid",
      sql`${table.periodStart} < ${table.periodEnd}`,
    ),
    check(
      "subscription_events_provider_valid",
      sql`(${table.source} = 'owner' and ${table.stripeEventId} is null and ${table.providerObjectId} is null and ${table.fulfillmentEventId} is null) or (${table.source} = 'stripe_test' and ${table.stripeEventId} like 'evt_%' and ${table.providerObjectId} is not null and ${table.fulfillmentEventId} is not null)`,
    ),
    check(
      "subscription_events_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
  ],
);

export const creditAccounts = sqliteTable(
  "credit_accounts",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    creditKind: text("credit_kind", {
      enum: ["download", "license"],
    }).notNull(),
    availableBalance: integer("available_balance").notNull().default(0),
    reservedBalance: integer("reserved_balance").notNull().default(0),
    consumedBalance: integer("consumed_balance").notNull().default(0),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("credit_accounts_customer_kind_unique").on(
      table.customerUserId,
      table.creditKind,
    ),
    uniqueIndex("credit_accounts_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    index("credit_accounts_customer_idx").on(table.customerUserId),
    check(
      "credit_accounts_kind_valid",
      sql`${table.creditKind} in ('download', 'license')`,
    ),
    check(
      "credit_accounts_balances_nonnegative",
      sql`${table.availableBalance} >= 0 and ${table.reservedBalance} >= 0 and ${table.consumedBalance} >= 0`,
    ),
    check(
      "credit_accounts_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("credit_accounts_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const creditGrantLots = sqliteTable(
  "credit_grant_lots",
  {
    id: text("id").primaryKey(),
    creditAccountId: text("credit_account_id").notNull(),
    customerUserId: text("customer_user_id").notNull(),
    creditKind: text("credit_kind", {
      enum: ["download", "license"],
    }).notNull(),
    originType: text("origin_type", {
      enum: ["owner", "membership", "subscription", "order", "reversal"],
    }).notNull(),
    originId: text("origin_id").notNull(),
    quantityGranted: integer("quantity_granted").notNull(),
    quantityAvailable: integer("quantity_available").notNull(),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    quantityConsumed: integer("quantity_consumed").notNull().default(0),
    quantityExpired: integer("quantity_expired").notNull().default(0),
    quantityReversed: integer("quantity_reversed").notNull().default(0),
    state: text("state", {
      enum: ["active", "exhausted", "expired", "reversed"],
    })
      .notNull()
      .default("active"),
    expiresAt: text("expires_at"),
    expiredAt: text("expired_at"),
    reversedAt: text("reversed_at"),
    fulfillmentEventId: text("fulfillment_event_id").references(
      () => fulfillmentEvents.id,
      { onDelete: "restrict" },
    ),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("credit_grant_lots_origin_unique").on(
      table.creditAccountId,
      table.originType,
      table.originId,
    ),
    uniqueIndex("credit_grant_lots_identity_account_unique").on(
      table.id,
      table.creditAccountId,
      table.customerUserId,
    ),
    uniqueIndex("credit_grant_lots_operation_unique").on(
      table.creditAccountId,
      table.lastOperationKey,
    ),
    index("credit_grant_lots_account_state_expiry_idx").on(
      table.creditAccountId,
      table.state,
      table.expiresAt,
    ),
    foreignKey({
      columns: [table.creditAccountId, table.customerUserId],
      foreignColumns: [creditAccounts.id, creditAccounts.customerUserId],
      name: "credit_grant_lots_account_customer_fk",
    }).onDelete("restrict"),
    check(
      "credit_grant_lots_kind_valid",
      sql`${table.creditKind} in ('download', 'license')`,
    ),
    check(
      "credit_grant_lots_origin_valid",
      sql`${table.originType} in ('owner', 'membership', 'subscription', 'order', 'reversal')`,
    ),
    check(
      "credit_grant_lots_quantities_valid",
      sql`${table.quantityGranted} > 0 and ${table.quantityAvailable} >= 0 and ${table.quantityReserved} >= 0 and ${table.quantityConsumed} >= 0 and ${table.quantityExpired} >= 0 and ${table.quantityReversed} >= 0 and ${table.quantityAvailable} + ${table.quantityReserved} + ${table.quantityConsumed} + ${table.quantityExpired} + ${table.quantityReversed} = ${table.quantityGranted}`,
    ),
    check(
      "credit_grant_lots_state_valid",
      sql`(
        ${table.state} = 'active'
        and ${table.quantityAvailable} + ${table.quantityReserved} > 0
        and ${table.quantityExpired} = 0
        and ${table.quantityReversed} = 0
        and ${table.expiredAt} is null
        and ${table.reversedAt} is null
      ) or (
        ${table.state} = 'exhausted'
        and ${table.quantityAvailable} = 0
        and ${table.quantityReserved} = 0
        and ${table.quantityExpired} = 0
        and ${table.quantityReversed} = 0
        and ${table.expiredAt} is null
        and ${table.reversedAt} is null
      ) or (
        ${table.state} = 'expired'
        and ${table.quantityAvailable} = 0
        and ${table.quantityReserved} = 0
        and ${table.quantityExpired} > 0
        and ${table.quantityReversed} = 0
        and ${table.expiredAt} is not null
        and ${table.reversedAt} is null
      ) or (
        ${table.state} = 'reversed'
        and ${table.quantityAvailable} = 0
        and ${table.quantityReserved} = 0
        and ${table.quantityReversed} > 0
        and ${table.reversedAt} is not null
      )`,
    ),
    check(
      "credit_grant_lots_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("credit_grant_lots_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const creditReservations = sqliteTable(
  "credit_reservations",
  {
    id: text("id").primaryKey(),
    creditAccountId: text("credit_account_id").notNull(),
    customerUserId: text("customer_user_id").notNull(),
    creditKind: text("credit_kind", {
      enum: ["download", "license"],
    }).notNull(),
    purposeType: text("purpose_type", {
      enum: ["download", "license_request"],
    }).notNull(),
    purposeId: text("purpose_id").notNull(),
    quantity: integer("quantity").notNull(),
    state: text("state", {
      enum: ["reserved", "consumed", "released", "expired", "reversed"],
    })
      .notNull()
      .default("reserved"),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    releasedAt: text("released_at"),
    expiredAt: text("expired_at"),
    reversedAt: text("reversed_at"),
    requestId: text("request_id").notNull(),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("credit_reservations_request_unique").on(table.requestId),
    uniqueIndex("credit_reservations_purpose_unique").on(
      table.creditAccountId,
      table.purposeType,
      table.purposeId,
    ),
    uniqueIndex("credit_reservations_identity_account_unique").on(
      table.id,
      table.creditAccountId,
      table.customerUserId,
    ),
    uniqueIndex("credit_reservations_operation_unique").on(
      table.creditAccountId,
      table.lastOperationKey,
    ),
    index("credit_reservations_account_state_expiry_idx").on(
      table.creditAccountId,
      table.state,
      table.expiresAt,
    ),
    foreignKey({
      columns: [table.creditAccountId, table.customerUserId],
      foreignColumns: [creditAccounts.id, creditAccounts.customerUserId],
      name: "credit_reservations_account_customer_fk",
    }).onDelete("restrict"),
    check(
      "credit_reservations_kind_purpose_valid",
      sql`(${table.creditKind} = 'download' and ${table.purposeType} = 'download') or (${table.creditKind} = 'license' and ${table.purposeType} = 'license_request')`,
    ),
    check("credit_reservations_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "credit_reservations_state_valid",
      sql`${table.state} in ('reserved', 'consumed', 'released', 'expired', 'reversed')`,
    ),
    check(
      "credit_reservations_terminal_state_valid",
      sql`(
        ${table.state} = 'reserved'
        and ${table.consumedAt} is null
        and ${table.releasedAt} is null
        and ${table.expiredAt} is null
        and ${table.reversedAt} is null
      ) or (
        ${table.state} = 'consumed'
        and ${table.consumedAt} is not null
        and ${table.releasedAt} is null
        and ${table.expiredAt} is null
        and ${table.reversedAt} is null
      ) or (
        ${table.state} = 'released'
        and ${table.releasedAt} is not null
        and ${table.expiredAt} is null
        and ${table.reversedAt} is null
      ) or (
        ${table.state} = 'expired'
        and ${table.expiredAt} is not null
        and ${table.reversedAt} is null
      ) or (
        ${table.state} = 'reversed'
        and ${table.consumedAt} is not null
        and ${table.reversedAt} is not null
      )`,
    ),
    check(
      "credit_reservations_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("credit_reservations_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const creditReservationAllocations = sqliteTable(
  "credit_reservation_allocations",
  {
    id: text("id").primaryKey(),
    creditReservationId: text("credit_reservation_id")
      .notNull()
      .references(() => creditReservations.id, { onDelete: "restrict" }),
    creditGrantLotId: text("credit_grant_lot_id")
      .notNull()
      .references(() => creditGrantLots.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("credit_reservation_allocations_pair_unique").on(
      table.creditReservationId,
      table.creditGrantLotId,
    ),
    uniqueIndex("credit_reservation_allocations_position_unique").on(
      table.creditReservationId,
      table.position,
    ),
    index("credit_reservation_allocations_lot_idx").on(table.creditGrantLotId),
    check(
      "credit_reservation_allocations_positive",
      sql`${table.position} > 0 and ${table.quantity} > 0`,
    ),
  ],
);

export const creditLedgerEntries = sqliteTable(
  "credit_ledger_entries",
  {
    id: text("id").primaryKey(),
    creditAccountId: text("credit_account_id").notNull(),
    customerUserId: text("customer_user_id").notNull(),
    creditKind: text("credit_kind", {
      enum: ["download", "license"],
    }).notNull(),
    creditGrantLotId: text("credit_grant_lot_id").references(
      () => creditGrantLots.id,
      { onDelete: "restrict" },
    ),
    creditReservationId: text("credit_reservation_id").references(
      () => creditReservations.id,
      { onDelete: "restrict" },
    ),
    entryType: text("entry_type", {
      enum: [
        "grant",
        "reservation",
        "consumption",
        "release",
        "reversal",
        "expiration",
      ],
    }).notNull(),
    availableDelta: integer("available_delta").notNull(),
    reservedDelta: integer("reserved_delta").notNull(),
    consumedDelta: integer("consumed_delta").notNull(),
    availableAfter: integer("available_after").notNull(),
    reservedAfter: integer("reserved_after").notNull(),
    consumedAfter: integer("consumed_after").notNull(),
    originType: text("origin_type", {
      enum: [
        "owner",
        "membership",
        "subscription",
        "order",
        "download",
        "license",
        "expiration",
        "reversal",
      ],
    }).notNull(),
    originId: text("origin_id").notNull(),
    fulfillmentEventId: text("fulfillment_event_id").references(
      () => fulfillmentEvents.id,
      { onDelete: "restrict" },
    ),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("credit_ledger_entries_operation_unique").on(
      table.creditAccountId,
      table.idempotencyKey,
    ),
    uniqueIndex("credit_ledger_entries_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    index("credit_ledger_entries_account_created_idx").on(
      table.creditAccountId,
      table.createdAt,
    ),
    index("credit_ledger_entries_customer_created_idx").on(
      table.customerUserId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.creditAccountId, table.customerUserId],
      foreignColumns: [creditAccounts.id, creditAccounts.customerUserId],
      name: "credit_ledger_entries_account_customer_fk",
    }).onDelete("restrict"),
    check(
      "credit_ledger_entries_kind_valid",
      sql`${table.creditKind} in ('download', 'license')`,
    ),
    check(
      "credit_ledger_entries_type_valid",
      sql`${table.entryType} in ('grant', 'reservation', 'consumption', 'release', 'reversal', 'expiration')`,
    ),
    check(
      "credit_ledger_entries_delta_valid",
      sql`(
        ${table.entryType} = 'grant'
        and ${table.availableDelta} > 0
        and ${table.reservedDelta} = 0
        and ${table.consumedDelta} = 0
      ) or (
        ${table.entryType} = 'reservation'
        and ${table.availableDelta} < 0
        and ${table.reservedDelta} = -${table.availableDelta}
        and ${table.consumedDelta} = 0
      ) or (
        ${table.entryType} = 'consumption'
        and ${table.availableDelta} = 0
        and ${table.reservedDelta} < 0
        and ${table.consumedDelta} = -${table.reservedDelta}
      ) or (
        ${table.entryType} = 'release'
        and ${table.availableDelta} > 0
        and ${table.reservedDelta} = -${table.availableDelta}
        and ${table.consumedDelta} = 0
      ) or (
        ${table.entryType} = 'reversal'
        and ${table.availableDelta} > 0
        and ${table.reservedDelta} = 0
        and ${table.consumedDelta} = -${table.availableDelta}
      ) or (
        ${table.entryType} = 'expiration'
        and ${table.availableDelta} < 0
        and ${table.reservedDelta} = 0
        and ${table.consumedDelta} = 0
      )`,
    ),
    check(
      "credit_ledger_entries_balances_nonnegative",
      sql`${table.availableAfter} >= 0 and ${table.reservedAfter} >= 0 and ${table.consumedAfter} >= 0`,
    ),
    check(
      "credit_ledger_entries_origin_valid",
      sql`${table.originType} in ('owner', 'membership', 'subscription', 'order', 'download', 'license', 'expiration', 'reversal')`,
    ),
    check(
      "credit_ledger_entries_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
  ],
);

export const licenseTerms = sqliteTable(
  "license_terms",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    state: text("state", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    currentVersion: integer("current_version").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("license_terms_slug_unique").on(table.slug),
    uniqueIndex("license_terms_identity_version_unique").on(
      table.id,
      table.currentVersion,
    ),
    index("license_terms_state_slug_idx").on(table.state, table.slug),
    check(
      "license_terms_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug}))`,
    ),
    check("license_terms_slug_no_slash", sql`instr(${table.slug}, '/') = 0`),
    check(
      "license_terms_state_valid",
      sql`${table.state} in ('draft', 'active', 'archived')`,
    ),
    check("license_terms_version_positive", sql`${table.currentVersion} > 0`),
  ],
);

export const licenseTermsVersions = sqliteTable(
  "license_terms_versions",
  {
    id: text("id").primaryKey(),
    licenseTermsId: text("license_terms_id")
      .notNull()
      .references(() => licenseTerms.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    introduction: text("introduction").notNull().default(""),
    generalTerms: text("general_terms").notNull(),
    disclaimer: text("disclaimer").notNull().default(""),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("license_terms_versions_terms_version_unique").on(
      table.licenseTermsId,
      table.version,
    ),
    uniqueIndex("license_terms_versions_identity_unique").on(
      table.id,
      table.licenseTermsId,
      table.version,
    ),
    check(
      "license_terms_versions_name_length_valid",
      sql`length(trim(${table.name})) between 1 and 120`,
    ),
    check(
      "license_terms_versions_title_length_valid",
      sql`length(trim(${table.title})) between 1 and 240`,
    ),
    check(
      "license_terms_versions_content_length_valid",
      sql`length(${table.introduction}) <= 12000 and length(${table.generalTerms}) between 1 and 100000 and length(${table.disclaimer}) <= 12000`,
    ),
    check("license_terms_versions_version_positive", sql`${table.version} > 0`),
  ],
);

export const licenseOptions = sqliteTable(
  "license_options",
  {
    id: text("id").primaryKey(),
    licenseTermsId: text("license_terms_id").notNull(),
    licenseTermsVersionId: text("license_terms_version_id").notNull(),
    licenseTermsVersion: integer("license_terms_version").notNull(),
    optionKey: text("option_key").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    usageCategory: text("usage_category").notNull(),
    allowedMediaJson: text("allowed_media_json").notNull().default("[]"),
    audienceLabel: text("audience_label"),
    maxAudience: integer("max_audience"),
    distributionLabel: text("distribution_label"),
    maxCopies: integer("max_copies"),
    termMonths: integer("term_months"),
    territory: text("territory").notNull().default("Worldwide"),
    attributionRequired: integer("attribution_required", { mode: "boolean" })
      .notNull()
      .default(true),
    attributionText: text("attribution_text"),
    exclusive: integer("exclusive", { mode: "boolean" })
      .notNull()
      .default(false),
    requiresApproval: integer("requires_approval", { mode: "boolean" })
      .notNull()
      .default(false),
    licenseCreditCost: integer("license_credit_cost").notNull().default(1),
    includesTrackDownload: integer("includes_track_download", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("license_options_version_key_unique").on(
      table.licenseTermsVersionId,
      table.optionKey,
    ),
    uniqueIndex("license_options_version_position_unique").on(
      table.licenseTermsVersionId,
      table.position,
    ),
    uniqueIndex("license_options_identity_version_unique").on(
      table.id,
      table.licenseTermsVersionId,
    ),
    foreignKey({
      columns: [
        table.licenseTermsVersionId,
        table.licenseTermsId,
        table.licenseTermsVersion,
      ],
      foreignColumns: [
        licenseTermsVersions.id,
        licenseTermsVersions.licenseTermsId,
        licenseTermsVersions.version,
      ],
      name: "license_options_terms_version_fk",
    }).onDelete("restrict"),
    check(
      "license_options_key_normalized",
      sql`${table.optionKey} = lower(trim(${table.optionKey})) and instr(${table.optionKey}, '/') = 0`,
    ),
    check(
      "license_options_label_length_valid",
      sql`length(trim(${table.label})) between 1 and 160`,
    ),
    check(
      "license_options_description_length_valid",
      sql`length(${table.description}) <= 4000`,
    ),
    check(
      "license_options_usage_length_valid",
      sql`length(trim(${table.usageCategory})) between 1 and 120`,
    ),
    check(
      "license_options_media_json_valid",
      sql`json_valid(${table.allowedMediaJson}) and json_type(${table.allowedMediaJson}) = 'array'`,
    ),
    check(
      "license_options_limits_positive",
      sql`(${table.maxAudience} is null or ${table.maxAudience} > 0) and (${table.maxCopies} is null or ${table.maxCopies} > 0) and (${table.termMonths} is null or ${table.termMonths} > 0)`,
    ),
    check(
      "license_options_attribution_valid",
      sql`${table.attributionRequired} = 0 or ${table.attributionText} is not null`,
    ),
    check(
      "license_options_credit_cost_positive",
      sql`${table.licenseCreditCost} > 0`,
    ),
    check("license_options_position_positive", sql`${table.position} > 0`),
  ],
);

export const licenseOffers = sqliteTable(
  "license_offers",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    trackRevisionId: text("track_revision_id").notNull(),
    licenseTermsId: text("license_terms_id").notNull(),
    licenseTermsVersionId: text("license_terms_version_id").notNull(),
    licenseTermsVersion: integer("license_terms_version").notNull(),
    licenseOptionId: text("license_option_id").notNull(),
    commerceProductId: text("commerce_product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "restrict" }),
    commercePriceId: text("commerce_price_id").notNull(),
    state: text("state", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("license_offers_slug_unique").on(table.slug),
    uniqueIndex("license_offers_track_option_unique").on(
      table.trackId,
      table.licenseTermsVersionId,
      table.licenseOptionId,
    ),
    uniqueIndex("license_offers_identity_revision_unique").on(
      table.id,
      table.revision,
    ),
    index("license_offers_track_state_idx").on(table.trackId, table.state),
    foreignKey({
      columns: [table.trackId, table.trackRevisionId],
      foreignColumns: [trackRevisions.trackId, trackRevisions.id],
      name: "license_offers_track_revision_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.licenseTermsVersionId,
        table.licenseTermsId,
        table.licenseTermsVersion,
      ],
      foreignColumns: [
        licenseTermsVersions.id,
        licenseTermsVersions.licenseTermsId,
        licenseTermsVersions.version,
      ],
      name: "license_offers_terms_version_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.licenseOptionId, table.licenseTermsVersionId],
      foreignColumns: [licenseOptions.id, licenseOptions.licenseTermsVersionId],
      name: "license_offers_option_version_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.commercePriceId, table.commerceProductId],
      foreignColumns: [commercePrices.id, commercePrices.commerceProductId],
      name: "license_offers_price_product_fk",
    }).onDelete("restrict"),
    check(
      "license_offers_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug})) and instr(${table.slug}, '/') = 0`,
    ),
    check(
      "license_offers_state_valid",
      sql`${table.state} in ('draft', 'active', 'archived')`,
    ),
    check("license_offers_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const commerceBindingIntents = sqliteTable(
  "commerce_binding_intents",
  {
    id: text("id").primaryKey(),
    intentKey: text("intent_key").notNull(),
    intentKind: text("intent_kind", {
      enum: ["membership", "subscription", "license"],
    }).notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    membershipPlanId: text("membership_plan_id"),
    membershipPlanRevisionId: text("membership_plan_revision_id"),
    membershipPlanRevision: integer("membership_plan_revision"),
    subscriptionPlanId: text("subscription_plan_id"),
    subscriptionPlanRevision: integer("subscription_plan_revision"),
    trackId: text("track_id"),
    trackRevisionId: text("track_revision_id"),
    trackRevision: integer("track_revision"),
    licenseTermsId: text("license_terms_id"),
    licenseTermsVersionId: text("license_terms_version_id"),
    licenseTermsVersion: integer("license_terms_version"),
    licenseOptionId: text("license_option_id"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    billingInterval: text("billing_interval", {
      enum: ["one_time", "month", "year"],
    }).notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    bindingState: text("binding_state", {
      enum: ["pending", "bound", "archived"],
    })
      .notNull()
      .default("pending"),
    commerceProductId: text("commerce_product_id"),
    commercePriceId: text("commerce_price_id"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("commerce_binding_intents_key_unique").on(table.intentKey),
    uniqueIndex("commerce_binding_intents_operation_key_unique").on(
      table.lastOperationKey,
    ),
    uniqueIndex("commerce_binding_intents_membership_revision_unique")
      .on(table.membershipPlanRevisionId)
      .where(sql`${table.membershipPlanRevisionId} is not null`),
    uniqueIndex("commerce_binding_intents_subscription_revision_unique")
      .on(table.subscriptionPlanId, table.subscriptionPlanRevision)
      .where(sql`${table.subscriptionPlanId} is not null`),
    uniqueIndex("commerce_binding_intents_license_subject_unique")
      .on(table.trackRevisionId, table.licenseOptionId)
      .where(sql`${table.trackRevisionId} is not null`),
    uniqueIndex("commerce_binding_intents_bound_product_unique")
      .on(table.commerceProductId)
      .where(sql`${table.commerceProductId} is not null`),
    uniqueIndex("commerce_binding_intents_bound_price_unique")
      .on(table.commercePriceId)
      .where(sql`${table.commercePriceId} is not null`),
    index("commerce_binding_intents_state_kind_idx").on(
      table.bindingState,
      table.intentKind,
      table.intentKey,
    ),
    foreignKey({
      columns: [
        table.membershipPlanRevisionId,
        table.membershipPlanId,
        table.membershipPlanRevision,
      ],
      foreignColumns: [
        membershipPlanRevisions.id,
        membershipPlanRevisions.membershipPlanId,
        membershipPlanRevisions.revision,
      ],
      name: "commerce_binding_intents_membership_revision_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.subscriptionPlanId, table.subscriptionPlanRevision],
      foreignColumns: [subscriptionPlans.id, subscriptionPlans.revision],
      name: "commerce_binding_intents_subscription_revision_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.trackId, table.trackRevisionId, table.trackRevision],
      foreignColumns: [
        trackRevisions.trackId,
        trackRevisions.id,
        trackRevisions.revision,
      ],
      name: "commerce_binding_intents_track_revision_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.licenseTermsVersionId,
        table.licenseTermsId,
        table.licenseTermsVersion,
      ],
      foreignColumns: [
        licenseTermsVersions.id,
        licenseTermsVersions.licenseTermsId,
        licenseTermsVersions.version,
      ],
      name: "commerce_binding_intents_terms_version_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.licenseOptionId, table.licenseTermsVersionId],
      foreignColumns: [licenseOptions.id, licenseOptions.licenseTermsVersionId],
      name: "commerce_binding_intents_option_version_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.commercePriceId, table.commerceProductId],
      foreignColumns: [commercePrices.id, commercePrices.commerceProductId],
      name: "commerce_binding_intents_price_product_fk",
    }).onDelete("restrict"),
    check(
      "commerce_binding_intents_key_valid",
      sql`length(${table.intentKey}) between 1 and 120 and ${table.intentKey} = lower(trim(${table.intentKey})) and ${table.intentKey} not glob '*[^a-z0-9-]*' and ${table.intentKey} not like '-%' and ${table.intentKey} not like '%-' and instr(${table.intentKey}, '--') = 0`,
    ),
    check(
      "commerce_binding_intents_text_valid",
      sql`length(trim(${table.name})) between 1 and 160 and length(${table.description}) <= 4000`,
    ),
    check(
      "commerce_binding_intents_subject_valid",
      sql`(
        ${table.intentKind} = 'membership'
        and ${table.membershipPlanId} is not null
        and ${table.membershipPlanRevisionId} is not null
        and ${table.membershipPlanRevision} > 0
        and ${table.subscriptionPlanId} is null
        and ${table.subscriptionPlanRevision} is null
        and ${table.trackId} is null
        and ${table.trackRevisionId} is null
        and ${table.trackRevision} is null
        and ${table.licenseTermsId} is null
        and ${table.licenseTermsVersionId} is null
        and ${table.licenseTermsVersion} is null
        and ${table.licenseOptionId} is null
      ) or (
        ${table.intentKind} = 'subscription'
        and ${table.membershipPlanId} is null
        and ${table.membershipPlanRevisionId} is null
        and ${table.membershipPlanRevision} is null
        and ${table.subscriptionPlanId} is not null
        and ${table.subscriptionPlanRevision} > 0
        and ${table.trackId} is null
        and ${table.trackRevisionId} is null
        and ${table.trackRevision} is null
        and ${table.licenseTermsId} is null
        and ${table.licenseTermsVersionId} is null
        and ${table.licenseTermsVersion} is null
        and ${table.licenseOptionId} is null
      ) or (
        ${table.intentKind} = 'license'
        and ${table.membershipPlanId} is null
        and ${table.membershipPlanRevisionId} is null
        and ${table.membershipPlanRevision} is null
        and ${table.subscriptionPlanId} is null
        and ${table.subscriptionPlanRevision} is null
        and ${table.trackId} is not null
        and ${table.trackRevisionId} is not null
        and ${table.trackRevision} > 0
        and ${table.licenseTermsId} is not null
        and ${table.licenseTermsVersionId} is not null
        and ${table.licenseTermsVersion} > 0
        and ${table.licenseOptionId} is not null
      )`,
    ),
    check(
      "commerce_binding_intents_price_valid",
      sql`${table.amountMinor} > 0 and length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency}) and ${table.intervalCount} > 0 and ((${table.intentKind} = 'subscription' and ${table.billingInterval} in ('month', 'year')) or (${table.intentKind} in ('membership', 'license') and ${table.billingInterval} = 'one_time'))`,
    ),
    check(
      "commerce_binding_intents_binding_valid",
      sql`(
        ${table.bindingState} = 'pending'
        and ${table.commerceProductId} is null
        and ${table.commercePriceId} is null
      ) or (
        ${table.bindingState} = 'bound'
        and ${table.commerceProductId} is not null
        and ${table.commercePriceId} is not null
      ) or (
        ${table.bindingState} = 'archived'
        and ((${table.commerceProductId} is null and ${table.commercePriceId} is null) or (${table.commerceProductId} is not null and ${table.commercePriceId} is not null))
      )`,
    ),
    check(
      "commerce_binding_intents_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check(
      "commerce_binding_intents_revision_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);

export const licenseRequests = sqliteTable(
  "license_requests",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    licenseOfferId: text("license_offer_id")
      .notNull()
      .references(() => licenseOffers.id, { onDelete: "restrict" }),
    licenseOfferRevision: integer("license_offer_revision").notNull(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    licenseTermsVersionId: text("license_terms_version_id")
      .notNull()
      .references(() => licenseTermsVersions.id, { onDelete: "restrict" }),
    licenseOptionId: text("license_option_id")
      .notNull()
      .references(() => licenseOptions.id, { onDelete: "restrict" }),
    licenseeName: text("licensee_name").notNull(),
    projectTitle: text("project_title").notNull(),
    intendedUse: text("intended_use").notNull(),
    projectDescription: text("project_description").notNull(),
    intendedUseSnapshotJson: text("intended_use_snapshot_json").notNull(),
    termsSnapshotJson: text("terms_snapshot_json").notNull(),
    state: text("state", {
      enum: [
        "draft",
        "submitted",
        "pending_approval",
        "approved",
        "rejected",
        "canceled",
        "issued",
      ],
    })
      .notNull()
      .default("draft"),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: text("approved_at"),
    rejectedByUserId: text("rejected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectedAt: text("rejected_at"),
    canceledAt: text("canceled_at"),
    issuedAt: text("issued_at"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("license_requests_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    index("license_requests_customer_state_idx").on(
      table.customerUserId,
      table.state,
      table.createdAt,
    ),
    index("license_requests_offer_state_idx").on(
      table.licenseOfferId,
      table.state,
    ),
    foreignKey({
      columns: [table.licenseOfferId, table.licenseOfferRevision],
      foreignColumns: [licenseOffers.id, licenseOffers.revision],
      name: "license_requests_offer_revision_fk",
    }).onDelete("restrict"),
    check(
      "license_requests_text_length_valid",
      sql`length(trim(${table.licenseeName})) between 1 and 160 and length(trim(${table.projectTitle})) between 1 and 240 and length(trim(${table.intendedUse})) between 1 and 2000 and length(trim(${table.projectDescription})) between 1 and 12000`,
    ),
    check(
      "license_requests_snapshots_valid",
      sql`json_valid(${table.intendedUseSnapshotJson}) and json_type(${table.intendedUseSnapshotJson}) = 'object' and json_valid(${table.termsSnapshotJson}) and json_type(${table.termsSnapshotJson}) = 'object'`,
    ),
    check(
      "license_requests_state_valid",
      sql`${table.state} in ('draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'canceled', 'issued')`,
    ),
    check(
      "license_requests_terminal_state_valid",
      sql`(
        ${table.state} in ('draft', 'submitted', 'pending_approval')
        and ${table.approvedAt} is null
        and ${table.rejectedAt} is null
        and ${table.canceledAt} is null
        and ${table.issuedAt} is null
      ) or (
        ${table.state} = 'approved'
        and ${table.approvedByUserId} is not null
        and ${table.approvedAt} is not null
        and ${table.rejectedAt} is null
        and ${table.canceledAt} is null
        and ${table.issuedAt} is null
      ) or (
        ${table.state} = 'rejected'
        and ${table.rejectedByUserId} is not null
        and ${table.rejectedAt} is not null
        and ${table.canceledAt} is null
        and ${table.issuedAt} is null
      ) or (
        ${table.state} = 'canceled'
        and ${table.canceledAt} is not null
        and ${table.issuedAt} is null
      ) or (
        ${table.state} = 'issued'
        and ${table.issuedAt} is not null
      )`,
    ),
    check(
      "license_requests_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("license_requests_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const issuedLicenses = sqliteTable(
  "issued_licenses",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id").notNull(),
    licenseRequestId: text("license_request_id").notNull(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    licenseTermsVersionId: text("license_terms_version_id")
      .notNull()
      .references(() => licenseTermsVersions.id, { onDelete: "restrict" }),
    licenseOptionId: text("license_option_id")
      .notNull()
      .references(() => licenseOptions.id, { onDelete: "restrict" }),
    source: text("source", {
      enum: ["owner_approval", "credit_redemption", "stripe_test_order"],
    }).notNull(),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    creditLedgerEntryId: text("credit_ledger_entry_id").references(
      () => creditLedgerEntries.id,
      { onDelete: "restrict" },
    ),
    fulfillmentEventId: text("fulfillment_event_id").references(
      () => fulfillmentEvents.id,
      { onDelete: "restrict" },
    ),
    termsSnapshotJson: text("terms_snapshot_json").notNull(),
    state: text("state", { enum: ["active", "revoked", "expired"] })
      .notNull()
      .default("active"),
    issuedAt: text("issued_at").notNull(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    expiredAt: text("expired_at"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("issued_licenses_request_unique").on(table.licenseRequestId),
    uniqueIndex("issued_licenses_operation_unique").on(table.lastOperationKey),
    uniqueIndex("issued_licenses_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    index("issued_licenses_customer_state_idx").on(
      table.customerUserId,
      table.state,
      table.issuedAt,
    ),
    index("issued_licenses_track_state_idx").on(table.trackId, table.state),
    foreignKey({
      columns: [table.licenseRequestId, table.customerUserId],
      foreignColumns: [licenseRequests.id, licenseRequests.customerUserId],
      name: "issued_licenses_request_customer_fk",
    }).onDelete("restrict"),
    check(
      "issued_licenses_source_valid",
      sql`${table.source} in ('owner_approval', 'credit_redemption', 'stripe_test_order')`,
    ),
    check(
      "issued_licenses_source_links_valid",
      sql`(
        ${table.source} = 'owner_approval'
        and ${table.orderId} is null
        and ${table.creditLedgerEntryId} is null
        and ${table.fulfillmentEventId} is null
      ) or (
        ${table.source} = 'credit_redemption'
        and ${table.orderId} is null
        and ${table.creditLedgerEntryId} is not null
        and ${table.fulfillmentEventId} is null
      ) or (
        ${table.source} = 'stripe_test_order'
        and ${table.orderId} is not null
        and ${table.creditLedgerEntryId} is null
        and ${table.fulfillmentEventId} is not null
      )`,
    ),
    check(
      "issued_licenses_snapshot_valid",
      sql`json_valid(${table.termsSnapshotJson}) and json_type(${table.termsSnapshotJson}) = 'object'`,
    ),
    check(
      "issued_licenses_state_valid",
      sql`(
        ${table.state} = 'active'
        and ${table.revokedAt} is null
        and ${table.expiredAt} is null
      ) or (
        ${table.state} = 'revoked'
        and ${table.revokedAt} is not null
        and ${table.expiredAt} is null
      ) or (
        ${table.state} = 'expired'
        and ${table.expiredAt} is not null
        and ${table.revokedAt} is null
      )`,
    ),
    check(
      "issued_licenses_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("issued_licenses_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const licenseDocuments = sqliteTable(
  "license_documents",
  {
    id: text("id").primaryKey(),
    issuedLicenseId: text("issued_license_id")
      .notNull()
      .references(() => issuedLicenses.id, { onDelete: "restrict" }),
    customerUserId: text("customer_user_id").notNull(),
    state: text("state", {
      enum: ["queued", "processing", "ready", "failed"],
    })
      .notNull()
      .default("queued"),
    mediaObjectId: text("media_object_id").references(() => mediaObjects.id, {
      onDelete: "restrict",
    }),
    contentDigest: text("content_digest"),
    byteLength: integer("byte_length"),
    failureCategory: text("failure_category"),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("license_documents_license_unique").on(table.issuedLicenseId),
    uniqueIndex("license_documents_identity_customer_unique").on(
      table.id,
      table.customerUserId,
    ),
    index("license_documents_state_updated_idx").on(
      table.state,
      table.updatedAt,
    ),
    foreignKey({
      columns: [table.issuedLicenseId, table.customerUserId],
      foreignColumns: [issuedLicenses.id, issuedLicenses.customerUserId],
      name: "license_documents_license_customer_fk",
    }).onDelete("restrict"),
    check(
      "license_documents_state_valid",
      sql`${table.state} in ('queued', 'processing', 'ready', 'failed')`,
    ),
    check(
      "license_documents_result_valid",
      sql`(
        ${table.state} in ('queued', 'processing')
        and ${table.mediaObjectId} is null
        and ${table.contentDigest} is null
        and ${table.byteLength} is null
        and ${table.failureCategory} is null
      ) or (
        ${table.state} = 'ready'
        and ${table.contentDigest} is not null
        and length(${table.contentDigest}) = 64
        and ${table.byteLength} > 0
        and ${table.failureCategory} is null
      ) or (
        ${table.state} = 'failed'
        and ${table.mediaObjectId} is null
        and ${table.contentDigest} is null
        and ${table.byteLength} is null
        and ${table.failureCategory} is not null
      )`,
    ),
    check(
      "license_documents_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
    check("license_documents_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const licenseDocumentJobs = sqliteTable(
  "license_document_jobs",
  {
    id: text("id").primaryKey(),
    licenseDocumentId: text("license_document_id")
      .notNull()
      .references(() => licenseDocuments.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["queued", "processing", "complete", "failed"],
    })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    workerId: text("worker_id"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
    failureCategory: text("failure_category"),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("license_document_jobs_document_unique").on(
      table.licenseDocumentId,
    ),
    index("license_document_jobs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "license_document_jobs_status_valid",
      sql`${table.status} in ('queued', 'processing', 'complete', 'failed')`,
    ),
    check(
      "license_document_jobs_attempts_nonnegative",
      sql`${table.attempts} >= 0`,
    ),
    check(
      "license_document_jobs_lease_valid",
      sql`(${table.status} = 'processing' and ${table.workerId} is not null and ${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'processing' and ${table.leaseToken} is null and ${table.leaseExpiresAt} is null)`,
    ),
    check(
      "license_document_jobs_failure_valid",
      sql`(${table.status} = 'failed' and ${table.failureCategory} is not null) or (${table.status} <> 'failed' and ${table.failureCategory} is null)`,
    ),
  ],
);

export const licenseEvents = sqliteTable(
  "license_events",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    licenseRequestId: text("license_request_id").references(
      () => licenseRequests.id,
      { onDelete: "restrict" },
    ),
    issuedLicenseId: text("issued_license_id").references(
      () => issuedLicenses.id,
      { onDelete: "restrict" },
    ),
    eventType: text("event_type", {
      enum: [
        "submitted",
        "approved",
        "rejected",
        "canceled",
        "issued",
        "revoked",
        "expired",
        "document_ready",
        "document_failed",
      ],
    }).notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: text("source", {
      enum: ["customer", "owner", "credit", "stripe_test", "system"],
    }).notNull(),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    creditLedgerEntryId: text("credit_ledger_entry_id").references(
      () => creditLedgerEntries.id,
      { onDelete: "restrict" },
    ),
    fulfillmentEventId: text("fulfillment_event_id").references(
      () => fulfillmentEvents.id,
      { onDelete: "restrict" },
    ),
    detailsJson: text("details_json").notNull().default("{}"),
    idempotencyKey: text("idempotency_key").notNull(),
    stripeEnvironment: text("stripe_environment", { enum: ["test"] })
      .notNull()
      .default("test"),
    livemode: integer("livemode", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("license_events_operation_unique").on(table.idempotencyKey),
    index("license_events_customer_created_idx").on(
      table.customerUserId,
      table.createdAt,
    ),
    index("license_events_license_created_idx").on(
      table.issuedLicenseId,
      table.createdAt,
    ),
    check(
      "license_events_subject_valid",
      sql`${table.licenseRequestId} is not null or ${table.issuedLicenseId} is not null`,
    ),
    check(
      "license_events_type_valid",
      sql`${table.eventType} in ('submitted', 'approved', 'rejected', 'canceled', 'issued', 'revoked', 'expired', 'document_ready', 'document_failed')`,
    ),
    check(
      "license_events_source_valid",
      sql`${table.source} in ('customer', 'owner', 'credit', 'stripe_test', 'system')`,
    ),
    check(
      "license_events_details_json_valid",
      sql`json_valid(${table.detailsJson}) and json_type(${table.detailsJson}) = 'object'`,
    ),
    check(
      "license_events_test_only",
      sql`${table.stripeEnvironment} = 'test' and ${table.livemode} = 0`,
    ),
  ],
);

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    draftRevisionId: text("draft_revision_id").notNull(),
    publishedRevisionId: text("published_revision_id"),
    publicationState: text("publication_state", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    publishedAt: text("published_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("courses_slug_unique").on(table.slug),
    index("courses_publication_lookup").on(table.publicationState, table.slug),
    check(
      "courses_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug})) and instr(${table.slug}, '/') = 0`,
    ),
    check(
      "courses_publication_state_valid",
      sql`${table.publicationState} in ('draft', 'published', 'archived')`,
    ),
    check(
      "courses_publication_fields_valid",
      sql`(${table.publicationState} = 'published' and ${table.publishedRevisionId} is not null and ${table.publishedAt} is not null) or (${table.publicationState} <> 'published')`,
    ),
    check("courses_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const courseRevisions = sqliteTable(
  "course_revisions",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    accessMode: text("access_mode", {
      enum: ["public", "account", "protected"],
    })
      .notNull()
      .default("public"),
    accessPlanId: text("access_plan_id").references(() => accessPlans.id, {
      onDelete: "restrict",
    }),
    accessPlanRevision: integer("access_plan_revision"),
    estimatedMinutes: integer("estimated_minutes"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("course_revisions_number_unique").on(
      table.courseId,
      table.revision,
    ),
    uniqueIndex("course_revisions_identity_course_unique").on(
      table.id,
      table.courseId,
    ),
    check("course_revisions_number_positive", sql`${table.revision} > 0`),
    check(
      "course_revisions_access_mode_valid",
      sql`${table.accessMode} in ('public', 'account', 'protected')`,
    ),
    check(
      "course_revisions_access_plan_valid",
      sql`(${table.accessPlanId} is null and ${table.accessPlanRevision} is null) or (${table.accessMode} = 'protected' and ${table.accessPlanId} is not null and ${table.accessPlanRevision} > 0)`,
    ),
    check(
      "course_revisions_estimate_positive",
      sql`${table.estimatedMinutes} is null or ${table.estimatedMinutes} > 0`,
    ),
  ],
);

export const courseSections = sqliteTable(
  "course_sections",
  {
    id: text("id").primaryKey(),
    courseRevisionId: text("course_revision_id")
      .notNull()
      .references(() => courseRevisions.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("course_sections_revision_key_unique").on(
      table.courseRevisionId,
      table.sectionKey,
    ),
    uniqueIndex("course_sections_revision_position_unique").on(
      table.courseRevisionId,
      table.position,
    ),
    uniqueIndex("course_sections_identity_revision_unique").on(
      table.id,
      table.courseRevisionId,
    ),
    check(
      "course_sections_key_normalized",
      sql`${table.sectionKey} = lower(trim(${table.sectionKey})) and instr(${table.sectionKey}, '/') = 0`,
    ),
    check("course_sections_position_positive", sql`${table.position} > 0`),
  ],
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    courseRevisionId: text("course_revision_id").notNull(),
    courseSectionId: text("course_section_id").notNull(),
    lessonKey: text("lesson_key").notNull(),
    slug: text("slug").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    accessMode: text("access_mode", {
      enum: ["inherit", "public", "account", "protected"],
    })
      .notNull()
      .default("inherit"),
    estimatedMinutes: integer("estimated_minutes"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("lessons_revision_key_unique").on(
      table.courseRevisionId,
      table.lessonKey,
    ),
    uniqueIndex("lessons_revision_slug_unique").on(
      table.courseRevisionId,
      table.slug,
    ),
    uniqueIndex("lessons_section_position_unique").on(
      table.courseSectionId,
      table.position,
    ),
    uniqueIndex("lessons_identity_revision_unique").on(
      table.id,
      table.courseRevisionId,
    ),
    foreignKey({
      columns: [table.courseSectionId, table.courseRevisionId],
      foreignColumns: [courseSections.id, courseSections.courseRevisionId],
      name: "lessons_section_revision_fk",
    }).onDelete("cascade"),
    check(
      "lessons_key_normalized",
      sql`${table.lessonKey} = lower(trim(${table.lessonKey})) and instr(${table.lessonKey}, '/') = 0`,
    ),
    check(
      "lessons_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug})) and instr(${table.slug}, '/') = 0`,
    ),
    check("lessons_position_positive", sql`${table.position} > 0`),
    check(
      "lessons_access_mode_valid",
      sql`${table.accessMode} in ('inherit', 'public', 'account', 'protected')`,
    ),
    check(
      "lessons_estimate_positive",
      sql`${table.estimatedMinutes} is null or ${table.estimatedMinutes} > 0`,
    ),
  ],
);

export const lessonItems = sqliteTable(
  "lesson_items",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    position: integer("position").notNull(),
    itemType: text("item_type", {
      enum: ["text", "prompt", "image", "audio", "video", "download"],
    }).notNull(),
    contentJson: text("content_json").notNull().default("{}"),
    mediaDerivativeId: text("media_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "restrict" },
    ),
    altText: text("alt_text"),
    transcriptText: text("transcript_text"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("lesson_items_lesson_key_unique").on(
      table.lessonId,
      table.itemKey,
    ),
    uniqueIndex("lesson_items_lesson_position_unique").on(
      table.lessonId,
      table.position,
    ),
    check(
      "lesson_items_key_normalized",
      sql`${table.itemKey} = lower(trim(${table.itemKey})) and instr(${table.itemKey}, '/') = 0`,
    ),
    check("lesson_items_position_positive", sql`${table.position} > 0`),
    check(
      "lesson_items_type_valid",
      sql`${table.itemType} in ('text', 'prompt', 'image', 'audio', 'video', 'download')`,
    ),
    check(
      "lesson_items_content_json_valid",
      sql`json_valid(${table.contentJson}) and json_type(${table.contentJson}) = 'object'`,
    ),
    check(
      "lesson_items_media_valid",
      sql`(${table.itemType} in ('text', 'prompt') and ${table.mediaDerivativeId} is null) or (${table.itemType} in ('image', 'audio', 'video', 'download') and ${table.mediaDerivativeId} is not null)`,
    ),
  ],
);

export const courseProgress = sqliteTable(
  "course_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonKey: text("lesson_key").notNull(),
    state: text("state", { enum: ["in_progress", "completed"] })
      .notNull()
      .default("in_progress"),
    completedItemKeysJson: text("completed_item_keys_json")
      .notNull()
      .default("[]"),
    lastItemKey: text("last_item_key"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("course_progress_user_lesson_unique").on(
      table.userId,
      table.courseId,
      table.lessonKey,
    ),
    index("course_progress_user_updated_idx").on(table.userId, table.updatedAt),
    check(
      "course_progress_lesson_key_normalized",
      sql`${table.lessonKey} = lower(trim(${table.lessonKey})) and instr(${table.lessonKey}, '/') = 0`,
    ),
    check(
      "course_progress_state_valid",
      sql`${table.state} in ('in_progress', 'completed')`,
    ),
    check(
      "course_progress_items_json_valid",
      sql`json_valid(${table.completedItemKeysJson}) and json_type(${table.completedItemKeysJson}) = 'array'`,
    ),
    check(
      "course_progress_completion_valid",
      sql`(${table.state} = 'in_progress' and ${table.completedAt} is null) or (${table.state} = 'completed' and ${table.completedAt} is not null)`,
    ),
    check("course_progress_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const videos = sqliteTable(
  "videos",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    draftRevisionId: text("draft_revision_id").notNull(),
    publishedRevisionId: text("published_revision_id"),
    publicationState: text("publication_state", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    publishedAt: text("published_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("videos_slug_unique").on(table.slug),
    index("videos_publication_lookup").on(table.publicationState, table.slug),
    check(
      "videos_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug})) and instr(${table.slug}, '/') = 0`,
    ),
    check(
      "videos_publication_state_valid",
      sql`${table.publicationState} in ('draft', 'published', 'archived')`,
    ),
    check(
      "videos_publication_fields_valid",
      sql`(${table.publicationState} = 'published' and ${table.publishedRevisionId} is not null and ${table.publishedAt} is not null) or (${table.publicationState} <> 'published')`,
    ),
    check("videos_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const videoRevisions = sqliteTable(
  "video_revisions",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    artistContext: text("artist_context").notNull().default(""),
    creditsJson: text("credits_json").notNull().default("[]"),
    deliveryKind: text("delivery_kind", {
      enum: ["artist_hosted", "external"],
    }).notNull(),
    posterDerivativeId: text("poster_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "restrict" },
    ),
    hostedDerivativeId: text("hosted_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "restrict" },
    ),
    externalProvider: text("external_provider", {
      enum: ["youtube", "vimeo", "other"],
    }),
    externalEmbedUrl: text("external_embed_url"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("video_revisions_number_unique").on(
      table.videoId,
      table.revision,
    ),
    uniqueIndex("video_revisions_identity_video_unique").on(
      table.id,
      table.videoId,
    ),
    check("video_revisions_number_positive", sql`${table.revision} > 0`),
    check(
      "video_revisions_credits_json_valid",
      sql`json_valid(${table.creditsJson}) and json_type(${table.creditsJson}) = 'array'`,
    ),
    check(
      "video_revisions_delivery_kind_valid",
      sql`${table.deliveryKind} in ('artist_hosted', 'external')`,
    ),
    check(
      "video_revisions_delivery_fields_valid",
      sql`(${table.deliveryKind} = 'artist_hosted' and ${table.hostedDerivativeId} is not null and ${table.externalProvider} is null and ${table.externalEmbedUrl} is null) or (${table.deliveryKind} = 'external' and ${table.hostedDerivativeId} is null and ${table.externalProvider} is not null and ${table.externalEmbedUrl} is not null)`,
    ),
    check(
      "video_revisions_external_provider_valid",
      sql`${table.externalProvider} is null or ${table.externalProvider} in ('youtube', 'vimeo', 'other')`,
    ),
    check(
      "video_revisions_external_url_valid",
      sql`${table.externalEmbedUrl} is null or ${table.externalEmbedUrl} glob 'https://*'`,
    ),
  ],
);

export const videoTranscripts = sqliteTable(
  "video_transcripts",
  {
    id: text("id").primaryKey(),
    videoRevisionId: text("video_revision_id")
      .notNull()
      .references(() => videoRevisions.id, { onDelete: "cascade" }),
    language: text("language").notNull().default("en"),
    transcriptText: text("transcript_text").notNull(),
    captionsDerivativeId: text("captions_derivative_id").references(
      () => mediaDerivatives.id,
      { onDelete: "restrict" },
    ),
    revision: integer("revision").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("video_transcripts_revision_language_unique").on(
      table.videoRevisionId,
      table.language,
    ),
    check(
      "video_transcripts_language_normalized",
      sql`${table.language} = lower(trim(${table.language})) and length(${table.language}) between 2 and 16`,
    ),
    check(
      "video_transcripts_text_present",
      sql`length(trim(${table.transcriptText})) > 0`,
    ),
    check("video_transcripts_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const editorialPosts = sqliteTable(
  "editorial_posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    bodyJson: text("body_json").notNull().default("[]"),
    state: text("state", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    publishedAt: text("published_at"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("editorial_posts_slug_unique").on(table.slug),
    index("editorial_posts_state_published_idx").on(
      table.state,
      table.publishedAt,
    ),
    check(
      "editorial_posts_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug})) and instr(${table.slug}, '/') = 0`,
    ),
    check(
      "editorial_posts_body_json_valid",
      sql`json_valid(${table.bodyJson}) and json_type(${table.bodyJson}) = 'array'`,
    ),
    check(
      "editorial_posts_state_valid",
      sql`${table.state} in ('draft', 'published', 'archived')`,
    ),
    check(
      "editorial_posts_publication_valid",
      sql`(${table.state} = 'published' and ${table.publishedAt} is not null) or (${table.state} <> 'published')`,
    ),
    check("editorial_posts_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const updates = sqliteTable(
  "updates",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    bodyJson: text("body_json").notNull().default("[]"),
    audience: text("audience", { enum: ["public", "account"] })
      .notNull()
      .default("public"),
    resourceType: text("resource_type", {
      enum: [
        "track",
        "release",
        "collection",
        "course",
        "video",
        "page",
        "license",
        "membership",
        "subscription",
        "order",
      ],
    }),
    resourceId: text("resource_id"),
    state: text("state", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    publishedAt: text("published_at"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("updates_slug_unique").on(table.slug),
    index("updates_state_published_idx").on(table.state, table.publishedAt),
    check(
      "updates_slug_normalized",
      sql`${table.slug} = lower(trim(${table.slug})) and instr(${table.slug}, '/') = 0`,
    ),
    check(
      "updates_body_json_valid",
      sql`json_valid(${table.bodyJson}) and json_type(${table.bodyJson}) = 'array'`,
    ),
    check(
      "updates_audience_valid",
      sql`${table.audience} in ('public', 'account')`,
    ),
    check(
      "updates_resource_valid",
      sql`(${table.resourceType} is null and ${table.resourceId} is null) or (${table.resourceType} in ('track', 'release', 'collection', 'course', 'video', 'page', 'license', 'membership', 'subscription', 'order') and ${table.resourceId} is not null)`,
    ),
    check(
      "updates_order_audience_private",
      sql`${table.resourceType} is not 'order' or ${table.audience} = 'account'`,
    ),
    check(
      "updates_state_valid",
      sql`${table.state} in ('draft', 'published', 'archived')`,
    ),
    check(
      "updates_publication_valid",
      sql`(${table.state} = 'published' and ${table.publishedAt} is not null) or (${table.state} <> 'published')`,
    ),
    check("updates_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const updateReads = sqliteTable(
  "update_reads",
  {
    id: text("id").primaryKey(),
    updateId: text("update_id")
      .notNull()
      .references(() => updates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: text("read_at").notNull(),
    lastOperationKey: text("last_operation_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("update_reads_update_user_unique").on(
      table.updateId,
      table.userId,
    ),
    uniqueIndex("update_reads_operation_unique").on(table.lastOperationKey),
    index("update_reads_user_read_idx").on(table.userId, table.readAt),
  ],
);

export const contactForms = sqliteTable(
  "contact_forms",
  {
    id: text("id").primaryKey(),
    formKey: text("form_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    bookingInformation: text("booking_information").notNull().default(""),
    publicContactDetails: text("public_contact_details").notNull().default(""),
    categoriesJson: text("categories_json").notNull().default("[]"),
    state: text("state", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    currentConsentVersion: integer("current_consent_version").notNull(),
    deliveryAdapter: text("delivery_adapter", { enum: ["stored_only"] })
      .notNull()
      .default("stored_only"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("contact_forms_key_unique").on(table.formKey),
    check(
      "contact_forms_key_normalized",
      sql`${table.formKey} = lower(trim(${table.formKey})) and instr(${table.formKey}, '/') = 0`,
    ),
    check(
      "contact_forms_categories_json_valid",
      sql`json_valid(${table.categoriesJson}) and json_type(${table.categoriesJson}) = 'array'`,
    ),
    check(
      "contact_forms_public_details_length_valid",
      sql`length(${table.bookingInformation}) <= 4000 and length(${table.publicContactDetails}) <= 4000`,
    ),
    check(
      "contact_forms_state_valid",
      sql`${table.state} in ('active', 'disabled')`,
    ),
    check(
      "contact_forms_consent_version_positive",
      sql`${table.currentConsentVersion} > 0`,
    ),
    check(
      "contact_forms_adapter_valid",
      sql`${table.deliveryAdapter} = 'stored_only'`,
    ),
    check("contact_forms_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const contactConsentVersions = sqliteTable(
  "contact_consent_versions",
  {
    id: text("id").primaryKey(),
    contactFormId: text("contact_form_id")
      .notNull()
      .references(() => contactForms.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    consentText: text("consent_text").notNull(),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    effectiveAt: text("effective_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("contact_consent_versions_form_number_unique").on(
      table.contactFormId,
      table.version,
    ),
    uniqueIndex("contact_consent_versions_identity_form_unique").on(
      table.id,
      table.contactFormId,
    ),
    check(
      "contact_consent_versions_number_positive",
      sql`${table.version} > 0`,
    ),
    check(
      "contact_consent_versions_text_present",
      sql`length(trim(${table.consentText})) > 0`,
    ),
  ],
);

export const contactSubmissions = sqliteTable(
  "contact_submissions",
  {
    id: text("id").primaryKey(),
    contactFormId: text("contact_form_id").notNull(),
    consentVersionId: text("consent_version_id").notNull(),
    submitterUserId: text("submitter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    category: text("category").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    state: text("state", {
      enum: ["new", "in_progress", "resolved", "archived"],
    })
      .notNull()
      .default("new"),
    requestId: text("request_id").notNull(),
    consentedAt: text("consented_at").notNull(),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("contact_submissions_request_unique").on(table.requestId),
    index("contact_submissions_state_created_idx").on(
      table.state,
      table.createdAt,
    ),
    index("contact_submissions_email_created_idx").on(
      table.normalizedEmail,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.consentVersionId, table.contactFormId],
      foreignColumns: [
        contactConsentVersions.id,
        contactConsentVersions.contactFormId,
      ],
      name: "contact_submissions_consent_form_fk",
    }).onDelete("restrict"),
    check(
      "contact_submissions_email_normalized",
      sql`${table.normalizedEmail} = lower(trim(${table.email}))`,
    ),
    check(
      "contact_submissions_text_length_valid",
      sql`length(trim(${table.name})) between 1 and 160 and length(trim(${table.email})) between 3 and 320 and length(trim(${table.category})) between 1 and 80 and length(trim(${table.subject})) between 1 and 240 and length(trim(${table.message})) between 1 and 12000`,
    ),
    check(
      "contact_submissions_state_valid",
      sql`${table.state} in ('new', 'in_progress', 'resolved', 'archived')`,
    ),
    check("contact_submissions_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const contactNotes = sqliteTable(
  "contact_notes",
  {
    id: text("id").primaryKey(),
    contactSubmissionId: text("contact_submission_id")
      .notNull()
      .references(() => contactSubmissions.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    lastOperationKey: text("last_operation_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("contact_notes_operation_unique").on(table.lastOperationKey),
    index("contact_notes_submission_created_idx").on(
      table.contactSubmissionId,
      table.createdAt,
    ),
    check(
      "contact_notes_body_length_valid",
      sql`length(trim(${table.body})) between 1 and 4000`,
    ),
  ],
);

export const telemetrySettings = sqliteTable(
  "telemetry_settings",
  {
    id: text("id").primaryKey(),
    collectionMode: text("collection_mode", {
      enum: ["disabled", "consent_required", "anonymous"],
    })
      .notNull()
      .default("consent_required"),
    retentionDays: integer("retention_days").notNull().default(30),
    meaningfulListenSeconds: integer("meaningful_listen_seconds")
      .notNull()
      .default(10),
    revision: integer("revision").notNull().default(1),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("telemetry_settings_singleton", sql`${table.id} = 'telemetry'`),
    check(
      "telemetry_settings_mode_valid",
      sql`${table.collectionMode} in ('disabled', 'consent_required', 'anonymous')`,
    ),
    check(
      "telemetry_settings_retention_valid",
      sql`${table.retentionDays} between 1 and 365`,
    ),
    check(
      "telemetry_settings_listen_threshold_valid",
      sql`${table.meaningfulListenSeconds} between 5 and 300`,
    ),
    check("telemetry_settings_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const telemetryEvents = sqliteTable(
  "telemetry_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventName: text("event_name", {
      enum: [
        "contact-submitted",
        "contact-view",
        "course-view",
        "download-delivered",
        "favorite-saved",
        "lesson-completed",
        "license-issued",
        "licensing-view",
        "meaningful-listen",
        "membership-activated",
        "membership-view",
        "music-view",
        "playback-start",
        "playlist-updated",
        "protected-resource-delivered",
        "release-view",
        "subscription-activated",
        "subscription-canceled",
        "track-view",
        "update-read",
        "update-view",
        "video-playback-start",
        "video-view",
      ],
    }).notNull(),
    resourceType: text("resource_type", {
      enum: [
        "site",
        "track",
        "release",
        "collection",
        "course",
        "lesson",
        "video",
        "update",
        "contact",
        "membership",
        "subscription",
        "license",
        "download",
        "playlist",
        "protected-resource",
      ],
    })
      .notNull()
      .default("site"),
    resourceId: text("resource_id").notNull().default("site"),
    consentBasis: text("consent_basis", {
      enum: ["explicit", "not_required"],
    }).notNull(),
    dayUtc: text("day_utc").notNull(),
    occurredAt: text("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("telemetry_events_day_event_idx").on(table.dayUtc, table.eventName),
    index("telemetry_events_session_day_idx").on(table.sessionId, table.dayUtc),
    index("telemetry_events_resource_day_idx").on(
      table.resourceType,
      table.resourceId,
      table.dayUtc,
    ),
    check(
      "telemetry_events_name_valid",
      sql`${table.eventName} in ('contact-submitted', 'contact-view', 'course-view', 'download-delivered', 'favorite-saved', 'lesson-completed', 'license-issued', 'licensing-view', 'meaningful-listen', 'membership-activated', 'membership-view', 'music-view', 'playback-start', 'playlist-updated', 'protected-resource-delivered', 'release-view', 'subscription-activated', 'subscription-canceled', 'track-view', 'update-read', 'update-view', 'video-playback-start', 'video-view')`,
    ),
    check(
      "telemetry_events_resource_type_valid",
      sql`${table.resourceType} in ('site', 'track', 'release', 'collection', 'course', 'lesson', 'video', 'update', 'contact', 'membership', 'subscription', 'license', 'download', 'playlist', 'protected-resource')`,
    ),
    check(
      "telemetry_events_resource_id_valid",
      sql`length(trim(${table.resourceId})) between 1 and 128 and instr(${table.resourceId}, '/') = 0`,
    ),
    check(
      "telemetry_events_consent_basis_valid",
      sql`${table.consentBasis} in ('explicit', 'not_required')`,
    ),
    check(
      "telemetry_events_day_valid",
      sql`length(${table.dayUtc}) = 10 and substr(${table.dayUtc}, 5, 1) = '-' and substr(${table.dayUtc}, 8, 1) = '-'`,
    ),
  ],
);

export const telemetryDailyAggregates = sqliteTable(
  "telemetry_daily_aggregates",
  {
    id: text("id").primaryKey(),
    dayUtc: text("day_utc").notNull(),
    eventName: text("event_name").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    eventCount: integer("event_count").notNull(),
    sessionCount: integer("session_count").notNull(),
    linkedUserCount: integer("linked_user_count").notNull(),
    aggregatedAt: text("aggregated_at").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("telemetry_daily_aggregates_group_unique").on(
      table.dayUtc,
      table.eventName,
      table.resourceType,
      table.resourceId,
    ),
    index("telemetry_daily_aggregates_day_idx").on(table.dayUtc),
    check(
      "telemetry_daily_aggregates_counts_valid",
      sql`${table.eventCount} > 0 and ${table.sessionCount} > 0 and ${table.linkedUserCount} >= 0 and ${table.sessionCount} <= ${table.eventCount} and ${table.linkedUserCount} <= ${table.sessionCount}`,
    ),
  ],
);

export const telemetryAggregateDays = sqliteTable(
  "telemetry_aggregate_days",
  {
    dayUtc: text("day_utc").primaryKey(),
    sourceEventCount: integer("source_event_count").notNull(),
    groupCount: integer("group_count").notNull(),
    sessionCount: integer("session_count").notNull(),
    linkedUserCount: integer("linked_user_count").notNull(),
    finalizedAt: text("finalized_at").notNull(),
    lastOperationKey: text("last_operation_key").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("telemetry_aggregate_days_operation_unique").on(
      table.lastOperationKey,
    ),
    check(
      "telemetry_aggregate_days_counts_valid",
      sql`${table.sourceEventCount} > 0 and ${table.groupCount} > 0 and ${table.sessionCount} > 0 and ${table.linkedUserCount} >= 0 and ${table.groupCount} <= ${table.sourceEventCount} and ${table.sessionCount} <= ${table.sourceEventCount} and ${table.linkedUserCount} <= ${table.sessionCount}`,
    ),
  ],
);

export const legalDocuments = sqliteTable(
  "legal_documents",
  {
    id: text("id", { enum: ["privacy", "terms"] }).primaryKey(),
    title: text("title").notNull(),
    draftVersionId: text("draft_version_id").notNull(),
    approvedVersionId: text("approved_version_id"),
    publishedVersionId: text("published_version_id"),
    currentVersion: integer("current_version").notNull().default(1),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    publishedAt: text("published_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.draftVersionId, table.id],
      foreignColumns: [
        legalDocumentVersions.id,
        legalDocumentVersions.documentId,
      ],
      name: "legal_documents_draft_version_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.approvedVersionId, table.id],
      foreignColumns: [
        legalDocumentVersions.id,
        legalDocumentVersions.documentId,
      ],
      name: "legal_documents_approved_version_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.publishedVersionId, table.id],
      foreignColumns: [
        legalDocumentVersions.id,
        legalDocumentVersions.documentId,
      ],
      name: "legal_documents_published_version_fk",
    }).onDelete("restrict"),
    check("legal_documents_id_valid", sql`${table.id} in ('privacy', 'terms')`),
    check(
      "legal_documents_title_present",
      sql`length(trim(${table.title})) between 1 and 160`,
    ),
    check("legal_documents_version_positive", sql`${table.currentVersion} > 0`),
    check("legal_documents_revision_positive", sql`${table.revision} > 0`),
    check(
      "legal_documents_publication_consistent",
      sql`(${table.publishedVersionId} is null and ${table.publishedAt} is null) or (${table.publishedVersionId} is not null and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const legalDocumentVersions = sqliteTable(
  "legal_document_versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id", { enum: ["privacy", "terms"] })
      .notNull()
      .references((): AnySQLiteColumn => legalDocuments.id, {
        onDelete: "restrict",
      }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    introduction: text("introduction").notNull(),
    bodyText: text("body_text").notNull(),
    setupAnswersJson: text("setup_answers_json").notNull().default("{}"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: text("approved_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("legal_document_versions_document_number_unique").on(
      table.documentId,
      table.version,
    ),
    uniqueIndex("legal_document_versions_identity_document_unique").on(
      table.id,
      table.documentId,
    ),
    check("legal_document_versions_number_positive", sql`${table.version} > 0`),
    check(
      "legal_document_versions_content_present",
      sql`length(trim(${table.title})) between 1 and 160 and length(trim(${table.bodyText})) between 1 and 40000 and length(${table.introduction}) <= 4000`,
    ),
    check(
      "legal_document_versions_answers_json_valid",
      sql`json_valid(${table.setupAnswersJson}) and json_type(${table.setupAnswersJson}) = 'object'`,
    ),
    check(
      "legal_document_versions_approval_consistent",
      sql`(${table.approvedByUserId} is null and ${table.approvedAt} is null) or (${table.approvedByUserId} is not null and ${table.approvedAt} is not null)`,
    ),
  ],
);

export const operationalFailures = sqliteTable(
  "operational_failures",
  {
    id: text("id").primaryKey(),
    component: text("component", {
      enum: [
        "application",
        "database",
        "identity",
        "media",
        "migration",
        "job",
        "access",
      ],
    }).notNull(),
    code: text("code").notNull(),
    severity: text("severity", { enum: ["warning", "error"] }).notNull(),
    requestId: text("request_id"),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstOccurredAt: text("first_occurred_at").notNull(),
    lastOccurredAt: text("last_occurred_at").notNull(),
    resolvedAt: text("resolved_at"),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("operational_failures_recent_idx").on(
      table.resolvedAt,
      table.lastOccurredAt,
    ),
    index("operational_failures_component_code_idx").on(
      table.component,
      table.code,
    ),
    check(
      "operational_failures_component_valid",
      sql`${table.component} in ('application', 'database', 'identity', 'media', 'migration', 'job', 'access')`,
    ),
    check(
      "operational_failures_code_safe",
      sql`length(${table.code}) between 1 and 96 and ${table.code} = upper(${table.code}) and ${table.code} not glob '*[^A-Z0-9_]*'`,
    ),
    check(
      "operational_failures_severity_valid",
      sql`${table.severity} in ('warning', 'error')`,
    ),
    check(
      "operational_failures_subject_consistent",
      sql`(${table.subjectType} is null and ${table.subjectId} is null) or (${table.subjectType} is not null and ${table.subjectId} is not null)`,
    ),
    check(
      "operational_failures_count_positive",
      sql`${table.occurrenceCount} > 0`,
    ),
  ],
);

export const setupApplications = sqliteTable(
  "setup_applications",
  {
    id: text("id").primaryKey(),
    applicationKey: text("application_key").notNull(),
    proposalHash: text("proposal_hash").notNull(),
    proposalSchemaVersion: integer("proposal_schema_version").notNull(),
    sourceStateFingerprint: text("source_state_fingerprint").notNull(),
    approvalHash: text("approval_hash").notNull(),
    approvedByUserId: text("approved_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedAt: text("approved_at").notNull(),
    status: text("status", {
      enum: ["applying", "applied", "failed"],
    })
      .notNull()
      .default("applying"),
    resultStateFingerprint: text("result_state_fingerprint"),
    operationCount: integer("operation_count").notNull().default(0),
    mediaObjectCount: integer("media_object_count").notNull().default(0),
    mediaByteCount: integer("media_byte_count").notNull().default(0),
    resultJson: text("result_json").notNull().default("{}"),
    safeFailureCode: text("safe_failure_code"),
    lastOperationKey: text("last_operation_key"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("setup_applications_application_key_unique").on(
      table.applicationKey,
    ),
    uniqueIndex("setup_applications_operation_key_unique").on(
      table.lastOperationKey,
    ),
    index("setup_applications_status_recent_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "setup_applications_application_key_valid",
      sql`length(${table.applicationKey}) between 16 and 160 and ${table.applicationKey} not glob '*[^a-zA-Z0-9:_-]*'`,
    ),
    check(
      "setup_applications_proposal_hash_valid",
      sql`length(${table.proposalHash}) = 64 and ${table.proposalHash} = lower(${table.proposalHash}) and ${table.proposalHash} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "setup_applications_schema_version_positive",
      sql`${table.proposalSchemaVersion} > 0`,
    ),
    check(
      "setup_applications_source_fingerprint_valid",
      sql`length(${table.sourceStateFingerprint}) = 64 and ${table.sourceStateFingerprint} = lower(${table.sourceStateFingerprint}) and ${table.sourceStateFingerprint} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "setup_applications_approval_hash_valid",
      sql`length(${table.approvalHash}) = 64 and ${table.approvalHash} = lower(${table.approvalHash}) and ${table.approvalHash} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "setup_applications_status_valid",
      sql`${table.status} in ('applying', 'applied', 'failed')`,
    ),
    check(
      "setup_applications_result_fingerprint_valid",
      sql`${table.resultStateFingerprint} is null or (length(${table.resultStateFingerprint}) = 64 and ${table.resultStateFingerprint} = lower(${table.resultStateFingerprint}) and ${table.resultStateFingerprint} not glob '*[^0-9a-f]*')`,
    ),
    check(
      "setup_applications_counts_nonnegative",
      sql`${table.operationCount} >= 0 and ${table.mediaObjectCount} >= 0 and ${table.mediaByteCount} >= 0`,
    ),
    check(
      "setup_applications_result_json_valid",
      sql`json_valid(${table.resultJson}) and json_type(${table.resultJson}) = 'object'`,
    ),
    check(
      "setup_applications_failure_code_safe",
      sql`${table.safeFailureCode} is null or (length(${table.safeFailureCode}) between 1 and 96 and ${table.safeFailureCode} = upper(${table.safeFailureCode}) and ${table.safeFailureCode} not glob '*[^A-Z0-9_]*')`,
    ),
    check(
      "setup_applications_completion_consistent",
      sql`(${table.status} = 'applying' and ${table.completedAt} is null and ${table.resultStateFingerprint} is null and ${table.safeFailureCode} is null) or (${table.status} = 'applied' and ${table.completedAt} is not null and ${table.resultStateFingerprint} is not null and ${table.safeFailureCode} is null) or (${table.status} = 'failed' and ${table.completedAt} is not null and ${table.safeFailureCode} is not null)`,
    ),
  ],
);

export const setupState = sqliteTable(
  "setup_state",
  {
    id: text("id").primaryKey(),
    status: text("status", {
      enum: ["unconfigured", "applying", "applied", "attention_required"],
    })
      .notNull()
      .default("unconfigured"),
    proposalSchemaVersion: integer("proposal_schema_version"),
    lastProposalHash: text("last_proposal_hash"),
    lastApplicationId: text("last_application_id").references(
      () => setupApplications.id,
      { onDelete: "restrict" },
    ),
    stateFingerprint: text("state_fingerprint"),
    revision: integer("revision").notNull().default(1),
    lastOperationKey: text("last_operation_key"),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("setup_state_operation_key_unique").on(table.lastOperationKey),
    check("setup_state_singleton", sql`${table.id} = 'setup'`),
    check(
      "setup_state_status_valid",
      sql`${table.status} in ('unconfigured', 'applying', 'applied', 'attention_required')`,
    ),
    check(
      "setup_state_proposal_pair_consistent",
      sql`(${table.proposalSchemaVersion} is null and ${table.lastProposalHash} is null) or (${table.proposalSchemaVersion} is not null and ${table.proposalSchemaVersion} > 0 and length(${table.lastProposalHash}) = 64 and ${table.lastProposalHash} = lower(${table.lastProposalHash}) and ${table.lastProposalHash} not glob '*[^0-9a-f]*')`,
    ),
    check(
      "setup_state_fingerprint_valid",
      sql`${table.stateFingerprint} is null or (length(${table.stateFingerprint}) = 64 and ${table.stateFingerprint} = lower(${table.stateFingerprint}) and ${table.stateFingerprint} not glob '*[^0-9a-f]*')`,
    ),
    check(
      "setup_state_application_consistent",
      sql`${table.status} = 'unconfigured' or ${table.lastApplicationId} is not null`,
    ),
    check("setup_state_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const exportManifests = sqliteTable(
  "export_manifests",
  {
    id: text("id").primaryKey(),
    exportKey: text("export_key").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    sourceStateFingerprint: text("source_state_fingerprint").notNull(),
    manifestSha256: text("manifest_sha256"),
    fileCount: integer("file_count").notNull().default(0),
    mediaObjectCount: integer("media_object_count").notNull().default(0),
    byteCount: integer("byte_count").notNull().default(0),
    status: text("status", {
      enum: ["preparing", "ready", "verified", "failed"],
    })
      .notNull()
      .default("preparing"),
    containsCustomerData: integer("contains_customer_data", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    containsProviderPayload: integer("contains_provider_payload", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    archiveMediaObjectId: text("archive_media_object_id").references(
      () => mediaObjects.id,
      { onDelete: "set null" },
    ),
    safeFailureCode: text("safe_failure_code"),
    exportedByUserId: text("exported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    verifiedAt: text("verified_at"),
    lastOperationKey: text("last_operation_key"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("export_manifests_export_key_unique").on(table.exportKey),
    uniqueIndex("export_manifests_operation_key_unique").on(
      table.lastOperationKey,
    ),
    index("export_manifests_status_recent_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "export_manifests_export_key_valid",
      sql`length(${table.exportKey}) between 16 and 160 and ${table.exportKey} not glob '*[^a-zA-Z0-9:_-]*'`,
    ),
    check(
      "export_manifests_schema_version_positive",
      sql`${table.schemaVersion} > 0`,
    ),
    check(
      "export_manifests_source_fingerprint_valid",
      sql`length(${table.sourceStateFingerprint}) = 64 and ${table.sourceStateFingerprint} = lower(${table.sourceStateFingerprint}) and ${table.sourceStateFingerprint} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "export_manifests_hash_valid",
      sql`${table.manifestSha256} is null or (length(${table.manifestSha256}) = 64 and ${table.manifestSha256} = lower(${table.manifestSha256}) and ${table.manifestSha256} not glob '*[^0-9a-f]*')`,
    ),
    check(
      "export_manifests_counts_nonnegative",
      sql`${table.fileCount} >= 0 and ${table.mediaObjectCount} >= 0 and ${table.byteCount} >= 0`,
    ),
    check(
      "export_manifests_status_valid",
      sql`${table.status} in ('preparing', 'ready', 'verified', 'failed')`,
    ),
    check(
      "export_manifests_portable_only",
      sql`${table.containsCustomerData} = 0 and ${table.containsProviderPayload} = 0`,
    ),
    check(
      "export_manifests_failure_code_safe",
      sql`${table.safeFailureCode} is null or (length(${table.safeFailureCode}) between 1 and 96 and ${table.safeFailureCode} = upper(${table.safeFailureCode}) and ${table.safeFailureCode} not glob '*[^A-Z0-9_]*')`,
    ),
    check(
      "export_manifests_lifecycle_consistent",
      sql`(${table.status} = 'preparing' and ${table.manifestSha256} is null and ${table.verifiedAt} is null and ${table.safeFailureCode} is null) or (${table.status} = 'ready' and ${table.manifestSha256} is not null and ${table.verifiedAt} is null and ${table.safeFailureCode} is null) or (${table.status} = 'verified' and ${table.manifestSha256} is not null and ${table.verifiedAt} is not null and ${table.safeFailureCode} is null) or (${table.status} = 'failed' and ${table.verifiedAt} is null and ${table.safeFailureCode} is not null)`,
    ),
  ],
);

export type UserRecord = typeof users.$inferSelect;
export type ProfileRecord = typeof profiles.$inferSelect;
export type FavoriteRecord = typeof favorites.$inferSelect;
export type PlaylistRecord = typeof playlists.$inferSelect;
export type PlaylistTrackRecord = typeof playlistTracks.$inferSelect;
export type ListeningHistoryRecord = typeof listeningHistory.$inferSelect;
export type AccessPlanRecord = typeof accessPlans.$inferSelect;
export type AccessPlanItemRecord = typeof accessPlanItems.$inferSelect;
export type AccessGrantTemplateRecord =
  typeof accessGrantTemplates.$inferSelect;
export type CommerceBindingIntentRecord =
  typeof commerceBindingIntents.$inferSelect;
export type AccessGrantSetRecord = typeof accessGrantSets.$inferSelect;
export type AccessGrantRecord = typeof accessGrants.$inferSelect;
export type EntitlementRecord = typeof entitlements.$inferSelect;
export type DownloadEventRecord = typeof downloadEvents.$inferSelect;
export type MembershipPlanRecord = typeof membershipPlans.$inferSelect;
export type MembershipPlanRevisionRecord =
  typeof membershipPlanRevisions.$inferSelect;
export type SubscriptionPlanRecord = typeof subscriptionPlans.$inferSelect;
export type MembershipCreditRuleRecord =
  typeof membershipCreditRules.$inferSelect;
export type CommerceProductRecord = typeof commerceProducts.$inferSelect;
export type CommercePriceRecord = typeof commercePrices.$inferSelect;
export type CheckoutSessionRecord = typeof checkoutSessions.$inferSelect;
export type CommerceEventRecord = typeof commerceEvents.$inferSelect;
export type OrderRecord = typeof orders.$inferSelect;
export type OrderItemRecord = typeof orderItems.$inferSelect;
export type FulfillmentEventRecord = typeof fulfillmentEvents.$inferSelect;
export type MembershipRecord = typeof memberships.$inferSelect;
export type SubscriptionRecord = typeof subscriptions.$inferSelect;
export type SubscriptionEventRecord = typeof subscriptionEvents.$inferSelect;
export type CreditAccountRecord = typeof creditAccounts.$inferSelect;
export type CreditGrantLotRecord = typeof creditGrantLots.$inferSelect;
export type CreditReservationRecord = typeof creditReservations.$inferSelect;
export type CreditReservationAllocationRecord =
  typeof creditReservationAllocations.$inferSelect;
export type CreditLedgerEntryRecord = typeof creditLedgerEntries.$inferSelect;
export type LicenseTermsRecord = typeof licenseTerms.$inferSelect;
export type LicenseTermsVersionRecord =
  typeof licenseTermsVersions.$inferSelect;
export type LicenseOptionRecord = typeof licenseOptions.$inferSelect;
export type LicenseOfferRecord = typeof licenseOffers.$inferSelect;
export type LicenseRequestRecord = typeof licenseRequests.$inferSelect;
export type IssuedLicenseRecord = typeof issuedLicenses.$inferSelect;
export type LicenseDocumentRecord = typeof licenseDocuments.$inferSelect;
export type LicenseDocumentJobRecord = typeof licenseDocumentJobs.$inferSelect;
export type LicenseEventRecord = typeof licenseEvents.$inferSelect;
export type CourseRecord = typeof courses.$inferSelect;
export type CourseRevisionRecord = typeof courseRevisions.$inferSelect;
export type CourseSectionRecord = typeof courseSections.$inferSelect;
export type LessonRecord = typeof lessons.$inferSelect;
export type LessonItemRecord = typeof lessonItems.$inferSelect;
export type CourseProgressRecord = typeof courseProgress.$inferSelect;
export type VideoRecord = typeof videos.$inferSelect;
export type VideoRevisionRecord = typeof videoRevisions.$inferSelect;
export type VideoTranscriptRecord = typeof videoTranscripts.$inferSelect;
export type EditorialPostRecord = typeof editorialPosts.$inferSelect;
export type UpdateRecord = typeof updates.$inferSelect;
export type UpdateReadRecord = typeof updateReads.$inferSelect;
export type ContactFormRecord = typeof contactForms.$inferSelect;
export type ContactConsentVersionRecord =
  typeof contactConsentVersions.$inferSelect;
export type ContactSubmissionRecord = typeof contactSubmissions.$inferSelect;
export type ContactNoteRecord = typeof contactNotes.$inferSelect;
export type TelemetrySettingsRecord = typeof telemetrySettings.$inferSelect;
export type TelemetryEventRecord = typeof telemetryEvents.$inferSelect;
export type TelemetryDailyAggregateRecord =
  typeof telemetryDailyAggregates.$inferSelect;
export type TelemetryAggregateDayRecord =
  typeof telemetryAggregateDays.$inferSelect;
export type LegalDocumentRecord = typeof legalDocuments.$inferSelect;
export type LegalDocumentVersionRecord =
  typeof legalDocumentVersions.$inferSelect;
export type OperationalFailureRecord = typeof operationalFailures.$inferSelect;
export type SetupApplicationRecord = typeof setupApplications.$inferSelect;
export type SetupStateRecord = typeof setupState.$inferSelect;
export type ExportManifestRecord = typeof exportManifests.$inferSelect;
export type RoleRecord = typeof roles.$inferSelect;
export type RoleAssignmentRecord = typeof roleAssignments.$inferSelect;
export type MediaObjectRecord = typeof mediaObjects.$inferSelect;
export type AuditEventRecord = typeof auditEvents.$inferSelect;
export type InstallationStateRecord = typeof installationState.$inferSelect;
export type ArtistConfigRecord = typeof artistConfig.$inferSelect;
export type ArtistConfigRevisionRecord =
  typeof artistConfigRevisions.$inferSelect;
export type ArtistModuleRecord = typeof artistModules.$inferSelect;
export type ModuleRegistryStateRecord = typeof moduleRegistryState.$inferSelect;
export type ArtistDomainRecord = typeof artistDomains.$inferSelect;
export type NavigationSetRecord = typeof navigationSets.$inferSelect;
export type NavigationItemRecord = typeof navigationItems.$inferSelect;
export type PageRecord = typeof pages.$inferSelect;
export type PageRevisionRecord = typeof pageRevisions.$inferSelect;
export type ContentSectionRecord = typeof contentSections.$inferSelect;
export type ContentSectionRevisionRecord =
  typeof contentSectionRevisions.$inferSelect;
export type PageRevisionSectionRecord =
  typeof pageRevisionSections.$inferSelect;
export type EditorPermissionRecord = typeof editorPermissions.$inferSelect;
export type MediaDerivativeRecord = typeof mediaDerivatives.$inferSelect;
export type MediaJobRecord = typeof mediaJobs.$inferSelect;
export type MediaJobAttemptRecord = typeof mediaJobAttempts.$inferSelect;
export type TrackRecord = typeof tracks.$inferSelect;
export type TrackRevisionRecord = typeof trackRevisions.$inferSelect;
export type ReleaseRecord = typeof releases.$inferSelect;
export type ReleaseRevisionRecord = typeof releaseRevisions.$inferSelect;
export type ReleaseTrackRecord = typeof releaseTracks.$inferSelect;
export type CollectionRecord = typeof collections.$inferSelect;
export type CollectionRevisionRecord = typeof collectionRevisions.$inferSelect;
export type CollectionTrackRecord = typeof collectionTracks.$inferSelect;
export type CreditRecord = typeof credits.$inferSelect;
