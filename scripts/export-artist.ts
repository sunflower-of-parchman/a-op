import { readFileSync } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { artistConfigSchema } from '../shared/schemas/artistConfig.ts'
import {
  portableContentSchema,
  portableMediaSchema,
  portableOperationsSchema,
  portableServicesSchema,
  type PortableMedia,
  type PortableTableName,
} from '../shared/schemas/portable.ts'
import { projectRoot, readJson } from './lib/command.mjs'
import { localSetupAuthority, readProjectState, readPublishedConfig } from './lib/setup.ts'
import {
  artistSlug,
  assertPortableValue,
  safeBundlePath,
  selectPortableRows,
  sha256,
  stableJson,
  type PortableRow,
} from './lib/portability.ts'

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function ids(rows: PortableRow[]) {
  return new Set(rows.map(({ id }) => id).filter((id): id is string => typeof id === 'string'))
}

function referencesOnly(
  rows: PortableRow[],
  references: Array<[field: string, allowed: Set<string>, nullable?: boolean]>,
) {
  return rows.filter((row) =>
    references.every(([field, allowed, nullable]) => {
      const value = row[field]
      return (nullable && value === null) || (typeof value === 'string' && allowed.has(value))
    }),
  )
}

function configured(name: string) {
  if (process.env[name]) return true
  try {
    return readFileSync(resolve(projectRoot, '.env'), 'utf8')
      .split(/\r?\n/)
      .some((line) => line.startsWith(`${name}=`) && line.slice(name.length + 1).trim().length > 0)
  } catch {
    return false
  }
}

const authority = localSetupAuthority()
if (!authority) throw new Error('Artist export currently supports the verified local installation.')
const { admin } = authority
const published = await readPublishedConfig(admin)
const artistConfig = artistConfigSchema.parse(published.config)
const slug = artistSlug(artistConfig.identity.name)
const requestedOutput = argument('--out')
const outputDirectory = resolve(
  requestedOutput ?? resolve(projectRoot, 'exports', `${slug}-portable-v1`),
)
await mkdir(dirname(outputDirectory), { recursive: true })
await mkdir(outputDirectory)
await mkdir(resolve(outputDirectory, 'media'))

const table = async (name: PortableTableName) => selectPortableRows(admin, name)
const tables = {} as Record<PortableTableName, PortableRow[]>

tables.pages = (await table('pages')).filter(({ status }) => status === 'published')
tables.releases = (await table('releases')).filter(({ state }) => state === 'published')
tables.tracks = (await table('tracks')).filter(({ state }) => state === 'published')
const releaseIds = ids(tables.releases)
const trackIds = ids(tables.tracks)
tables.release_tracks = referencesOnly(await table('release_tracks'), [
  ['release_id', releaseIds],
  ['track_id', trackIds],
])
tables.collections = (await table('collections')).filter(({ state }) => state === 'published')
const collectionIds = ids(tables.collections)
tables.collection_tracks = referencesOnly(await table('collection_tracks'), [
  ['collection_id', collectionIds],
  ['track_id', trackIds],
])
const catalogResourceIds = new Set([...releaseIds, ...trackIds, ...collectionIds])
tables.catalog_credits = (await table('catalog_credits')).filter(
  ({ resource_id }) => typeof resource_id === 'string' && catalogResourceIds.has(resource_id),
)
tables.catalog_taxonomies = await table('catalog_taxonomies')
const taxonomyIds = ids(tables.catalog_taxonomies)
tables.catalog_terms = referencesOnly(await table('catalog_terms'), [['taxonomy_id', taxonomyIds]])
const termIds = ids(tables.catalog_terms)
tables.catalog_term_assignments = (await table('catalog_term_assignments')).filter(
  ({ term_id, resource_id }) =>
    typeof term_id === 'string' &&
    termIds.has(term_id) &&
    typeof resource_id === 'string' &&
    catalogResourceIds.has(resource_id),
)

tables.membership_tiers = (await table('membership_tiers')).filter(
  ({ state }) => state === 'published',
)
tables.products = (await table('products')).filter(({ state }) => state === 'published')
const productIds = ids(tables.products)
tables.prices = referencesOnly(await table('prices'), [['product_id', productIds]])
const priceIds = ids(tables.prices)

tables.license_templates = (await table('license_templates')).filter(
  ({ state, track_id }) =>
    state === 'published' && typeof track_id === 'string' && trackIds.has(track_id),
)
const templateIds = ids(tables.license_templates)
tables.license_template_versions = referencesOnly(await table('license_template_versions'), [
  ['template_id', templateIds],
])
const versionIds = ids(tables.license_template_versions)
tables.license_options = referencesOnly(await table('license_options'), [
  ['template_version_id', versionIds],
])
const optionIds = ids(tables.license_options)
tables.license_offers = referencesOnly(
  (await table('license_offers')).filter(({ state }) => state === 'published'),
  [
    ['template_id', templateIds],
    ['template_version_id', versionIds],
    ['option_id', optionIds],
    ['track_id', trackIds],
    ['product_id', productIds],
    ['price_id', priceIds],
  ],
)

