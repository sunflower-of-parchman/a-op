import { z } from 'zod'
import { artistConfigSchema } from '#artist-config-schema'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const relativePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('/') && !value.split('/').includes('..'))

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

export const portableColumns = {
  pages: [
    'id',
    'slug',
    'title',
    'navigation_label',
    'status',
    'seo',
    'sections',
    'created_at',
    'updated_at',
    'published_at',
  ],
  releases: [
    'id',
    'slug',
    'title',
    'description',
    'release_date',
    'state',
    'sort_order',
    'published_at',
    'created_at',
    'updated_at',
    'subtitle',
    'release_type',
    'label',
    'catalog_number',
    'genre',
    'mood',
    'artwork_media_id',
  ],
  tracks: [
    'id',
    'slug',
    'title',
    'description',
    'primary_release_id',
    'duration_ms',
    'musical_key',
    'meter',
    'tempo_bpm',
    'mood',
    'instruments',
    'explicit',
    'state',
    'published_at',
    'created_at',
    'updated_at',
  ],
  release_tracks: ['release_id', 'track_id', 'disc_number', 'position', 'created_at'],
  collections: [
    'id',
    'slug',
    'title',
    'description',
    'state',
    'sort_order',
    'published_at',
    'created_at',
    'updated_at',
  ],
  collection_tracks: ['collection_id', 'track_id', 'position', 'note', 'created_at'],
  catalog_credits: ['id', 'resource_type', 'resource_id', 'role', 'name', 'position', 'created_at'],
  catalog_taxonomies: ['id', 'key', 'label', 'created_at'],
  catalog_terms: ['id', 'taxonomy_id', 'slug', 'label', 'sort_order', 'created_at'],
  catalog_term_assignments: ['term_id', 'resource_type', 'resource_id', 'created_at'],
  products: [
    'id',
    'slug',
    'product_type',
    'name',
    'description',
    'resource_type',
    'resource_id',
    'state',
    'created_at',
    'updated_at',
    'purchase_mode',
    'external_url',
    'sort_order',
    'published_at',
  ],
  prices: [
    'id',
    'product_id',
    'currency',
    'amount_minor',
    'active',
    'created_at',
    'billing_interval',
    'updated_at',
  ],
  membership_tiers: [
    'id',
    'slug',
    'name',
    'description',
    'benefits',
    'state',
    'sort_order',
    'created_at',
    'updated_at',
  ],
  license_templates: [
    'id',
    'track_id',
    'slug',
    'name',
    'summary',
    'state',
    'current_version_id',
    'created_at',
    'updated_at',
  ],
  license_template_versions: [
    'id',
    'template_id',
    'version_number',
    'title',
    'introduction',
    'general_terms',
    'disclaimer',
    'created_at',
  ],
  license_options: [
    'id',
    'template_version_id',
    'option_key',
    'label',
    'description',
    'usage_category',
    'allowed_media',
    'audience_label',
    'max_audience',
    'distribution_label',
    'max_copies',
    'term_months',
    'territory',
    'attribution_required',
    'attribution_text',
    'exclusive',
    'currency',
    'amount_minor',
    'sort_order',
    'created_at',
  ],
  license_offers: [
    'id',
    'template_id',
    'template_version_id',
    'option_id',
    'track_id',
    'product_id',
    'price_id',
    'state',
    'created_at',
    'updated_at',
  ],
  learning_areas: [
    'id',
    'slug',
    'name',
    'description',
    'state',
    'sort_order',
    'created_at',
    'updated_at',
  ],
  learning_paths: [
    'id',
    'area_id',
    'slug',
    'title',
    'summary',
    'introduction',
    'state',
    'sort_order',
    'published_at',
    'created_at',
    'updated_at',
  ],
  courses: [
    'id',
    'path_id',
    'slug',
    'title',
    'summary',
    'position',
    'state',
    'published_at',
    'created_at',
    'updated_at',
  ],
  lessons: [
    'id',
    'course_id',
    'slug',
    'title',
    'summary',
    'estimated_minutes',
    'access_mode',
    'access_explanation',
    'membership_tier_id',
    'entitlement_product_id',
    'position',
    'state',
    'published_at',
    'created_at',
    'updated_at',
  ],
  lesson_sections: [
    'id',
    'lesson_id',
    'section_type',
    'content',
    'media_object_id',
    'video_id',
    'position',
    'created_at',
  ],
  videos: [
    'id',
    'slug',
    'title',
    'summary',
    'provider',
    'external_id',
    'hosted_media_id',
    'poster_url',
    'transcript',
    'credits',
    'state',
    'published_at',
    'created_at',
    'updated_at',
  ],
  editorial_posts: [
    'id',
    'kind',
    'slug',
    'title',
    'summary',
    'published_on',
    'sections',
    'state',
    'published_at',
    'created_at',
    'updated_at',
  ],
  telemetry_settings: [
    'id',
    'optional_enabled',
    'consent_mode',
    'retention_days',
    'meaningful_listen_seconds',
    'updated_at',
  ],
} as const

