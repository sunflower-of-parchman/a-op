import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  portableColumns,
  type PortableContent,
  type PortableMedia,
  type PortableTableName,
} from '../shared/schemas/portable.ts'
import type { Database, Json } from '../shared/types/database.ts'
import { run, runSupabase } from './lib/command.mjs'
import { createAdminClient, getLocalStatus, safeSupabaseError } from './lib/local-supabase.mjs'
import {
  assertPortableValue,
  readPortableExport,
  sha256,
  verifyBundledMedia,
  verifyPortableRelationships,
  type PortableRow,
} from './lib/portability.ts'
import { contentHash, localSetupAuthority, stableUuid } from './lib/setup.ts'

const directory = process.argv[2]
if (!directory || !process.argv.includes('--confirm-disposable-local')) {
  throw new Error(
    'Restore checking requires an export directory and --confirm-disposable-local. It resets only the local Supabase database and restores the fictional demonstration afterward.',
  )
}
if (!localSetupAuthority())
  throw new Error('Restore checking refuses every non-local Supabase target.')

const exportDirectory = resolve(directory)
const portable = await readPortableExport(exportDirectory)
assertPortableValue(portable)
verifyPortableRelationships(portable.content, portable.media)
await verifyBundledMedia(exportDirectory, portable.media)

type TableRows = PortableContent['tables']

async function writeRows(
  admin: SupabaseClient<Database>,
  table: PortableTableName,
  rows: PortableRow[],
  options: { upsert?: boolean; onConflict?: string } = {},
) {
  if (!rows.length) return
  const query = admin.from(table)
  const { error } = options.upsert
    ? await query.upsert(rows as never, { onConflict: options.onConflict })
    : await query.insert(rows as never)
  if (error) throw new Error(`Portable restore could not write ${table}: ${error.message}`)
}

function ownerRows(rows: PortableRow[], fields: string[], ownerId: string) {
  return rows.map((row) => ({
    ...row,
    ...Object.fromEntries(fields.map((field) => [field, ownerId])),
  }))
}

