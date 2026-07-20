import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { register } from "node:module";
import { DatabaseSync } from "node:sqlite";

import {
  canonicalJson,
  createSemanticFingerprint,
  normalizeArtistInstallationSnapshot,
} from "./canonical.ts";
import { PORTABILITY_ERROR_CODES, PortabilityError } from "./errors.ts";
import { PORTABLE_DOCUMENT_NAMES } from "./types.ts";
import { validateArtistInstallationSnapshot } from "./validation.ts";

const migrationsDirectory = new URL("../../drizzle/", import.meta.url);
const RESTORE_AUTHORITY_ID = "portable_restore_authority";
const RESTORE_AUTHORITY_EMAIL = "portable-restore-authority@example.invalid";
const PENDING_OPERATION_PREFIX = "portability:pending-binding:";

const DEFINITION_TABLES = Object.freeze([
  "artist_config",
  "artist_config_revisions",
  "artist_modules",
  "navigation_sets",
  "navigation_items",
  "pages",
  "page_revisions",
  "content_sections",
  "content_section_revisions",
  "page_revision_sections",
  "media_objects",
  "media_derivatives",
  "tracks",
  "track_revisions",
  "releases",
  "release_revisions",
  "release_tracks",
  "collections",
  "collection_revisions",
  "collection_tracks",
  "credits",
  "access_plans",
  "access_plan_items",
  "access_grant_templates",
  "membership_plans",
  "membership_plan_revisions",
  "subscription_plans",
  "membership_credit_rules",
  "commerce_products",
  "commerce_prices",
  "commerce_binding_intents",
  "license_terms",
  "license_terms_versions",
  "license_options",
  "license_offers",
  "courses",
  "course_revisions",
  "course_sections",
  "lessons",
  "lesson_items",
  "videos",
  "video_revisions",
  "video_transcripts",
  "editorial_posts",
  "updates",
  "contact_forms",
  "contact_consent_versions",
  "telemetry_settings",
  "legal_documents",
  "legal_document_versions",
]);

const MATERIALIZATION_ENTITY_ORDER = Object.freeze([
  "artist-config",
  "module",
  "navigation-set",
  "navigation-item",
  "media-object",
  "media-derivative",
  "content-section",
  "content-section-revision",
  "page",
  "page-revision",
  "page-section-placement",
  "track",
  "track-revision",
  "release",
  "release-revision",
  "release-track",
  "collection",
  "collection-revision",
  "collection-track",
  "credit",
  "access-plan",
  "access-plan-item",
  "access-grant-template",
  "membership-plan",
  "membership-plan-revision",
  "subscription-plan",
  "membership-credit-rule",
  "commerce-product",
  "commerce-price-definition",
  "license-terms",
  "license-terms-version",
  "license-option",
  "license-offer",
  "commerce-binding-intent",
  "course",
  "course-revision",
  "course-section",
  "lesson",
  "lesson-item",
  "video",
  "video-revision",
  "video-transcript",
  "editorial-post",
  "update",
  "contact-form",
  "contact-consent-version",
  "telemetry-settings",
  "legal-document",
  "legal-document-version",
]);

let projectorPromise;

function restoreError(message, location) {
  return new PortabilityError(
    PORTABILITY_ERROR_CODES.RESTORE_CONFLICT,
    message,
    location,
  );
}

function deterministicDigest(namespace, value) {
  return createHash("sha256")
    .update(`${namespace}\u0000${value}`)
    .digest("hex");
}

function deterministicArtistRevisionId(record) {
  return `portable_restore_artist_revision:${deterministicDigest(
    "artist-config-revision",
    `${record.id}:${requiredField(record, "revision")}`,
  ).slice(0, 40)}`;
}

function pendingMediaObjectKey(record) {
  return `originals/portable-restore/${deterministicDigest(
    "media-object",
    record.id,
  )}`;
}

function pendingMediaDerivativeKey(record) {
  return `derivatives/portable-restore/${deterministicDigest(
    "media-derivative",
    record.id,
  )}`;
}

function pendingStripePriceId(record) {
  return `price_portable_pending_${deterministicDigest(
    "commerce-price",
    record.id,
  ).slice(0, 32)}`;
}

function pendingExternalVideoUrl(record) {
  return `https://invalid.example/portable-binding-pending/${deterministicDigest(
    "external-video",
    record.id,
  )}`;
}

function requiredField(record, name) {
  const match = record.fields.find((field) => field.name === name);
  if (!match) {
    throw restoreError(
      `The portable ${record.entity} contract is missing the ${name} field required to reconstruct the application D1 row.`,
      `$.restore.${record.entity}:${record.id}.fields.${name}`,
    );
  }
  return match.value;
}

function fieldOrNull(record, name) {
  return record.fields.find((field) => field.name === name)?.value ?? null;
}

function optionalRelation(record, name) {
  return record.relations.find((relation) => relation.name === name) ?? null;
}

function requiredRelation(record, name) {
  const match = optionalRelation(record, name);
  if (!match) {
    throw restoreError(
      `The portable ${record.entity} contract is missing the ${name} relation required to reconstruct the application D1 row.`,
      `$.restore.${record.entity}:${record.id}.relations.${name}`,
    );
  }
  return match;
}

function integerBoolean(value) {
  return value ? 1 : 0;
}

function jsonStringList(value) {
  return JSON.stringify(value);
}

function structuredText(record) {
  const value = requiredField(record, "bodyText");
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw restoreError(
      `The portable ${record.entity} bodyText field must contain the canonical structured-text array emitted by the D1 portability exporter.`,
      `$.restore.${record.entity}:${record.id}.fields.bodyText`,
    );
  }
  if (!Array.isArray(parsed) || canonicalJson(parsed) !== value) {
    throw restoreError(
      `The portable ${record.entity} bodyText field must contain the canonical structured-text array emitted by the D1 portability exporter.`,
      `$.restore.${record.entity}:${record.id}.fields.bodyText`,
    );
  }
  return value;
}

function indexSnapshot(snapshot) {
  const records = [];
  const byKey = new Map();
  for (const document of PORTABLE_DOCUMENT_NAMES) {
    for (const record of snapshot[document]) {
      records.push(record);
      byKey.set(`${record.entity}\u0000${record.id}`, record);
    }
  }
  return Object.freeze({ records, byKey });
}