export type PortableTableName = keyof typeof portableColumns

function portableRows(table: PortableTableName) {
  const allowed = new Set<string>(portableColumns[table])
  return z.array(
    z.record(z.string(), jsonValueSchema).superRefine((row, context) => {
      for (const key of Object.keys(row)) {
        if (!allowed.has(key)) {
          context.addIssue({ code: 'custom', message: `${table}.${key} is not portable.` })
        }
      }
      if (
        !('id' in row) &&
        !['release_tracks', 'collection_tracks', 'catalog_term_assignments'].includes(table)
      ) {
        context.addIssue({ code: 'custom', message: `${table} row is missing id.` })
      }
    }),
  )
}

export const portableContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    artistConfig: artistConfigSchema,
    tables: z
      .object(
        Object.fromEntries(
          (Object.keys(portableColumns) as PortableTableName[]).map((table) => [
            table,
            portableRows(table),
          ]),
        ) as Record<PortableTableName, ReturnType<typeof portableRows>>,
      )
      .strict(),
  })
  .strict()

export const portableMediaSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(
      z
        .object({
          id: z.string().uuid(),
          releaseId: z.string().uuid().nullable(),
          trackId: z.string().uuid().nullable(),
          lessonId: z.string().uuid().nullable(),
          sourceMediaId: z.string().uuid().nullable(),
          kind: z.string().min(1),
          bucketId: z.string().min(1),
          objectPath: relativePathSchema,
          mediaType: z.string().min(1),
          byteSize: z.number().int().nonnegative(),
          sha256: sha256Schema,
          isPublic: z.boolean(),
          metadata: jsonValueSchema,
          processingProfileVersion: z.string().nullable(),
          derivativeKey: z.string().nullable(),
          bundlePath: relativePathSchema,
          retrieval: z.literal('bundled-and-storage-addressable'),
        })
        .strict(),
    ),
  })
  .strict()

const serviceStateSchema = z.enum([
  'local',
  'simulation',
  'configured-test',
  'approval-required',
  'not-requested',
])

export const portableServicesSchema = z
  .object({
    schemaVersion: z.literal(1),
    containsSecrets: z.literal(false),
    providerIdentifiers: z.literal('excluded'),
    connections: z
      .object({
        supabase: serviceStateSchema,
        authentication: serviceStateSchema,
        stripe: serviceStateSchema,
        hosting: serviceStateSchema,
        domain: serviceStateSchema,
        email: serviceStateSchema,
        mediaWorker: serviceStateSchema,
      })
      .strict(),
    reconnect: z.array(
      z
        .object({
          service: z.string().min(1),
          runbook: relativePathSchema,
          approvalRequired: z.literal(true),
        })
        .strict(),
    ),
  })
  .strict()

export const portableOperationsSchema = z
  .object({
    schemaVersion: z.literal(1),
    databaseBackup: z
      .object({
        runbook: relativePathSchema,
        localVerification: z.string().min(1),
        hostedProcedure: z.string().min(1),
      })
      .strict(),
    customerData: z
      .object({
        included: z.literal(false),
        reason: z.string().min(1),
        exportProcedure: z.string().min(1),
      })
      .strict(),
    restore: z
      .object({
        runbook: relativePathSchema,
        checkCommand: z.string().min(1),
        externalAccounts: z.literal('reconnect-after-restore'),
      })
      .strict(),
    exclusions: z.array(z.string().min(1)).min(1),
  })
  .strict()

export const portableManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    exportId: z.string().regex(/^[a-z0-9-]+-[a-f0-9]{12}$/),
    application: z
      .object({
        name: z.literal('artist-owned-platform'),
        version: z.string().min(1),
        migrationVersion: z.string().regex(/^\d{14}$/),
      })
      .strict(),
    artist: z
      .object({
        name: z.string().min(1),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      })
      .strict(),
    artifacts: z
      .object({
        content: z.object({ path: relativePathSchema, sha256: sha256Schema }).strict(),
        media: z.object({ path: relativePathSchema, sha256: sha256Schema }).strict(),
        services: z.object({ path: relativePathSchema, sha256: sha256Schema }).strict(),
        operations: z.object({ path: relativePathSchema, sha256: sha256Schema }).strict(),
      })
      .strict(),
    snapshotHash: sha256Schema,
  })
  .strict()

export type PortableContent = z.infer<typeof portableContentSchema>
export type PortableMedia = z.infer<typeof portableMediaSchema>
export type PortableServices = z.infer<typeof portableServicesSchema>
export type PortableOperations = z.infer<typeof portableOperationsSchema>
export type PortableManifest = z.infer<typeof portableManifestSchema>
