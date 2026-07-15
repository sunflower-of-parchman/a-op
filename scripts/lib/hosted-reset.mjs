import { createHash } from 'node:crypto'
import { readFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot, runSupabase, writePrivateFile } from './command.mjs'
import {
  createAdminClient,
  isLocalSupabaseUrl,
  seedAuthorizationDemonstration,
  seedDemonstrationArtist,
  verifyAuthorizationDemonstration,
  verifyPublicDemonstration,
} from './local-supabase.mjs'

export const hostedResetVersion = '2026-07-15.1'
export const expectedSchemaVersion = '20260715070000'

export const hostedStorageBuckets = [
  'artwork',
  'preview-media',
  'source-audio',
  'downloads',
  'license-documents',
  'lesson-media',
  'administrative',
]

export const resetApplicationTables = [
  'analytics_events',
  'app_roles',
  'audit_records',
  'catalog_credits',
  'catalog_taxonomies',
  'catalog_term_assignments',
  'catalog_terms',
  'checkout_intents',
  'collection_drafts',
  'collection_tracks',
  'collections',
  'contact_messages',
  'courses',
  'download_records',
  'editorial_drafts',
  'editorial_posts',
  'entitlement_grants',
  'favorites',
  'issued_licenses',
  'learning_areas',
  'learning_path_drafts',
  'learning_paths',
  'lesson_progress',
  'lesson_sections',
  'lessons',
  'license_document_jobs',
  'license_offers',
  'license_options',
  'license_selections',
  'license_template_versions',
  'license_templates',
  'listening_history',
  'media_jobs',
  'media_objects',
  'membership_tiers',
  'operational_checks',
  'operational_events',
  'order_items',
  'orders',
  'pages',
  'payment_customers',
  'payment_events',
  'playlist_tracks',
  'playlists',
  'prices',
  'products',
  'profiles',
  'refunds',
  'release_drafts',
  'release_tracks',
  'releases',
  'site_config_versions',
  'subscriptions',
  'tracks',
  'upload_intents',
  'video_drafts',
  'videos',
  'webhook_failures',
]

const fixtureKeys = ['owner', 'editor', 'customerOne', 'customerTwo']
const fixtureRoles = new Map([
  ['owner', 'owner'],
  ['editor', 'editor'],
  ['customerOne', 'customer'],
  ['customerTwo', 'customer'],
])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function projectRefSha256(projectRef) {
  return sha256(projectRef)
}

export function confirmationForProjectRef(operation, projectRef) {
  const label = operation === 'initialize' ? 'INITIALIZE' : 'RESET'
  return `${label}-${projectRefSha256(projectRef).slice(0, 16)}`
}

export function assertConfirmation(operation, projectRef, confirmation) {
  if (operation === 'check') return
  const expected = confirmationForProjectRef(operation, projectRef)
  if (confirmation !== expected) {
    throw new Error(`Hosted ${operation} refused: exact derived confirmation is required.`)
  }
}

export function assertHostedTarget({
  status,
  projectRef,
  linkedProjectRef,
  allowLocalTest = false,
}) {
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error('Hosted operation refused: the project reference format is invalid.')
  }
  if (!status?.apiUrl || !status?.publishableKey || !status?.secretKey) {
    throw new Error('Hosted operation refused: Supabase connection values are incomplete.')
  }

  if (isLocalSupabaseUrl(status.apiUrl)) {
    if (!allowLocalTest) {
      throw new Error('Hosted operation refused: a local Supabase target is not permitted.')
    }
  } else {
    const url = new URL(status.apiUrl)
    if (url.protocol !== 'https:' || url.hostname !== `${projectRef}.supabase.co`) {
      throw new Error('Hosted operation refused: the API URL does not match the approved project.')
    }
  }

  if (linkedProjectRef !== projectRef) {
    throw new Error('Hosted operation refused: the linked Supabase project does not match.')
  }
}

