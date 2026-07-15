import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  portableColumns,
  portableContentSchema,
  portableManifestSchema,
  portableMediaSchema,
  portableOperationsSchema,
  portableServicesSchema,
  type PortableContent,
  type PortableManifest,
  type PortableMedia,
  type PortableOperations,
  type PortableServices,
  type PortableTableName,
} from '../../shared/schemas/portable.ts'
import type { Database, Json } from '../../shared/types/database.ts'
import { canonicalJson } from './setup.ts'

export type PortableRow = Record<string, Json | undefined>

export function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

export function stableJson(value: unknown) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    )
  }
  return value
}

export function artistSlug(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'artist'
  )
}

export async function readPortableExport(directory: string): Promise<{
  manifest: PortableManifest
  content: PortableContent
  media: PortableMedia
  services: PortableServices
  operations: PortableOperations
}> {
  const manifest = portableManifestSchema.parse(
    JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')),
  )
  const readArtifact = async (artifact: { path: string; sha256: string }) => {
    const text = await readFile(resolve(directory, artifact.path), 'utf8')
    if (sha256(text) !== artifact.sha256) throw new Error(`${artifact.path} hash does not match.`)
    return JSON.parse(text)
  }
  const content = portableContentSchema.parse(await readArtifact(manifest.artifacts.content))
  const media = portableMediaSchema.parse(await readArtifact(manifest.artifacts.media))
  const services = portableServicesSchema.parse(await readArtifact(manifest.artifacts.services))
  const operations = portableOperationsSchema.parse(
    await readArtifact(manifest.artifacts.operations),
  )
  const artifactHashes = Object.values(manifest.artifacts).map(({ sha256: hash }) => hash)
  if (sha256(stableJson(artifactHashes)) !== manifest.snapshotHash) {
    throw new Error('The portable snapshot hash does not match its artifacts.')
  }
  return { manifest, content, media, services, operations }
}

export async function selectPortableRows(
  admin: SupabaseClient<Database>,
  table: PortableTableName,
  filter?: (row: PortableRow) => boolean,
) {
  const { data, error } = await admin
    .from(table)
    .select(portableColumns[table].join(',') as '*')
    .order(portableColumns[table].includes('id' as never) ? 'id' : portableColumns[table][0])
  if (error) throw new Error(`Could not export ${table}.`)
  const rows = (data as unknown as PortableRow[]).filter(filter ?? (() => true))
  return rows.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
}

export function safeBundlePath(media: { id: string; mediaType: string; objectPath: string }) {
  const extension = extname(media.objectPath)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '')
  const fallback = media.mediaType.includes('json') ? '.json' : ''
  return `media/${media.id}${extension || fallback}`
}

const forbiddenTextPatterns = [
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+\b/,
  /\bwhsec_[A-Za-z0-9]+\b/,
  /postgres(?:ql)?:\/\//i,
  /[?&](?:token|signature|x-amz-signature)=/i,
  /(?:127\.0\.0\.1|localhost):\d+/i,
  /\/Users\//,
  /019f6291-c1c9-7cf3-9da7-be2a19b7154c/,
]

const forbiddenKeys = new Set([
  'password',
  'secret',
  'secretKey',
  'serviceRoleKey',
  'external_price_id',
  'external_product_id',
  'provider_customer_id',
  'provider_event_id',
  'provider_session_id',
  'subject_id',
  'owner_id',
  'actor_id',
  'created_by',
  'updated_by',
])