async function restoreContent(
  admin: SupabaseClient<Database>,
  ownerId: string,
  content: PortableContent,
  media: PortableMedia,
) {
  const tables = content.tables as TableRows & Record<PortableTableName, PortableRow[]>
  const configId = stableUuid(`portable-config:${portable.manifest.exportId}`)
  const { error: configError } = await admin.from('site_config_versions').insert({
    id: configId,
    installation_key: 'primary',
    status: 'published',
    config_schema_version: content.artistConfig.schemaVersion,
    config: content.artistConfig as unknown as Json,
    published_at: '2026-07-15T00:00:00.000Z',
    updated_by: ownerId,
  })
  if (configError) throw new Error(`Portable configuration restore failed: ${configError.message}`)

  await writeRows(admin, 'pages', ownerRows(tables.pages, ['created_by', 'updated_by'], ownerId))
  await writeRows(
    admin,
    'releases',
    ownerRows(
      tables.releases.map((row) => ({ ...row, artwork_media_id: null })),
      ['created_by'],
      ownerId,
    ),
  )
  await writeRows(admin, 'tracks', ownerRows(tables.tracks, ['created_by'], ownerId))

  for (const entry of media.entries) {
    const bytes = await readFile(resolve(exportDirectory, entry.bundlePath))
    const { error } = await admin.storage
      .from(entry.bucketId)
      .upload(entry.objectPath, bytes, { contentType: entry.mediaType, upsert: false })
    if (error) throw new Error(`Portable media upload failed for ${entry.id}: ${error.message}`)
  }
  const mediaRows = media.entries.map((entry) => ({
    id: entry.id,
    release_id: entry.releaseId,
    track_id: entry.trackId,
    lesson_id: null,
    source_media_id: null,
    kind: entry.kind,
    bucket_id: entry.bucketId,
    object_path: entry.objectPath,
    media_type: entry.mediaType,
    byte_size: entry.byteSize,
    sha256: entry.sha256,
    status: 'ready',
    is_public: entry.isPublic,
    created_by: ownerId,
    metadata: entry.metadata as Json,
    processing_profile_version: entry.processingProfileVersion,
    derivative_key: entry.derivativeKey,
  }))
  if (mediaRows.length) {
    const { error } = await admin.from('media_objects').insert(mediaRows as never)
    if (error) throw new Error(`Portable media records failed: ${error.message}`)
  }
  for (const entry of media.entries) {
    if (!entry.sourceMediaId) continue
    const { error } = await admin
      .from('media_objects')
      .update({ source_media_id: entry.sourceMediaId })
      .eq('id', entry.id)
    if (error) throw new Error(`Portable media lineage failed: ${error.message}`)
  }
  for (const release of tables.releases) {
    if (!release.artwork_media_id) continue
    const { error } = await admin
      .from('releases')
      .update({ artwork_media_id: String(release.artwork_media_id) })
      .eq('id', String(release.id))
    if (error) throw new Error(`Portable release artwork failed: ${error.message}`)
  }

  await writeRows(admin, 'release_tracks', tables.release_tracks)
  await writeRows(admin, 'collections', ownerRows(tables.collections, ['created_by'], ownerId))
  await writeRows(admin, 'collection_tracks', tables.collection_tracks)
  await writeRows(admin, 'catalog_credits', tables.catalog_credits)
  await writeRows(admin, 'catalog_taxonomies', tables.catalog_taxonomies)
  await writeRows(admin, 'catalog_terms', tables.catalog_terms)
  await writeRows(admin, 'catalog_term_assignments', tables.catalog_term_assignments)

  await writeRows(
    admin,
    'membership_tiers',
    ownerRows(tables.membership_tiers, ['created_by'], ownerId),
  )
  await writeRows(admin, 'products', ownerRows(tables.products, ['created_by'], ownerId))
  await writeRows(
    admin,
    'prices',
    tables.prices.map((row) => ({
      ...row,
      external_price_id: null,
      external_product_id: null,
    })),
  )

  await writeRows(
    admin,
    'license_templates',
    ownerRows(
      tables.license_templates.map((row) => ({ ...row, current_version_id: null })),
      ['created_by'],
      ownerId,
    ),
  )
  await writeRows(
    admin,
    'license_template_versions',
    ownerRows(tables.license_template_versions, ['created_by'], ownerId),
  )
  await writeRows(admin, 'license_options', tables.license_options)
  for (const template of tables.license_templates) {
    if (!template.current_version_id) continue
    const { error } = await admin
      .from('license_templates')
      .update({ current_version_id: String(template.current_version_id) })
      .eq('id', String(template.id))
    if (error) throw new Error(`Portable license version authority failed: ${error.message}`)
  }
  await writeRows(admin, 'license_offers', tables.license_offers)

  await writeRows(
    admin,
    'learning_areas',
    ownerRows(tables.learning_areas, ['created_by'], ownerId),
  )
  await writeRows(
    admin,
    'learning_paths',
    ownerRows(tables.learning_paths, ['created_by'], ownerId),
  )
  await writeRows(admin, 'courses', tables.courses)
  await writeRows(admin, 'lessons', tables.lessons)
  await writeRows(admin, 'videos', ownerRows(tables.videos, ['created_by'], ownerId))
  await writeRows(admin, 'lesson_sections', tables.lesson_sections)
  await writeRows(
    admin,
    'editorial_posts',
    ownerRows(tables.editorial_posts, ['created_by'], ownerId),
  )
  for (const entry of media.entries) {
    if (!entry.lessonId) continue
    const { error } = await admin
      .from('media_objects')
      .update({ lesson_id: entry.lessonId })
      .eq('id', entry.id)
    if (error) throw new Error(`Portable lesson media link failed: ${error.message}`)
  }
  await writeRows(
    admin,
    'telemetry_settings',
    ownerRows(tables.telemetry_settings, ['updated_by'], ownerId),
    { upsert: true, onConflict: 'id' },
  )
}