tables.learning_areas = (await table('learning_areas')).filter(({ state }) => state === 'published')
const areaIds = ids(tables.learning_areas)
tables.learning_paths = referencesOnly(
  (await table('learning_paths')).filter(({ state }) => state === 'published'),
  [['area_id', areaIds]],
)
const pathIds = ids(tables.learning_paths)
tables.courses = referencesOnly(
  (await table('courses')).filter(({ state }) => state === 'published'),
  [['path_id', pathIds]],
)
const courseIds = ids(tables.courses)
tables.lessons = referencesOnly(
  (await table('lessons')).filter(({ state }) => state === 'published'),
  [['course_id', courseIds]],
)
const lessonIds = ids(tables.lessons)
tables.videos = (await table('videos')).filter(({ state }) => state === 'published')
const videoIds = ids(tables.videos)
tables.lesson_sections = referencesOnly(await table('lesson_sections'), [
  ['lesson_id', lessonIds],
  ['video_id', videoIds, true],
])
tables.editorial_posts = (await table('editorial_posts')).filter(
  ({ state }) => state === 'published',
)
tables.telemetry_settings = await table('telemetry_settings')

const { data: rawMedia, error: mediaError } = await admin
  .from('media_objects')
  .select(
    'id,release_id,track_id,lesson_id,source_media_id,kind,bucket_id,object_path,media_type,byte_size,sha256,status,is_public,metadata,processing_profile_version,derivative_key',
  )
  .eq('status', 'ready')
  .neq('kind', 'license_document')
  .order('id')
if (mediaError) throw new Error('Could not export the media inventory.')

const eligibleMedia = rawMedia.filter(
  (row) =>
    (!row.release_id || releaseIds.has(row.release_id)) &&
    (!row.track_id || trackIds.has(row.track_id)) &&
    (!row.lesson_id || lessonIds.has(row.lesson_id)),
)
const eligibleMediaIds = new Set(eligibleMedia.map(({ id }) => id))
const mediaEntries: PortableMedia['entries'] = []
for (const row of eligibleMedia) {
  if (row.source_media_id && !eligibleMediaIds.has(row.source_media_id)) {
    throw new Error('A portable derivative is missing its source media record.')
  }
  const bundlePath = safeBundlePath({
    id: row.id,
    mediaType: row.media_type,
    objectPath: row.object_path,
  })
  const { data: object, error } = await admin.storage.from(row.bucket_id).download(row.object_path)
  if (error || !object) throw new Error(`Could not bundle media object ${row.id}.`)
  const bytes = Buffer.from(await object.arrayBuffer())
  if (bytes.byteLength !== row.byte_size || sha256(bytes) !== row.sha256) {
    throw new Error(`Stored media object ${row.id} does not match its database inventory.`)
  }
  await writeFile(resolve(outputDirectory, bundlePath), bytes, { flag: 'wx' })
  mediaEntries.push({
    id: row.id,
    releaseId: row.release_id,
    trackId: row.track_id,
    lessonId: row.lesson_id,
    sourceMediaId: row.source_media_id,
    kind: row.kind,
    bucketId: row.bucket_id,
    objectPath: row.object_path,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    isPublic: row.is_public,
    metadata: row.metadata,
    processingProfileVersion: row.processing_profile_version,
    derivativeKey: row.derivative_key,
    bundlePath,
    retrieval: 'bundled-and-storage-addressable',
  })
}
const mediaIds = new Set(mediaEntries.map(({ id }) => id))
tables.lesson_sections = tables.lesson_sections.filter(
  ({ media_object_id }) => media_object_id === null || mediaIds.has(String(media_object_id)),
)
tables.videos = tables.videos.filter(
  ({ hosted_media_id }) => hosted_media_id === null || mediaIds.has(String(hosted_media_id)),
)
const restoredVideoIds = ids(tables.videos)
tables.lesson_sections = tables.lesson_sections.filter(
  ({ video_id }) => video_id === null || restoredVideoIds.has(String(video_id)),
)