export function validateHostedFixture(fixture, projectRef) {
  if (
    !fixture ||
    fixture.localOnly !== false ||
    fixture.projectRef !== projectRef ||
    !Array.isArray(fixture.accounts) ||
    fixture.accounts.length !== fixtureKeys.length
  ) {
    throw new Error('Hosted operation refused: the private account fixture is invalid.')
  }

  const byKey = new Map(fixture.accounts.map((account) => [account.key, account]))
  const emails = new Set()
  for (const key of fixtureKeys) {
    const account = byKey.get(key)
    if (
      !account ||
      account.role !== fixtureRoles.get(key) ||
      typeof account.email !== 'string' ||
      typeof account.password !== 'string' ||
      typeof account.displayName !== 'string' ||
      account.displayName.trim().length === 0 ||
      account.password.length < 12 ||
      /replace|placeholder/i.test(account.password) ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account.email) ||
      account.email.toLowerCase().endsWith('.local')
    ) {
      throw new Error(`Hosted operation refused: the ${key} account is invalid.`)
    }
    const email = account.email.toLowerCase()
    if (emails.has(email)) {
      throw new Error('Hosted operation refused: fixture emails must be unique.')
    }
    emails.add(email)
  }

  if (byKey.size !== fixtureKeys.length) {
    throw new Error('Hosted operation refused: fixture account keys must be exact.')
  }
  return fixture
}

export function assertProjectMarker(metadata, projectRef, { mayBeAbsent = false } = {}) {
  const actual = metadata.get('judging_project_ref_sha256')
  if (mayBeAbsent && actual === undefined) return
  if (actual !== projectRefSha256(projectRef)) {
    throw new Error('Hosted operation refused: the database project marker does not match.')
  }
}

export function assertFixtureAccountSet(users, fixture, { allowEmpty = false } = {}) {
  const actual = users
    .map((user) => user.email?.toLowerCase())
    .filter(Boolean)
    .sort()
  const expected = fixture.accounts.map((account) => account.email.toLowerCase()).sort()
  if (allowEmpty && actual.length === 0) return
  if (
    actual.length !== expected.length ||
    actual.some((email, index) => email !== expected[index])
  ) {
    throw new Error('Hosted operation refused: the Auth account set is not the exact fixture set.')
  }
}

async function selectRows(admin, table, columns) {
  const { data, error } = await admin.from(table).select(columns)
  if (error) throw new Error(`Could not inspect ${table} for hosted reset.`)
  return data ?? []
}

export async function readInstallationMetadata(admin) {
  const rows = await selectRows(admin, 'installation_metadata', 'key,value')
  return new Map(rows.map((row) => [row.key, row.value]))
}

export async function listAuthUsers(admin) {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error('Could not inspect Auth users for hosted reset.')
    const current = data?.users ?? []
    users.push(...current)
    if (current.length < 1000) return users
  }
}