async function verifyRestoredProjection(
  status: ReturnType<typeof getLocalStatus>,
  content: PortableContent,
  media: PortableMedia,
) {
  const anonymous = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: config, error: configError } = await anonymous
    .from('site_config_versions')
    .select('config')
    .eq('installation_key', 'primary')
    .eq('status', 'published')
    .single()
  if (configError || contentHash(config.config) !== contentHash(content.artistConfig)) {
    throw new Error('Restored public artist configuration differs from the export.')
  }

  const restoredTables = Object.keys(portableColumns) as PortableTableName[]
  const admin = createAdminClient(status)
  for (const table of restoredTables) {
    const expected = content.tables[table].length
    const { data, error } = await admin.from(table).select('*')
    if (error || data.length !== expected) {
      throw new Error(`Restored ${table} count differs from the export.`)
    }
  }

  const anonymousSurfaces: PortableTableName[] = ['pages', 'releases', 'tracks', 'collections']
  for (const table of anonymousSurfaces) {
    const expectedIds = new Set(
      content.tables[table]
        .map(({ id }) => id)
        .filter((id): id is string => typeof id === 'string'),
    )
    const { data, error } = await anonymous.from(table).select('id')
    if (error || (expectedIds.size > 0 && data.length === 0)) {
      throw new Error(`Restored public ${table} is not anonymously readable.`)
    }
    if (data.some(({ id }) => !expectedIds.has(id))) {
      throw new Error(`Restored public ${table} exposed an unexpected record.`)
    }
  }

  for (const entry of media.entries) {
    const { data, error } = await admin.storage.from(entry.bucketId).download(entry.objectPath)
    if (error || !data) throw new Error(`Restored media ${entry.id} cannot be retrieved.`)
    const bytes = Buffer.from(await data.arrayBuffer())
    if (bytes.byteLength !== entry.byteSize || sha256(bytes) !== entry.sha256) {
      throw new Error(`Restored media ${entry.id} differs from the export.`)
    }
    if (entry.isPublic) {
      const { data: publicObject, error: publicError } = await anonymous.storage
        .from(entry.bucketId)
        .download(entry.objectPath)
      if (publicError || !publicObject) {
        throw new Error(`Restored public media ${entry.id} is not anonymously readable.`)
      }
    }
  }
  return {
    configuration: 'equivalent',
    restoredTables: restoredTables.length,
    anonymousSurfaces: anonymousSurfaces.length,
    publicRecords: restoredTables.reduce((sum, table) => sum + content.tables[table].length, 0),
    media: media.entries.length,
  }
}

let result
try {
  runSupabase(['db', 'reset', '--local'], { capture: true })
  const status = getLocalStatus()
  const admin = createAdminClient(status)
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: 'portable-owner@local.invalid',
    password: 'portable-local-check-only-password',
    email_confirm: true,
    user_metadata: { display_name: 'Portable restore owner' },
  })
  if (userError || !userData.user) throw new Error('Could not create the disposable restore owner.')
  const { error: ownerError } = await admin.rpc('bootstrap_owner', {
    target_user_id: userData.user.id,
  })
  if (ownerError) throw new Error('Could not authorize the disposable restore owner.')

  await restoreContent(admin, userData.user.id, portable.content, portable.media)
  const projection = await verifyRestoredProjection(status, portable.content, portable.media)
  result = {
    event: 'artist-restore-checked',
    exportId: portable.manifest.exportId,
    snapshotHash: portable.manifest.snapshotHash,
    restoreTarget: 'disposable-local',
    projection,
    externalAccounts: portable.services.reconnect.map(({ service, runbook }) => ({
      service,
      status: 'approval-required',
      runbook,
    })),
  }
} catch (error) {
  throw new Error(`Artist restore check failed: ${safeSupabaseError(error)}`, { cause: error })
} finally {
  run(process.execPath, ['scripts/reset-local-demo.mjs'], { capture: true })
}

if (process.argv.includes('--json')) console.log(JSON.stringify(result))
else {
  console.log(`Artist restore check: PASS — ${result.exportId}`)
  console.log(`Public records: ${result.projection.publicRecords}`)
  console.log(`Bundled media restored and hashed: ${result.projection.media}`)
  console.log('Original fictional demonstration: RESTORED')
  console.log('External accounts: APPROVAL REQUIRED — use the listed service runbooks')
}