const content = portableContentSchema.parse({
  schemaVersion: 1,
  artistConfig,
  tables,
})
const media = portableMediaSchema.parse({ schemaVersion: 1, entries: mediaEntries })
const state = readProjectState()
const services = portableServicesSchema.parse({
  schemaVersion: 1,
  containsSecrets: false,
  providerIdentifiers: 'excluded',
  connections: {
    supabase: state.installationMode === 'local' ? 'local' : 'approval-required',
    authentication: 'local',
    stripe: configured('NUXT_STRIPE_SECRET_KEY') ? 'configured-test' : 'simulation',
    hosting:
      state.externalActions.hostedDeployment === 'not-requested'
        ? 'not-requested'
        : 'approval-required',
    domain:
      state.externalActions.domain === 'not-requested' ? 'not-requested' : 'approval-required',
    email:
      state.externalActions.emailProvider === 'not-requested'
        ? 'not-requested'
        : 'approval-required',
    mediaWorker:
      state.externalActions.mediaWorkerDeployment === 'not-requested'
        ? 'not-requested'
        : 'approval-required',
  },
  reconnect: [
    ['supabase', 'docs/agent/supabase.md'],
    ['authentication', 'docs/agent/authentication-oauth.md'],
    ['stripe', 'docs/agent/stripe.md'],
    ['hosting-domain', 'docs/agent/vercel-domain.md'],
    ['email', 'docs/agent/email.md'],
    ['media-worker', 'docs/agent/media.md'],
  ].map(([service, runbook]) => ({ service, runbook, approvalRequired: true })),
})
const operations = portableOperationsSchema.parse({
  schemaVersion: 1,
  databaseBackup: {
    runbook: 'docs/agent/backup-restore.md',
    localVerification: 'Use npm run restore:check against a disposable local reset.',
    hostedProcedure:
      'Create and verify an encrypted provider backup only after the artist approves the target, cost, retention, and customer-data handling.',
  },
  customerData: {
    included: false,
    reason:
      'Portable artist structure excludes profiles, contact messages, libraries, telemetry events, payments, subscriptions, issued licenses, and fulfillment history.',
    exportProcedure:
      'Use the approved hosted provider export and encrypted retention procedure in docs/agent/backup-restore.md.',
  },
  restore: {
    runbook: 'docs/agent/backup-restore.md',
    checkCommand: 'npm run restore:check -- <export-directory> --confirm-disposable-local',
    externalAccounts: 'reconnect-after-restore',
  },
  exclusions: [
    'secrets and environment values',
    'provider customer, event, session, product, and price identifiers',
    'customer accounts, contact messages, libraries, progress, orders, subscriptions, and licenses',
    'analytics and operational event history',
    'drafts, private task metadata, permanent signed URLs, and unapproved personal data',
  ],
})

assertPortableValue({ content, media, services, operations })
const artifacts = {
  content: { path: 'content.json', value: content },
  media: { path: 'media.json', value: media },
  services: { path: 'services.json', value: services },
  operations: { path: 'operations.json', value: operations },
}
const artifactManifest = {} as Record<keyof typeof artifacts, { path: string; sha256: string }>
for (const [name, artifact] of Object.entries(artifacts) as Array<
  [keyof typeof artifacts, (typeof artifacts)[keyof typeof artifacts]]
>) {
  const text = stableJson(artifact.value)
  await writeFile(resolve(outputDirectory, artifact.path), text, { flag: 'wx' })
  artifactManifest[name] = { path: artifact.path, sha256: sha256(text) }
}

const packageFile = readJson(resolve(projectRoot, 'package.json'))
const migrations = (await readdir(resolve(projectRoot, 'supabase/migrations')))
  .filter((file) => /^\d{14}_.+\.sql$/.test(file))
  .sort()
const migrationVersion = migrations.at(-1)!.slice(0, 14)
const snapshotHash = sha256(stableJson(Object.values(artifactManifest).map(({ sha256 }) => sha256)))
const exportId = `${slug}-${snapshotHash.slice(0, 12)}`
const manifest = {
  schemaVersion: 1,
  exportId,
  application: {
    name: 'artist-owned-platform',
    version: packageFile.version,
    migrationVersion,
  },
  artist: { name: artistConfig.identity.name, slug },
  artifacts: artifactManifest,
  snapshotHash,
}
await writeFile(resolve(outputDirectory, 'manifest.json'), stableJson(manifest), { flag: 'wx' })

const result = {
  event: 'artist-export-created',
  exportId,
  directory: outputDirectory.startsWith(projectRoot)
    ? outputDirectory.slice(projectRoot.length + 1)
    : outputDirectory.split('/').at(-1),
  artifacts: 4,
  media: mediaEntries.length,
  snapshotHash,
}
if (process.argv.includes('--json')) console.log(JSON.stringify(result))
else {
  console.log(`Artist export: PASS — ${result.exportId}`)
  console.log(`Directory: ${result.directory}`)
  console.log(`Media objects: ${result.media}`)
  console.log(`Verify: npm run export:verify -- ${result.directory}`)
}