function targetRecord(context, relation) {
  const target = context.byKey.get(
    `${relation.targetEntity}\u0000${relation.targetId}`,
  );
  if (!target) {
    throw restoreError(
      "The portable relation target is missing from the restore snapshot.",
      `$.restore.relations.${relation.name}`,
    );
  }
  return target;
}

function relationRevision(context, relation, fieldName = "revision") {
  return requiredField(targetRecord(context, relation), fieldName);
}

function parentRelation(context, relation, parentName) {
  return requiredRelation(targetRecord(context, relation), parentName);
}

function assertIdentity(record, expected, label) {
  if (record.id !== expected) {
    throw restoreError(
      `The portable ${record.entity} id must equal its ${label} because the application D1 schema stores them as one identity.`,
      `$.restore.${record.entity}:${record.id}.id`,
    );
  }
}

function insertRow(database, table, values) {
  const columns = Object.keys(values);
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const parameters = columns.map(() => "?").join(", ");
  database
    .prepare(`INSERT INTO "${table}" (${quotedColumns}) VALUES (${parameters})`)
    .run(...columns.map((column) => values[column]));
}

function publicationRow(record, table, revisionColumn = "version") {
  return {
    table,
    values: {
      id: record.id,
      slug: requiredField(record, "slug"),
      draft_revision_id: requiredRelation(record, "draftRevision").targetId,
      published_revision_id:
        optionalRelation(record, "publishedRevision")?.targetId ?? null,
      publication_state: requiredField(record, "publicationState"),
      [revisionColumn]: requiredField(record, "revision"),
      published_at: requiredField(record, "publishedAt"),
    },
  };
}

function commerceProductRows(record, context) {
  if (optionalRelation(record, "licenseOption")) {
    throw restoreError(
      "The portable commerce-product contract cannot restore licenseOption because the current application D1 commerce_products table has no license_option_id field.",
      `$.restore.commerce-product:${record.id}.relations.licenseOption`,
    );
  }

  const productType = requiredField(record, "productType");
  const resource = optionalRelation(record, "resource");
  const accessPlan = optionalRelation(record, "accessPlan");
  const membershipPlan = optionalRelation(record, "membershipPlan");
  const membershipRevision = optionalRelation(record, "membershipPlanRevision");
  const subscriptionPlan = optionalRelation(record, "subscriptionPlan");

  return [
    {
      table: "commerce_products",
      values: {
        id: record.id,
        slug: requiredField(record, "slug"),
        name: requiredField(record, "name"),
        description: requiredField(record, "description"),
        product_type: productType,
        resource_type: resource?.targetEntity ?? null,
        resource_id: resource?.targetId ?? null,
        access_plan_id: accessPlan?.targetId ?? null,
        access_plan_revision: accessPlan
          ? relationRevision(context, accessPlan)
          : null,
        membership_plan_id: membershipPlan?.targetId ?? null,
        membership_plan_revision_id: membershipRevision?.targetId ?? null,
        membership_plan_revision: membershipRevision
          ? relationRevision(context, membershipRevision)
          : null,
        subscription_plan_id: subscriptionPlan?.targetId ?? null,
        credit_kind: requiredField(record, "creditKind"),
        credit_quantity: requiredField(record, "creditQuantity"),
        state: requiredField(record, "state"),
        revision: requiredField(record, "revision"),
      },
    },
  ];
}