async function assertEmptyApplication(admin) {
  for (const table of resetApplicationTables) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true })
    if (error) throw new Error(`Could not inspect ${table} before hosted initialization.`)
    if ((count ?? 0) !== 0) {
      throw new Error('Hosted initialization refused: the application database is not empty.')
    }
  }

  const { count, error } = await admin
    .from('telemetry_settings')
    .select('*', { count: 'exact', head: true })
  if (error || count !== 1) {
    throw new Error(
      'Hosted initialization refused: migration defaults are not in the expected state.',
    )
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

function stableRows(rows) {
  return rows
    .map(canonicalize)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

export async function readProviderMappings(admin) {
  const [products, prices] = await Promise.all([
    selectRows(admin, 'products', 'id,slug'),
    selectRows(
      admin,
      'prices',
      'id,product_id,currency,amount_minor,billing_interval,external_product_id,external_price_id',
    ),
  ])
  const productSlugs = new Map(products.map((product) => [product.id, product.slug]))
  return prices
    .filter((price) => price.external_product_id && price.external_price_id)
    .map((price) => ({
      productSlug: productSlugs.get(price.product_id),
      currency: price.currency,
      amountMinor: price.amount_minor,
      billingInterval: price.billing_interval,
      externalProductId: price.external_product_id,
      externalPriceId: price.external_price_id,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

async function restoreProviderMappings(admin, mappings) {
  if (mappings.length === 0) return
  const [products, prices] = await Promise.all([
    selectRows(admin, 'products', 'id,slug'),
    selectRows(admin, 'prices', 'id,product_id,currency,amount_minor,billing_interval'),
  ])
  const productSlugs = new Map(products.map((product) => [product.id, product.slug]))

  for (const mapping of mappings) {
    const price = prices.find(
      (candidate) =>
        productSlugs.get(candidate.product_id) === mapping.productSlug &&
        candidate.currency === mapping.currency &&
        candidate.amount_minor === mapping.amountMinor &&
        candidate.billing_interval === mapping.billingInterval,
    )
    if (!price) {
      throw new Error('Could not restore a preserved Stripe price mapping after hosted reset.')
    }
    const { error } = await admin
      .from('prices')
      .update({
        external_product_id: mapping.externalProductId,
        external_price_id: mapping.externalPriceId,
      })
      .eq('id', price.id)
    if (error) throw new Error('Could not restore preserved Stripe price mappings.')
  }
}

export async function buildFixtureFingerprint(admin) {
  const selections = [
    ['site_config_versions', 'installation_key,status,config_schema_version,config'],
    ['pages', 'id,slug,title,navigation_label,status,seo,sections'],
    ['releases', 'id,slug,title,description,release_date,state,sort_order'],
    [
      'tracks',
      'id,slug,title,description,primary_release_id,duration_ms,musical_key,meter,tempo_bpm,mood,instruments,state',
    ],
    ['release_tracks', 'release_id,track_id,disc_number,position'],
    ['collections', 'id,slug,title,description,state,sort_order'],
    ['collection_tracks', 'collection_id,track_id,position,note'],
    ['catalog_credits', 'resource_type,resource_id,role,name,position'],
    ['catalog_taxonomies', 'id,key,label'],
    ['catalog_terms', 'id,taxonomy_id,slug,label,sort_order'],
    ['catalog_term_assignments', 'term_id,resource_type,resource_id'],
    [
      'products',
      'slug,product_type,name,description,resource_type,purchase_mode,external_url,state,sort_order',
    ],
    ['membership_tiers', 'id,slug,name,description,benefits,state,sort_order'],
    [
      'media_objects',
      'id,release_id,track_id,lesson_id,kind,bucket_id,object_path,media_type,byte_size,sha256,status,is_public,metadata,processing_profile_version,derivative_key',
    ],
    ['learning_areas', 'id,slug,name,description,state,sort_order'],
    ['learning_paths', 'id,area_id,slug,title,summary,introduction,state,sort_order'],
    ['courses', 'id,path_id,slug,title,summary,position,state'],
    [
      'lessons',
      'id,course_id,slug,title,summary,estimated_minutes,access_mode,access_explanation,membership_tier_id,entitlement_product_id,position,state',
    ],
    ['lesson_sections', 'id,lesson_id,section_type,content,media_object_id,video_id,position'],
    [
      'videos',
      'id,slug,title,summary,provider,external_id,hosted_media_id,poster_url,transcript,credits,state',
    ],
    ['editorial_posts', 'id,kind,slug,title,summary,published_on,sections,state'],
  ]

  const entries = await Promise.all(
    selections.map(async ([table, columns]) => [
      table,
      stableRows(await selectRows(admin, table, columns)),
    ]),
  )
  const products = await selectRows(admin, 'products', 'id,slug')
  const productSlugs = new Map(products.map((product) => [product.id, product.slug]))
  const prices = (
    await selectRows(admin, 'prices', 'product_id,currency,amount_minor,billing_interval,active')
  ).map((price) => ({ ...price, product_id: productSlugs.get(price.product_id) }))

  const templates = await selectRows(
    admin,
    'license_templates',
    'id,track_id,slug,name,summary,state',
  )
  const templateSlugs = new Map(templates.map((template) => [template.id, template.slug]))
  const versions = await selectRows(
    admin,
    'license_template_versions',
    'id,template_id,version_number,title,introduction,general_terms,disclaimer',
  )
  const versionKeys = new Map(
    versions.map((version) => [
      version.id,
      `${templateSlugs.get(version.template_id)}:${version.version_number}`,
    ]),
  )
  const options = (
    await selectRows(
      admin,
      'license_options',
      'template_version_id,option_key,label,description,usage_category,allowed_media,audience_label,max_audience,distribution_label,max_copies,term_months,territory,attribution_required,attribution_text,exclusive,currency,amount_minor,sort_order',
    )
  ).map((option) => ({
    ...option,
    template_version_id: versionKeys.get(option.template_version_id),
  }))

  const canonical = canonicalize({
    version: hostedResetVersion,
    tables: Object.fromEntries(entries),
    prices: stableRows(prices),
    licenseTemplates: stableRows(
      templates.map((template) => {
        const normalized = { ...template }
        delete normalized.id
        return normalized
      }),
    ),
    licenseVersions: stableRows(
      versions.map((version) => {
        const normalized = {
          ...version,
          template: templateSlugs.get(version.template_id),
        }
        delete normalized.id
        delete normalized.template_id
        return normalized
      }),
    ),
    licenseOptions: stableRows(options),
  })
  return sha256(JSON.stringify(canonical))
}

async function storeFingerprint(admin, fingerprint) {
  const now = new Date().toISOString()
  const { error } = await admin.from('installation_metadata').upsert([
    { key: 'hosted_fixture_fingerprint', value: fingerprint, updated_at: now },
    { key: 'hosted_reset_version', value: hostedResetVersion, updated_at: now },
  ])
  if (error) throw new Error('Could not record the hosted fixture fingerprint.')
}

async function listBucketObjects(bucket, prefix = '') {
  const paths = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error('Could not inspect a hosted storage bucket.')
    const entries = data ?? []
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) paths.push(path)
      else paths.push(...(await listBucketObjects(bucket, path)))
    }
    if (entries.length < 100) return paths
  }
}

async function clearHostedStorage(admin) {
  let removed = 0
  for (const bucketName of hostedStorageBuckets) {
    const bucket = admin.storage.from(bucketName)
    const paths = await listBucketObjects(bucket)
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100)
      const { error } = await bucket.remove(batch)
      if (error) throw new Error('Could not clear a dedicated hosted storage bucket.')
      removed += batch.length
    }
  }
  return removed
}

async function countHostedStorage(admin) {
  let count = 0
  for (const bucketName of hostedStorageBuckets) {
    count += (await listBucketObjects(admin.storage.from(bucketName))).length
  }
  return count
}

async function deleteFixtureUsers(admin, users) {
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw new Error('Could not rotate a hosted fixture identity.')
  }
}