export function assertPortableValue(value: unknown, path = '$') {
  if (typeof value === 'string') {
    if (forbiddenTextPatterns.some((pattern) => pattern.test(value))) {
      throw new Error(`${path} contains a forbidden private or environment value.`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertPortableValue(child, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new Error(`${path}.${key} is not portable.`)
    assertPortableValue(child, `${path}.${key}`)
  }
}

export async function verifyBundledMedia(directory: string, media: PortableMedia) {
  const ids = new Set<string>()
  const addresses = new Set<string>()
  for (const entry of media.entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate media id ${entry.id}.`)
    ids.add(entry.id)
    const address = `${entry.bucketId}/${entry.objectPath}`
    if (addresses.has(address)) throw new Error(`Duplicate media address ${address}.`)
    addresses.add(address)
    const bytes = await readFile(resolve(directory, entry.bundlePath))
    if (bytes.byteLength !== entry.byteSize) throw new Error(`${entry.bundlePath} size differs.`)
    if (sha256(bytes) !== entry.sha256) throw new Error(`${entry.bundlePath} hash differs.`)
  }

  const mediaDirectory = resolve(directory, 'media')
  const bundled = (await readdir(mediaDirectory)).sort()
  const declared = media.entries.map(({ bundlePath }) => bundlePath.split('/').at(-1)!).sort()
  if (canonicalJson(bundled) !== canonicalJson(declared)) {
    throw new Error('The media bundle contains undeclared or missing files.')
  }
}

export function verifyPortableRelationships(content: PortableContent, media: PortableMedia) {
  const tables = content.tables as Record<PortableTableName, PortableRow[]>
  const ids = (table: PortableTableName) =>
    new Set(tables[table].map((row) => row.id).filter((id): id is string => typeof id === 'string'))
  const releaseIds = ids('releases')
  const trackIds = ids('tracks')
  const collectionIds = ids('collections')
  const productIds = ids('products')
  const priceIds = ids('prices')
  const membershipIds = ids('membership_tiers')
  const templateIds = ids('license_templates')
  const versionIds = ids('license_template_versions')
  const optionIds = ids('license_options')
  const areaIds = ids('learning_areas')
  const pathIds = ids('learning_paths')
  const courseIds = ids('courses')
  const lessonIds = ids('lessons')
  const videoIds = ids('videos')
  const mediaIds = new Set(media.entries.map(({ id }) => id))

  const requireRef = (
    rows: PortableRow[],
    field: string,
    allowed: Set<string>,
    label: string,
    nullable = false,
  ) => {
    for (const row of rows) {
      const value = row[field]
      if (nullable && value === null) continue
      if (typeof value !== 'string' || !allowed.has(value)) {
        throw new Error(`${label}.${field} references a missing portable record.`)
      }
    }
  }

  requireRef(tables.release_tracks, 'release_id', releaseIds, 'release_tracks')
  requireRef(tables.release_tracks, 'track_id', trackIds, 'release_tracks')
  requireRef(tables.collection_tracks, 'collection_id', collectionIds, 'collection_tracks')
  requireRef(tables.collection_tracks, 'track_id', trackIds, 'collection_tracks')
  requireRef(tables.prices, 'product_id', productIds, 'prices')
  requireRef(tables.license_templates, 'track_id', trackIds, 'license_templates')
  requireRef(tables.license_templates, 'current_version_id', versionIds, 'license_templates', true)
  requireRef(
    tables.license_template_versions,
    'template_id',
    templateIds,
    'license_template_versions',
  )
  requireRef(tables.license_options, 'template_version_id', versionIds, 'license_options')
  requireRef(tables.license_offers, 'template_id', templateIds, 'license_offers')
  requireRef(tables.license_offers, 'template_version_id', versionIds, 'license_offers')
  requireRef(tables.license_offers, 'option_id', optionIds, 'license_offers')
  requireRef(tables.license_offers, 'track_id', trackIds, 'license_offers')
  requireRef(tables.license_offers, 'product_id', productIds, 'license_offers')
  requireRef(tables.license_offers, 'price_id', priceIds, 'license_offers')
  requireRef(tables.learning_paths, 'area_id', areaIds, 'learning_paths')
  requireRef(tables.courses, 'path_id', pathIds, 'courses')
  requireRef(tables.lessons, 'course_id', courseIds, 'lessons')
  requireRef(tables.lessons, 'membership_tier_id', membershipIds, 'lessons', true)
  requireRef(tables.lessons, 'entitlement_product_id', productIds, 'lessons', true)
  requireRef(tables.lesson_sections, 'lesson_id', lessonIds, 'lesson_sections')
  requireRef(tables.lesson_sections, 'media_object_id', mediaIds, 'lesson_sections', true)
  requireRef(tables.lesson_sections, 'video_id', videoIds, 'lesson_sections', true)
  requireRef(tables.videos, 'hosted_media_id', mediaIds, 'videos', true)
  requireRef(tables.releases, 'artwork_media_id', mediaIds, 'releases', true)
  for (const entry of media.entries) {
    if (entry.releaseId && !releaseIds.has(entry.releaseId))
      throw new Error('Media references an unexported release.')
    if (entry.trackId && !trackIds.has(entry.trackId))
      throw new Error('Media references an unexported track.')
    if (entry.lessonId && !lessonIds.has(entry.lessonId))
      throw new Error('Media references an unexported lesson.')
    if (entry.sourceMediaId && !mediaIds.has(entry.sourceMediaId))
      throw new Error('Media references an unexported source object.')
  }
}