function materializationRows(record, context) {
  switch (record.entity) {
    case "artist-config": {
      const revisionId = deterministicArtistRevisionId(record);
      return [
        {
          table: "artist_config",
          values: {
            id: record.id,
            draft_revision_id: revisionId,
            published_revision_id: null,
            version: requiredField(record, "revision"),
          },
        },
        {
          table: "artist_config_revisions",
          values: {
            id: revisionId,
            artist_config_id: record.id,
            revision: requiredField(record, "revision"),
            display_name: requiredField(record, "displayName"),
            site_title: requiredField(record, "siteTitle"),
            headline: requiredField(record, "headline"),
            introduction: requiredField(record, "introduction"),
            footer_text: requiredField(record, "footerText"),
          },
        },
      ];
    }
    case "module": {
      const key = requiredField(record, "key");
      assertIdentity(record, key, "module key");
      return [
        {
          table: "artist_modules",
          values: {
            module_key: key,
            active: integerBoolean(requiredField(record, "active")),
            revision: requiredField(record, "revision"),
            settings_json: "{}",
          },
        },
      ];
    }
    case "navigation-set": {
      const key = requiredField(record, "key");
      assertIdentity(record, key, "navigation key");
      const versions = context.records
        .filter(
          (candidate) =>
            candidate.entity === "navigation-item" &&
            optionalRelation(candidate, "navigationSet")?.targetId ===
              record.id,
        )
        .map((candidate) => requiredField(candidate, "version"));
      const publishedVersion = requiredField(record, "publishedVersion");
      const draftVersion = Math.max(1, publishedVersion ?? 1, ...versions);
      return [
        {
          table: "navigation_sets",
          values: {
            id: record.id,
            label: requiredField(record, "label"),
            draft_version: draftVersion,
            published_version: publishedVersion,
            revision: requiredField(record, "revision"),
          },
        },
      ];
    }
    case "navigation-item":
      return [
        {
          table: "navigation_items",
          values: {
            id: record.id,
            navigation_set_id: requiredRelation(record, "navigationSet")
              .targetId,
            version: requiredField(record, "version"),
            item_key: requiredField(record, "key"),
            label: requiredField(record, "label"),
            href: requiredField(record, "href"),
            position: requiredField(record, "position"),
            module_key: requiredField(record, "moduleKey"),
            external: integerBoolean(requiredField(record, "external")),
          },
        },
      ];
    case "media-object":
      return [
        {
          table: "media_objects",
          values: {
            id: record.id,
            object_key: pendingMediaObjectKey(record),
            kind: requiredField(record, "kind"),
            visibility: requiredField(record, "visibility"),
            owner_user_id: null,
            content_type: requiredField(record, "contentType"),
            byte_length: requiredField(record, "byteLength"),
            etag: null,
            source_version: requiredField(record, "sourceVersion"),
            status: requiredField(record, "status"),
            approval_state: requiredField(record, "approvalState"),
            content_sha256: requiredField(record, "contentSha256"),
            duration_ms: requiredField(record, "durationMs"),
            channels: requiredField(record, "channels"),
            sample_rate: requiredField(record, "sampleRate"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    case "media-derivative": {
      const status = requiredField(record, "status");
      const contentType = requiredField(record, "contentType");
      const byteLength = requiredField(record, "byteLength");
      if (status === "ready" && (contentType === null || byteLength === null)) {
        throw restoreError(
          "The portable media-derivative contract needs non-null contentType and byteLength fields to restore a ready application D1 row.",
          `$.restore.media-derivative:${record.id}.fields`,
        );
      }
      return [
        {
          table: "media_derivatives",
          values: {
            id: record.id,
            source_media_id: requiredRelation(record, "sourceMedia").targetId,
            kind: requiredField(record, "kind"),
            processing_profile: requiredField(record, "processingProfile"),
            processing_version: requiredField(record, "processingVersion"),
            object_key:
              status === "ready" ? pendingMediaDerivativeKey(record) : null,
            status,
            approval_state: requiredField(record, "approvalState"),
            content_type: contentType,
            format: requiredField(record, "format"),
            bitrate_kbps: requiredField(record, "bitrateKbps"),
            duration_ms: requiredField(record, "durationMs"),
            channels: requiredField(record, "channels"),
            sample_rate: requiredField(record, "sampleRate"),
            byte_length: byteLength,
            content_sha256: requiredField(record, "contentSha256"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    }
    case "content-section":
      return [
        {
          table: "content_sections",
          values: {
            id: record.id,
            section_key: requiredField(record, "key"),
            draft_revision_id: requiredRelation(record, "draftRevision")
              .targetId,
            published_revision_id:
              optionalRelation(record, "publishedRevision")?.targetId ?? null,
            publication_state: requiredField(record, "publicationState"),
            version: requiredField(record, "revision"),
            published_at: requiredField(record, "publishedAt"),
          },
        },
      ];
    case "content-section-revision":
      return [
        {
          table: "content_section_revisions",
          values: {
            id: record.id,
            content_section_id: requiredRelation(record, "contentSection")
              .targetId,
            revision: requiredField(record, "revision"),
            kind: requiredField(record, "kind"),
            heading: requiredField(record, "heading"),
            body_text: requiredField(record, "bodyText"),
          },
        },
      ];
    case "page": {
      const row = publicationRow(record, "pages");
      row.values.module_key = requiredField(record, "moduleKey");
      row.values.kind = requiredField(record, "kind");
      return [row];
    }
    case "page-revision":
      return [
        {
          table: "page_revisions",
          values: {
            id: record.id,
            page_id: requiredRelation(record, "page").targetId,
            revision: requiredField(record, "revision"),
            module_key: requiredField(record, "moduleKey"),
            kind: requiredField(record, "kind"),
            title: requiredField(record, "title"),
            introduction: requiredField(record, "introduction"),
            body_text: requiredField(record, "bodyText"),
          },
        },
      ];
    case "page-section-placement": {
      const sectionRevision = requiredRelation(
        record,
        "contentSectionRevision",
      );
      return [
        {
          table: "page_revision_sections",
          values: {
            id: record.id,
            page_revision_id: requiredRelation(record, "pageRevision").targetId,
            position: requiredField(record, "position"),
            content_section_id: parentRelation(
              context,
              sectionRevision,
              "contentSection",
            ).targetId,
            content_section_revision_id: sectionRevision.targetId,
          },
        },
      ];
    }
    case "track":
      return [publicationRow(record, "tracks")];
    case "track-revision":
      return [
        {
          table: "track_revisions",
          values: {
            id: record.id,
            track_id: requiredRelation(record, "track").targetId,
            revision: requiredField(record, "revision"),
            title: requiredField(record, "title"),
            subtitle: requiredField(record, "subtitle"),
            description: requiredField(record, "description"),
            duration_ms: requiredField(record, "durationMs"),
            meter: fieldOrNull(record, "meter"),
            tempo_bpm: fieldOrNull(record, "tempoBpm"),
            musical_key: fieldOrNull(record, "musicalKey"),
            isrc: requiredField(record, "isrc"),
            copyright_notice: requiredField(record, "copyrightNotice"),
            explicit: integerBoolean(requiredField(record, "explicit")),
            view_mode: requiredField(record, "viewMode"),
            stream_mode: requiredField(record, "streamMode"),
            download_mode: requiredField(record, "downloadMode"),
            original_media_id:
              optionalRelation(record, "originalMedia")?.targetId ?? null,
            streaming_derivative_id:
              optionalRelation(record, "streamingDerivative")?.targetId ?? null,
            download_derivative_id:
              optionalRelation(record, "downloadDerivative")?.targetId ?? null,
            tags_json: jsonStringList(requiredField(record, "tags")),
          },
        },
      ];
    case "release":
      return [publicationRow(record, "releases")];
    case "release-revision":
      return [
        {
          table: "release_revisions",
          values: {
            id: record.id,
            release_id: requiredRelation(record, "release").targetId,
            revision: requiredField(record, "revision"),
            release_type: requiredField(record, "releaseType"),
            title: requiredField(record, "title"),
            subtitle: requiredField(record, "subtitle"),
            description: requiredField(record, "description"),
            release_date: requiredField(record, "releaseDate"),
            catalog_number: requiredField(record, "catalogNumber"),
            copyright_notice: requiredField(record, "copyrightNotice"),
            view_mode: requiredField(record, "viewMode"),
            artwork_derivative_id:
              optionalRelation(record, "artworkDerivative")?.targetId ?? null,
            tags_json: jsonStringList(requiredField(record, "tags")),
          },
        },
      ];
    case "release-track":
      return [
        {
          table: "release_tracks",
          values: {
            id: record.id,
            release_revision_id: requiredRelation(record, "releaseRevision")
              .targetId,
            track_id: requiredRelation(record, "track").targetId,
            track_revision_id: requiredRelation(record, "trackRevision")
              .targetId,
            position: requiredField(record, "position"),
            disc_number: requiredField(record, "discNumber"),
            track_number: requiredField(record, "trackNumber"),
          },
        },
      ];
    case "collection":
      return [publicationRow(record, "collections")];
    case "collection-revision":
      return [
        {
          table: "collection_revisions",
          values: {
            id: record.id,
            collection_id: requiredRelation(record, "collection").targetId,
            revision: requiredField(record, "revision"),
            title: requiredField(record, "title"),
            description: requiredField(record, "description"),
            view_mode: requiredField(record, "viewMode"),
            artwork_derivative_id:
              optionalRelation(record, "artworkDerivative")?.targetId ?? null,
            tags_json: jsonStringList(requiredField(record, "tags")),
          },
        },
      ];
    case "collection-track":
      return [
        {
          table: "collection_tracks",
          values: {
            id: record.id,
            collection_revision_id: requiredRelation(
              record,
              "collectionRevision",
            ).targetId,
            track_id: requiredRelation(record, "track").targetId,
            track_revision_id: requiredRelation(record, "trackRevision")
              .targetId,
            position: requiredField(record, "position"),
          },
        },
      ];
    case "credit": {
      const subject = requiredRelation(record, "subject");
      return [
        {
          table: "credits",
          values: {
            id: record.id,
            release_revision_id:
              subject.targetEntity === "release-revision"
                ? subject.targetId
                : null,
            track_revision_id:
              subject.targetEntity === "track-revision"
                ? subject.targetId
                : null,
            collection_revision_id:
              subject.targetEntity === "collection-revision"
                ? subject.targetId
                : null,
            name: requiredField(record, "name"),
            role: requiredField(record, "role"),
            details: requiredField(record, "details"),
            position: requiredField(record, "position"),
          },
        },
      ];
    }
    case "access-plan":
      return [
        {
          table: "access_plans",
          values: {
            id: record.id,
            slug: requiredField(record, "slug"),
            name: requiredField(record, "name"),
            description: requiredField(record, "description"),
            state: requiredField(record, "state"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    case "access-plan-item": {
      const resource = requiredRelation(record, "resource");
      return [
        {
          table: "access_plan_items",
          values: {
            id: record.id,
            access_plan_id: requiredRelation(record, "accessPlan").targetId,
            position: requiredField(record, "position"),
            resource_type: resource.targetEntity,
            resource_id: resource.targetId,
            actions_json: jsonStringList(requiredField(record, "actions")),
            remaining_uses: requiredField(record, "remainingUses"),
            download_disposition: requiredField(record, "downloadDisposition"),
          },
        },
      ];
    }
    case "access-grant-template":
      return [
        {
          table: "access_grant_templates",
          values: {
            id: record.id,
            template_key: requiredField(record, "key"),
            label: requiredField(record, "label"),
            access_plan_id: requiredRelation(record, "accessPlan").targetId,
            access_plan_revision: requiredField(record, "accessPlanRevision"),
            default_duration_days: requiredField(record, "defaultDurationDays"),
            state: requiredField(record, "state"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    case "membership-plan":
      return [
        {
          table: "membership_plans",
          values: {
            id: record.id,
            slug: requiredField(record, "slug"),
            state: requiredField(record, "state"),
            current_revision: requiredField(record, "currentRevision"),
          },
        },
      ];
    case "membership-plan-revision": {
      const accessPlan = optionalRelation(record, "accessPlan");
      return [
        {
          table: "membership_plan_revisions",
          values: {
            id: record.id,
            membership_plan_id: requiredRelation(record, "membershipPlan")
              .targetId,
            revision: requiredField(record, "revision"),
            name: requiredField(record, "name"),
            description: requiredField(record, "description"),
            benefits_json: jsonStringList(requiredField(record, "benefits")),
            access_plan_id: accessPlan?.targetId ?? null,
            access_plan_revision: accessPlan
              ? relationRevision(context, accessPlan)
              : null,
            download_credits: requiredField(record, "downloadCredits"),
            license_credits: requiredField(record, "licenseCredits"),
            duration_days: requiredField(record, "durationDays"),
          },
        },
      ];
    }
    case "subscription-plan": {
      const membershipRevision = requiredRelation(
        record,
        "membershipPlanRevision",
      );
      return [
        {
          table: "subscription_plans",
          values: {
            id: record.id,
            slug: requiredField(record, "slug"),
            name: requiredField(record, "name"),
            description: requiredField(record, "description"),
            membership_plan_id: requiredRelation(record, "membershipPlan")
              .targetId,
            membership_plan_revision_id: membershipRevision.targetId,
            membership_plan_revision: relationRevision(
              context,
              membershipRevision,
            ),
            billing_interval: requiredField(record, "billingInterval"),
            interval_count: requiredField(record, "intervalCount"),
            state: requiredField(record, "state"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    }
    case "membership-credit-rule": {
      const membershipPlan = optionalRelation(record, "membershipPlan");
      const membershipRevision = optionalRelation(
        record,
        "membershipPlanRevision",
      );
      const subscriptionPlan = optionalRelation(record, "subscriptionPlan");
      return [
        {
          table: "membership_credit_rules",
          values: {
            id: record.id,
            rule_key: requiredField(record, "key"),
            credit_kind: requiredField(record, "creditKind"),
            membership_plan_id: membershipPlan?.targetId ?? null,
            membership_plan_revision_id: membershipRevision?.targetId ?? null,
            membership_plan_revision: membershipRevision
              ? relationRevision(context, membershipRevision)
              : null,
            subscription_plan_id: subscriptionPlan?.targetId ?? null,
            subscription_plan_revision: subscriptionPlan
              ? relationRevision(context, subscriptionPlan)
              : null,
            amount: requiredField(record, "amount"),
            cadence: requiredField(record, "cadence"),
            state: requiredField(record, "state"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    }
    case "commerce-product":
      return commerceProductRows(record, context);
    case "commerce-price-definition":
      return [
        {
          table: "commerce_prices",
          values: {
            id: record.id,
            commerce_product_id: requiredRelation(record, "commerceProduct")
              .targetId,
            amount_minor: requiredField(record, "amountMinor"),
            currency: requiredField(record, "currency"),
            billing_interval: requiredField(record, "billingInterval"),
            interval_count: requiredField(record, "intervalCount"),
            stripe_price_id: pendingStripePriceId(record),
            active: integerBoolean(requiredField(record, "active")),
            stripe_environment: "test",
            livemode: 0,
            revision: requiredField(record, "revision"),
            last_operation_key: `${PENDING_OPERATION_PREFIX}${deterministicDigest(
              "commerce-price-operation",
              record.id,
            ).slice(0, 40)}`,
          },
        },
      ];
    case "license-terms":
      return [
        {
          table: "license_terms",
          values: {
            id: record.id,
            slug: requiredField(record, "slug"),
            state: requiredField(record, "state"),
            current_version: requiredField(record, "currentVersion"),
          },
        },
      ];
    case "license-terms-version":
      return [
        {
          table: "license_terms_versions",
          values: {
            id: record.id,
            license_terms_id: requiredRelation(record, "licenseTerms").targetId,
            version: requiredField(record, "version"),
            name: requiredField(record, "name"),
            title: requiredField(record, "title"),
            introduction: requiredField(record, "introduction"),
            general_terms: requiredField(record, "generalTerms"),
            disclaimer: requiredField(record, "disclaimer"),
          },
        },
      ];
    case "license-option": {
      const termsVersion = requiredRelation(record, "licenseTermsVersion");
      return [
        {
          table: "license_options",
          values: {
            id: record.id,
            license_terms_id: parentRelation(
              context,
              termsVersion,
              "licenseTerms",
            ).targetId,
            license_terms_version_id: termsVersion.targetId,
            license_terms_version: relationRevision(
              context,
              termsVersion,
              "version",
            ),
            option_key: requiredField(record, "optionKey"),
            label: requiredField(record, "label"),
            description: requiredField(record, "description"),
            usage_category: requiredField(record, "usageCategory"),
            allowed_media_json: jsonStringList(
              requiredField(record, "allowedMedia"),
            ),
            audience_label: requiredField(record, "audienceLabel"),
            max_audience: requiredField(record, "maxAudience"),
            distribution_label: requiredField(record, "distributionLabel"),
            max_copies: requiredField(record, "maxCopies"),
            term_months: requiredField(record, "termMonths"),
            territory: requiredField(record, "territory"),
            attribution_required: integerBoolean(
              requiredField(record, "attributionRequired"),
            ),
            attribution_text: requiredField(record, "attributionText"),
            exclusive: integerBoolean(requiredField(record, "exclusive")),
            requires_approval: integerBoolean(
              requiredField(record, "requiresApproval"),
            ),
            license_credit_cost: requiredField(record, "licenseCreditCost"),
            includes_track_download: integerBoolean(
              requiredField(record, "includesTrackDownload"),
            ),
            position: requiredField(record, "position"),
          },
        },
      ];
    }
    case "license-offer": {
      const termsVersion = requiredRelation(record, "licenseTermsVersion");
      return [
        {
          table: "license_offers",
          values: {
            id: record.id,
            slug: requiredField(record, "slug"),
            track_id: requiredRelation(record, "track").targetId,
            track_revision_id: requiredRelation(record, "trackRevision")
              .targetId,
            license_terms_id: parentRelation(
              context,
              termsVersion,
              "licenseTerms",
            ).targetId,
            license_terms_version_id: termsVersion.targetId,
            license_terms_version: relationRevision(
              context,
              termsVersion,
              "version",
            ),
            license_option_id: requiredRelation(record, "licenseOption")
              .targetId,
            commerce_product_id: requiredRelation(record, "commerceProduct")
              .targetId,
            commerce_price_id: requiredRelation(record, "priceDefinition")
              .targetId,
            state: requiredField(record, "state"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    }
    case "commerce-binding-intent": {
      const membershipPlan = optionalRelation(record, "membershipPlan");
      const membershipRevision = optionalRelation(
        record,
        "membershipPlanRevision",
      );
      const subscriptionPlan = optionalRelation(record, "subscriptionPlan");
      const track = optionalRelation(record, "track");
      const trackRevision = optionalRelation(record, "trackRevision");
      const termsVersion = optionalRelation(record, "licenseTermsVersion");
      const licenseOption = optionalRelation(record, "licenseOption");
      return [
        {
          table: "commerce_binding_intents",
          values: {
            id: record.id,
            intent_key: requiredField(record, "key"),
            intent_kind: requiredField(record, "intentKind"),
            name: requiredField(record, "name"),
            description: requiredField(record, "description"),
            membership_plan_id: membershipPlan?.targetId ?? null,
            membership_plan_revision_id: membershipRevision?.targetId ?? null,
            membership_plan_revision: membershipRevision
              ? relationRevision(context, membershipRevision)
              : null,
            subscription_plan_id: subscriptionPlan?.targetId ?? null,
            subscription_plan_revision: subscriptionPlan
              ? relationRevision(context, subscriptionPlan)
              : null,
            track_id: track?.targetId ?? null,
            track_revision_id: trackRevision?.targetId ?? null,
            track_revision: trackRevision
              ? relationRevision(context, trackRevision)
              : null,
            license_terms_id: termsVersion
              ? parentRelation(context, termsVersion, "licenseTerms").targetId
              : null,
            license_terms_version_id: termsVersion?.targetId ?? null,
            license_terms_version: termsVersion
              ? relationRevision(context, termsVersion, "version")
              : null,
            license_option_id: licenseOption?.targetId ?? null,
            amount_minor: requiredField(record, "amountMinor"),
            currency: requiredField(record, "currency"),
            billing_interval: requiredField(record, "billingInterval"),
            interval_count: requiredField(record, "intervalCount"),
            binding_state: "pending",
            commerce_product_id: null,
            commerce_price_id: null,
            stripe_environment: "test",
            livemode: 0,
            revision: requiredField(record, "revision"),
            last_operation_key: `${PENDING_OPERATION_PREFIX}${deterministicDigest(
              "commerce-intent-operation",
              record.id,
            ).slice(0, 40)}`,
          },
        },
      ];
    }
    case "course":
      return [publicationRow(record, "courses", "revision")];
    case "course-revision": {
      const accessPlan = optionalRelation(record, "accessPlan");
      return [
        {
          table: "course_revisions",
          values: {
            id: record.id,
            course_id: requiredRelation(record, "course").targetId,
            revision: requiredField(record, "revision"),
            title: requiredField(record, "title"),
            description: requiredField(record, "description"),
            access_mode: requiredField(record, "accessMode"),
            access_plan_id: accessPlan?.targetId ?? null,
            access_plan_revision: accessPlan
              ? relationRevision(context, accessPlan)
              : null,
            estimated_minutes: requiredField(record, "estimatedMinutes"),
          },
        },
      ];
    }
    case "course-section":
      return [
        {
          table: "course_sections",
          values: {
            id: record.id,
            course_revision_id: requiredRelation(record, "courseRevision")
              .targetId,
            section_key: requiredField(record, "key"),
            position: requiredField(record, "position"),
            title: requiredField(record, "title"),
            description: requiredField(record, "description"),
          },
        },
      ];
    case "lesson":
      return [
        {
          table: "lessons",
          values: {
            id: record.id,
            course_revision_id: requiredRelation(record, "courseRevision")
              .targetId,
            course_section_id: requiredRelation(record, "courseSection")
              .targetId,
            lesson_key: requiredField(record, "key"),
            slug: requiredField(record, "slug"),
            position: requiredField(record, "position"),
            title: requiredField(record, "title"),
            summary: requiredField(record, "summary"),
            access_mode: requiredField(record, "accessMode"),
            estimated_minutes: requiredField(record, "estimatedMinutes"),
          },
        },
      ];
    case "lesson-item": {
      const itemType = requiredField(record, "itemType");
      const text =
        itemType === "text"
          ? requiredField(record, "bodyText")
          : itemType === "prompt"
            ? requiredField(record, "promptText")
            : "";
      return [
        {
          table: "lesson_items",
          values: {
            id: record.id,
            lesson_id: requiredRelation(record, "lesson").targetId,
            item_key: requiredField(record, "key"),
            position: requiredField(record, "position"),
            item_type: itemType,
            content_json: canonicalJson({
              caption: requiredField(record, "caption") ?? "",
              text: text ?? "",
            }),
            media_derivative_id:
              optionalRelation(record, "mediaDerivative")?.targetId ?? null,
            alt_text: requiredField(record, "altText"),
            transcript_text: requiredField(record, "transcriptText"),
          },
        },
      ];
    }
    case "video":
      return [publicationRow(record, "videos", "revision")];
    case "video-revision": {
      const deliveryKind = requiredField(record, "deliveryKind");
      const hosted = optionalRelation(record, "hostedDerivative");
      return [
        {
          table: "video_revisions",
          values: {
            id: record.id,
            video_id: requiredRelation(record, "video").targetId,
            revision: requiredField(record, "revision"),
            title: requiredField(record, "title"),
            summary: requiredField(record, "summary"),
            artist_context: requiredField(record, "artistContext"),
            credits_json: jsonStringList(requiredField(record, "credits")),
            delivery_kind: deliveryKind,
            poster_derivative_id:
              optionalRelation(record, "posterDerivative")?.targetId ?? null,
            hosted_derivative_id: hosted?.targetId ?? null,
            external_provider: deliveryKind === "external" ? "other" : null,
            external_embed_url:
              deliveryKind === "external"
                ? pendingExternalVideoUrl(record)
                : null,
          },
        },
      ];
    }
    case "video-transcript":
      return [
        {
          table: "video_transcripts",
          values: {
            id: record.id,
            video_revision_id: requiredRelation(record, "videoRevision")
              .targetId,
            language: requiredField(record, "language"),
            transcript_text: requiredField(record, "transcriptText"),
            captions_derivative_id:
              optionalRelation(record, "captionsDerivative")?.targetId ?? null,
            revision: requiredField(record, "revision"),
          },
        },
      ];
    case "editorial-post":
      return [
        {
          table: "editorial_posts",
          values: {
            id: record.id,
            slug: requiredField(record, "slug"),
            title: requiredField(record, "title"),
            excerpt: requiredField(record, "excerpt"),
            body_json: structuredText(record),
            state: requiredField(record, "state"),
            published_at: requiredField(record, "publishedAt"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    case "update": {
      const resource = optionalRelation(record, "resource");
      const resourceType = resource
        ? resource.targetEntity === "license-offer"
          ? "license"
          : resource.targetEntity === "membership-plan"
            ? "membership"
            : resource.targetEntity === "subscription-plan"
              ? "subscription"
              : resource.targetEntity
        : null;
      return [
        {
          table: "updates",
          values: {
            id: record.id,
            slug: requiredField(record, "slug"),
            title: requiredField(record, "title"),
            summary: requiredField(record, "summary"),
            body_json: structuredText(record),
            audience: requiredField(record, "audience"),
            resource_type: resourceType,
            resource_id: resource?.targetId ?? null,
            state: requiredField(record, "state"),
            published_at: requiredField(record, "publishedAt"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    }
    case "contact-form":
      return [
        {
          table: "contact_forms",
          values: {
            id: record.id,
            form_key: requiredField(record, "key"),
            title: requiredField(record, "title"),
            description: requiredField(record, "description"),
            booking_information: requiredField(record, "bookingInformation"),
            public_contact_details: requiredField(
              record,
              "publicContactDetails",
            ),
            categories_json: jsonStringList(
              requiredField(record, "categories"),
            ),
            state: requiredField(record, "state"),
            current_consent_version: requiredField(
              record,
              "currentConsentVersion",
            ),
            delivery_adapter: requiredField(record, "deliveryAdapter"),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    case "contact-consent-version":
      return [
        {
          table: "contact_consent_versions",
          values: {
            id: record.id,
            contact_form_id: requiredRelation(record, "contactForm").targetId,
            version: requiredField(record, "version"),
            consent_text: requiredField(record, "consentText"),
            effective_at: requiredField(record, "effectiveAt"),
          },
        },
      ];
    case "telemetry-settings":
      assertIdentity(record, "telemetry", "singleton key");
      return [
        {
          table: "telemetry_settings",
          values: {
            id: record.id,
            collection_mode: requiredField(record, "collectionMode"),
            retention_days: requiredField(record, "retentionDays"),
            meaningful_listen_seconds: requiredField(
              record,
              "meaningfulListenSeconds",
            ),
            revision: requiredField(record, "revision"),
          },
        },
      ];
    case "legal-document": {
      const documentKind = requiredField(record, "documentKind");
      assertIdentity(record, documentKind, "document kind");
      return [
        {
          table: "legal_documents",
          values: {
            id: record.id,
            title: requiredField(record, "title"),
            draft_version_id: requiredRelation(record, "draftVersion").targetId,
            approved_version_id:
              optionalRelation(record, "approvedVersion")?.targetId ?? null,
            published_version_id:
              optionalRelation(record, "publishedVersion")?.targetId ?? null,
            current_version: requiredField(record, "currentVersion"),
            revision: requiredField(record, "revision"),
            published_at: requiredField(record, "publishedAt"),
          },
        },
      ];
    }
    case "legal-document-version": {
      const approved = requiredField(record, "approved");
      const approvedAt = requiredField(record, "approvedAt");
      if (approved !== (approvedAt !== null)) {
        throw restoreError(
          "The portable legal-document-version approved and approvedAt fields must describe the same approval state for the application D1 row.",
          `$.restore.legal-document-version:${record.id}.fields.approved`,
        );
      }
      return [
        {
          table: "legal_document_versions",
          values: {
            id: record.id,
            document_id: requiredRelation(record, "legalDocument").targetId,
            version: requiredField(record, "version"),
            title: requiredField(record, "title"),
            introduction: requiredField(record, "introduction"),
            body_text: requiredField(record, "bodyText"),
            setup_answers_json: "{}",
            approved_by_user_id: approved ? RESTORE_AUTHORITY_ID : null,
            approved_at: approvedAt,
          },
        },
      ];
    }
    default:
      throw restoreError(
        `The portable ${record.entity} entity has no current application D1 materializer.`,
        `$.restore.${record.entity}:${record.id}`,
      );
  }
}

function orderedRecords(records) {
  const order = new Map(
    MATERIALIZATION_ENTITY_ORDER.map((entity, index) => [entity, index]),
  );
  return [...records].sort((left, right) => {
    const entityOrder = order.get(left.entity) - order.get(right.entity);
    return entityOrder !== 0
      ? entityOrder
      : left.id < right.id
        ? -1
        : left.id > right.id
          ? 1
          : 0;
  });
}

function clearSeedDefinitions(database) {
  for (const table of [...DEFINITION_TABLES].reverse()) {
    database.exec(`DELETE FROM "${table}"`);
  }
}

function ensureRestoreAuthority(database) {
  database
    .prepare(
      `INSERT OR IGNORE INTO users (id, email, normalized_email, status)
       VALUES (?, ?, ?, 'disabled')`,
    )
    .run(
      RESTORE_AUTHORITY_ID,
      RESTORE_AUTHORITY_EMAIL,
      RESTORE_AUTHORITY_EMAIL,
    );
}

function d1Meta(changes = 0, lastRowId = 0) {
  return {
    changed_db: false,
    changes,
    duration: 0,
    last_row_id: lastRowId,
    rows_read: 0,
    rows_written: changes,
    served_by: "portable-in-memory-sqlite",
    size_after: 0,
  };
}

class SqliteD1PreparedStatement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new SqliteD1PreparedStatement(this.database, this.sql, bindings);
  }

  first(columnName) {
    const row = this.database.prepare(this.sql).get(...this.bindings);
    if (row === undefined) return null;
    return columnName === undefined ? row : (row[columnName] ?? null);
  }

  all() {
    const results = this.database.prepare(this.sql).all(...this.bindings);
    return { success: true, results, meta: d1Meta() };
  }

  run() {
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: d1Meta(Number(result.changes), Number(result.lastInsertRowid ?? 0)),
    };
  }
}

class SqliteD1Binding {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this.database, sql);
  }
}

async function loadProjector() {
  if (!projectorPromise) {
    register(
      new URL("./node-alias-loader.mjs", import.meta.url),
      import.meta.url,
    );
    projectorPromise = import("../../db/portability-export.ts").then(
      ({ readPortableArtistSnapshot }) => readPortableArtistSnapshot,
    );
  }
  return projectorPromise;
}

export async function projectApplicationSnapshot(database) {
  const readPortableArtistSnapshot = await loadProjector();
  return readPortableArtistSnapshot(new SqliteD1Binding(database));
}

async function applyCheckedInMigrations(database) {
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  if (migrationNames.length === 0) {
    throw restoreError(
      "No checked-in Drizzle migrations are available for the application restore rehearsal.",
      "$.restore.migrations",
    );
  }

  for (const name of migrationNames) {
    const source = await readFile(new URL(name, migrationsDirectory), "utf8");
    const statements = source
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) database.exec(statement);
  }
  return migrationNames;
}

export async function createMigratedApplicationDatabaseInMemory() {
  const database = new DatabaseSync(":memory:");
  try {
    const migrations = await applyCheckedInMigrations(database);
    database.exec("PRAGMA foreign_keys = ON");
    return { database, migrations };
  } catch (error) {
    database.close();
    throw error;
  }
}

function canonicalRecordMap(snapshot) {
  const context = indexSnapshot(snapshot);
  return new Map(
    context.records.map((record) => [
      `${record.entity}\u0000${record.id}`,
      canonicalJson(record),
    ]),
  );
}

function compareCurrentDefinitions(current, desired) {
  const currentMap = canonicalRecordMap(current);
  const desiredMap = canonicalRecordMap(desired);
  const missing = [];
  let reused = 0;

  for (const document of PORTABLE_DOCUMENT_NAMES) {
    for (const record of desired[document]) {
      const key = `${record.entity}\u0000${record.id}`;
      const existing = currentMap.get(key);
      if (existing === undefined) {
        missing.push(record);
      } else if (existing !== canonicalJson(record)) {
        throw restoreError(
          "A portable identity already exists with different artist definitions in the application D1 schema.",
          `$.restore.${record.entity}:${record.id}`,
        );
      } else {
        reused += 1;
      }
    }
  }

  for (const key of currentMap.keys()) {
    if (!desiredMap.has(key)) {
      const [entity, id] = key.split("\u0000");
      throw restoreError(
        "The application D1 target contains an extra artist definition outside the verified portable snapshot.",
        `$.restore.${entity}:${id}`,
      );
    }
  }
  return { missing, reused };
}

function firstSnapshotDifference(current, desired) {
  const currentMap = canonicalRecordMap(current);
  const desiredMap = canonicalRecordMap(desired);
  for (const [key, desiredRecord] of desiredMap) {
    if (currentMap.get(key) !== desiredRecord) {
      const [entity, id] = key.split("\u0000");
      return `$.restore.${entity}:${id}`;
    }
  }
  for (const key of currentMap.keys()) {
    if (!desiredMap.has(key)) {
      const [entity, id] = key.split("\u0000");
      return `$.restore.${entity}:${id}`;
    }
  }
  return "$.restore.semanticFingerprint";
}

function assertForeignKeys(database) {
  const violations = database.prepare("PRAGMA foreign_key_check").all();
  if (violations.length > 0) {
    const first = violations[0];
    throw restoreError(
      `The portable relations cannot be materialized in the application D1 schema: ${String(first.table)} row ${String(first.rowid)} violates ${String(first.parent)}.`,
      "$.restore.relations",
    );
  }
  return 0;
}

export async function restoreArtistInstallationSnapshotPass(
  database,
  snapshotValue,
  pass,
  options = {},
) {
  const snapshot = normalizeArtistInstallationSnapshot(
    validateArtistInstallationSnapshot(snapshotValue),
  );
  const context = indexSnapshot(snapshot);
  let inserted = 0;
  let reused = 0;

  database.exec("BEGIN IMMEDIATE");
  database.exec("PRAGMA defer_foreign_keys = ON");
  try {
    let missing = context.records;
    if (options.replaceSeedDefinitions === true) {
      clearSeedDefinitions(database);
    } else {
      const current = normalizeArtistInstallationSnapshot(
        await projectApplicationSnapshot(database),
      );
      const comparison = compareCurrentDefinitions(current, snapshot);
      missing = comparison.missing;
      reused = comparison.reused;
    }

    ensureRestoreAuthority(database);
    for (const record of orderedRecords(missing)) {
      for (const row of materializationRows(record, context)) {
        insertRow(database, row.table, row.values);
      }
      inserted += 1;
    }

    const projected = normalizeArtistInstallationSnapshot(
      await projectApplicationSnapshot(database),
    );
    const desiredFingerprint = await createSemanticFingerprint(snapshot);
    const projectedFingerprint = await createSemanticFingerprint(projected);
    if (projectedFingerprint !== desiredFingerprint) {
      throw restoreError(
        "The materialized application D1 definitions do not reproduce the verified portable snapshot.",
        firstSnapshotDifference(projected, snapshot),
      );
    }
    const foreignKeyViolationCount = assertForeignKeys(database);
    database.exec("COMMIT");
    return {
      pass,
      inserted,
      reused,
      total: inserted + reused,
      foreignKeyViolationCount,
      semanticFingerprint: projectedFingerprint,
    };
  } catch (error) {
    database.exec("ROLLBACK");
    if (error instanceof PortabilityError) throw error;
    throw restoreError(
      `The verified portable definitions cannot be materialized atomically in the current application D1 schema: ${error instanceof Error ? error.message : "unknown SQLite failure"}`,
      "$.restore.applicationD1",
    );
  }
}

export function countProjectedRecords(snapshot) {
  return PORTABLE_DOCUMENT_NAMES.reduce(
    (count, document) => count + snapshot[document].length,
    0,
  );
}

export function inspectPendingRestoreState(database) {
  const commercePriceRows = database
    .prepare(
      `SELECT stripe_price_id, last_operation_key, stripe_environment, livemode
       FROM commerce_prices`,
    )
    .all();
  const commerceIntentRows = database
    .prepare(
      `SELECT binding_state, commerce_product_id, commerce_price_id,
              stripe_environment, livemode
       FROM commerce_binding_intents`,
    )
    .all();
  const externalVideoRows = database
    .prepare(
      `SELECT external_provider, external_embed_url
       FROM video_revisions WHERE delivery_kind = 'external'`,
    )
    .all();
  const mediaObjectRows = database
    .prepare("SELECT object_key FROM media_objects WHERE kind != 'export'")
    .all();
  const mediaDerivativeRows = database
    .prepare(
      `SELECT object_key FROM media_derivatives WHERE object_key IS NOT NULL`,
    )
    .all();

  const commercePending = commercePriceRows.every(
    (row) =>
      String(row.stripe_price_id).startsWith("price_portable_pending_") &&
      String(row.last_operation_key).startsWith(PENDING_OPERATION_PREFIX) &&
      row.stripe_environment === "test" &&
      Number(row.livemode) === 0,
  );
  const intentPending = commerceIntentRows.every(
    (row) =>
      row.binding_state === "pending" &&
      row.commerce_product_id === null &&
      row.commerce_price_id === null &&
      row.stripe_environment === "test" &&
      Number(row.livemode) === 0,
  );
  const externalVideoPending = externalVideoRows.every(
    (row) =>
      row.external_provider === "other" &&
      String(row.external_embed_url).startsWith(
        "https://invalid.example/portable-binding-pending/",
      ),
  );
  const sourceObjectKeysRestored = [
    ...mediaObjectRows,
    ...mediaDerivativeRows,
  ].filter(
    (row) =>
      !String(row.object_key).includes("/portable-restore/") &&
      !String(row.object_key).includes("/portable-binding-pending/"),
  ).length;

  if (!commercePending || !intentPending || !externalVideoPending) {
    throw restoreError(
      "The application D1 rehearsal did not preserve pending commerce and external-video binding state.",
      "$.restore.pendingBindings",
    );
  }

  return {
    commerceBindingState: "pending",
    externalVideoBindingState: "pending",
    sourceObjectKeysRestored,
    mediaBytesRestored: 0,
  };
}

export { DEFINITION_TABLES };