export function createHostedSqlExecutor({ target = 'linked' } = {}) {
  if (!['linked', 'local'].includes(target)) throw new Error('Unknown hosted SQL target.')
  return async (operation, replacements) => {
    const templatePath = resolve(
      projectRoot,
      `scripts/sql/${operation === 'initialize' ? 'initialize' : 'reset'}-hosted-judge.sql`,
    )
    let sql = readFileSync(templatePath, 'utf8')
    for (const [key, value] of Object.entries(replacements)) {
      if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
        throw new Error('Hosted SQL rendering refused an unsafe replacement.')
      }
      sql = sql.replaceAll(`__${key}__`, value)
    }
    if (/__[A-Z_]+__/.test(sql)) throw new Error('Hosted SQL rendering left an unresolved value.')

    const renderedPath = resolve(
      process.env.TMPDIR || '/tmp',
      `artist-owned-hosted-${operation}-${process.pid}.sql`,
    )
    writePrivateFile(renderedPath, sql)
    try {
      runSupabase(['db', 'query', `--${target}`, '--file', renderedPath], { capture: true })
    } finally {
      unlinkSync(renderedPath)
    }
  }
}

function safeResult(operation, projectRef, fingerprint, details = {}) {
  return {
    status: 'pass',
    operation,
    resetVersion: hostedResetVersion,
    projectRefSha256: projectRefSha256(projectRef),
    fixtureFingerprint: fingerprint,
    ...details,
  }
}

export async function performHostedReset({
  operation,
  projectRef,
  confirmation,
  fixture,
  status,
  linkedProjectRef,
  executeSql,
  allowLocalTest = false,
}) {
  if (!['initialize', 'check', 'reset'].includes(operation)) {
    throw new Error('Hosted operation must be initialize, check, or reset.')
  }
  assertHostedTarget({ status, projectRef, linkedProjectRef, allowLocalTest })
  assertConfirmation(operation, projectRef, confirmation)
  validateHostedFixture(fixture, projectRef)

  const admin = createAdminClient(status)
  const metadata = await readInstallationMetadata(admin)
  if (metadata.get('schema_version') !== expectedSchemaVersion) {
    throw new Error('Hosted operation refused: the application schema version is not exact.')
  }

  if (operation === 'initialize') {
    assertProjectMarker(metadata, projectRef, { mayBeAbsent: true })
    if (metadata.has('judging_project_ref_sha256')) {
      throw new Error('Hosted initialization refused: the project is already initialized.')
    }
    const users = await listAuthUsers(admin)
    assertFixtureAccountSet(users, fixture, { allowEmpty: true })
    if (users.length !== 0) {
      throw new Error('Hosted initialization refused: Auth must be empty.')
    }
    await assertEmptyApplication(admin)
    if ((await countHostedStorage(admin)) !== 0) {
      throw new Error('Hosted initialization refused: the dedicated storage buckets are not empty.')
    }
    await executeSql('initialize', {
      SCHEMA_VERSION: expectedSchemaVersion,
      PROJECT_REF_SHA256: projectRefSha256(projectRef),
      RESET_VERSION: hostedResetVersion,
    })
    await seedDemonstrationArtist(status)
    await seedAuthorizationDemonstration(status, { fixture, allowHosted: true })
    const fingerprint = await buildFixtureFingerprint(admin)
    await storeFingerprint(admin, fingerprint)
    await verifyPublicDemonstration(status)
    await verifyAuthorizationDemonstration(status)
    const createdUsers = await listAuthUsers(admin)
    assertFixtureAccountSet(createdUsers, fixture)
    return safeResult(operation, projectRef, fingerprint, {
      accountCount: createdUsers.length,
      providerMappingCount: 0,
      storageObjectCount: await countHostedStorage(admin),
      sessionsRotated: false,
    })
  }

  assertProjectMarker(metadata, projectRef)
  const storedFingerprint = metadata.get('hosted_fixture_fingerprint')
  if (!/^[a-f0-9]{64}$/.test(storedFingerprint ?? '')) {
    throw new Error('Hosted operation refused: the fixture fingerprint marker is missing.')
  }
  const currentFingerprint = await buildFixtureFingerprint(admin)
  if (currentFingerprint !== storedFingerprint) {
    throw new Error('Hosted operation refused: the fixture data fingerprint is not recognized.')
  }
  const users = await listAuthUsers(admin)
  assertFixtureAccountSet(users, fixture)

  if (operation === 'check') {
    await verifyPublicDemonstration(status)
    await verifyAuthorizationDemonstration(status)
    return safeResult(operation, projectRef, currentFingerprint, {
      accountCount: users.length,
      providerMappingCount: (await readProviderMappings(admin)).length,
      storageObjectCount: await countHostedStorage(admin),
      sessionsRotated: false,
    })
  }

  const providerMappings = await readProviderMappings(admin)
  const priorUserIds = new Set(users.map((user) => user.id))
  await executeSql('reset', {
    SCHEMA_VERSION: expectedSchemaVersion,
    PROJECT_REF_SHA256: projectRefSha256(projectRef),
    RESET_VERSION: hostedResetVersion,
  })
  const storageObjectCount = await clearHostedStorage(admin)
  await deleteFixtureUsers(admin, users)
  await seedDemonstrationArtist(status)
  await seedAuthorizationDemonstration(status, { fixture, allowHosted: true })
  await restoreProviderMappings(admin, providerMappings)

  const nextFingerprint = await buildFixtureFingerprint(admin)
  if (nextFingerprint !== storedFingerprint) {
    throw new Error('Hosted reset failed: the restored fixture fingerprint changed.')
  }
  await storeFingerprint(admin, nextFingerprint)
  await verifyPublicDemonstration(status)
  await verifyAuthorizationDemonstration(status)

  const nextUsers = await listAuthUsers(admin)
  assertFixtureAccountSet(nextUsers, fixture)
  const sessionsRotated = nextUsers.every((user) => !priorUserIds.has(user.id))
  if (!sessionsRotated) throw new Error('Hosted reset failed: fixture sessions were not rotated.')

  return safeResult(operation, projectRef, nextFingerprint, {
    accountCount: nextUsers.length,
    providerMappingCount: providerMappings.length,
    storageObjectCount: await countHostedStorage(admin),
    removedStorageObjectCount: storageObjectCount,
    sessionsRotated,
  })
}
