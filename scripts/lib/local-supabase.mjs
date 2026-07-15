import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  projectRoot,
  readJson,
  redactOutput,
  run,
  runSupabase,
  writePrivateFile,
} from './command.mjs'

const bootstrapConfigPath = resolve(projectRoot, 'content/demo/bootstrap-config.json')
const demoAccountsPath = resolve(projectRoot, 'content/demo/accounts.json')
const environmentPath = resolve(projectRoot, '.env')

export function isLocalSupabaseUrl(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.replace(/^\[|\]$/g, ''))
    )
  } catch {
    return false
  }
}

export const demoFixtureIds = {
  release: '10000000-0000-4000-8000-000000000001',
  preview: '10000000-0000-4000-8000-000000000002',
  download: '10000000-0000-4000-8000-000000000003',
  product: '10000000-0000-4000-8000-000000000004',
  price: '10000000-0000-4000-8000-000000000005',
  aboutPage: '10000000-0000-4000-8000-000000000006',
  contactPage: '10000000-0000-4000-8000-000000000007',
  trackOne: '10000000-0000-4000-8000-000000000008',
  trackTwo: '10000000-0000-4000-8000-000000000009',
  trackThree: '10000000-0000-4000-8000-00000000000a',
  collection: '10000000-0000-4000-8000-00000000000b',
  taxonomy: '10000000-0000-4000-8000-00000000000c',
  taxonomyTerm: '10000000-0000-4000-8000-00000000000d',
  previewTwo: '10000000-0000-4000-8000-00000000000e',
  previewThree: '10000000-0000-4000-8000-00000000000f',
  membershipTier: '10000000-0000-4000-8000-000000000010',
  membershipProduct: '10000000-0000-4000-8000-000000000011',
  membershipPrice: '10000000-0000-4000-8000-000000000012',
  freeProduct: '10000000-0000-4000-8000-000000000013',
  freePrice: '10000000-0000-4000-8000-000000000014',
  externalProduct: '10000000-0000-4000-8000-000000000015',
  learningArea: '10000000-0000-4000-8000-000000000016',
  learningPath: '10000000-0000-4000-8000-000000000017',
  learningCourse: '10000000-0000-4000-8000-000000000018',
  lessonOne: '10000000-0000-4000-8000-000000000019',
  lessonTwo: '10000000-0000-4000-8000-00000000001a',
  lessonThree: '10000000-0000-4000-8000-00000000001b',
  lessonImage: '10000000-0000-4000-8000-00000000001c',
  lessonResource: '10000000-0000-4000-8000-00000000001d',
  video: '10000000-0000-4000-8000-00000000001e',
  editorial: '10000000-0000-4000-8000-00000000001f',
  lessonSectionOne: '10000000-0000-4000-8000-000000000020',
  lessonSectionTwo: '10000000-0000-4000-8000-000000000021',
  lessonSectionThree: '10000000-0000-4000-8000-000000000022',
  lessonSectionFour: '10000000-0000-4000-8000-000000000023',
  lessonSectionFive: '10000000-0000-4000-8000-000000000024',
  lessonSectionSix: '10000000-0000-4000-8000-000000000025',
  lessonSectionSeven: '10000000-0000-4000-8000-000000000026',
  lessonSectionEight: '10000000-0000-4000-8000-000000000027',
  lessonSectionNine: '10000000-0000-4000-8000-000000000028',
}

export function createAdminClient(status) {
  return createClient(status.apiUrl, status.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function fetchLocalService(url, options = {}, attempts = 12) {
  let lastError
  let lastStatus

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options)
      if (response.status < 500) return response
      lastStatus = response.status
      await response.arrayBuffer()
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(250 * (attempt + 1), 1_000)))
  }

  if (lastStatus) {
    throw new Error(`Local Supabase service did not recover after reset (HTTP ${lastStatus}).`)
  }
  throw new Error(
    `Local Supabase service did not recover after reset (${lastError?.code ?? 'unavailable'}).`,
  )
}

export async function waitForLocalAuth(status, attempts = 90) {
  if (!isLocalSupabaseUrl(status.apiUrl)) {
    throw new Error('Refusing to poll Auth because the active Supabase project is not local.')
  }

  const response = await fetchLocalService(
    `${status.apiUrl}/auth/v1/health`,
    { headers: { apikey: status.publishableKey } },
    attempts,
  )
  if (!response.ok) {
    throw new Error(`Local Auth health check failed with HTTP ${response.status}.`)
  }
}

export async function recoverLocalAuthGateway(status) {
  try {
    await waitForLocalAuth(status, 3)
    return
  } catch {
    const supabaseConfig = readFileSync(resolve(projectRoot, 'supabase/config.toml'), 'utf8')
    const projectId = supabaseConfig.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"$/m)?.[1]
    if (!projectId) {
      throw new Error('Could not determine the local Supabase project identifier.')
    }

    run('docker', ['restart', `supabase_kong_${projectId}`], { capture: true })
  }

  await waitForLocalAuth(status)
}

export async function ensureLocalUser(admin, attributes) {
  let lastError
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data, error } = await admin.auth.admin.createUser(attributes)
    if (!error && data.user) return data.user
    lastError = error

    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const user = existing?.users.find(
      ({ email }) => email?.toLowerCase() === attributes.email.toLowerCase(),
    )
    if (user) return user

    await new Promise((resolve) => setTimeout(resolve, Math.min(250 * (attempt + 1), 1_000)))
  }

  const safeCode = lastError?.code ?? lastError?.status ?? 'unavailable'
  throw new Error(`Local Auth did not recover after reset (${safeCode}).`)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function createPreviewWave(frequency = 440) {
  const sampleRate = 8000
  const seconds = 1
  const samples = sampleRate * seconds
  const dataSize = samples * 2
  const wave = Buffer.alloc(44 + dataSize)

  wave.write('RIFF', 0)
  wave.writeUInt32LE(36 + dataSize, 4)
  wave.write('WAVE', 8)
  wave.write('fmt ', 12)
  wave.writeUInt32LE(16, 16)
  wave.writeUInt16LE(1, 20)
  wave.writeUInt16LE(1, 22)
  wave.writeUInt32LE(sampleRate, 24)
  wave.writeUInt32LE(sampleRate * 2, 28)
  wave.writeUInt16LE(2, 32)
  wave.writeUInt16LE(16, 34)
  wave.write('data', 36)
  wave.writeUInt32LE(dataSize, 40)

  for (let sample = 0; sample < samples; sample += 1) {
    const time = sample / sampleRate
    const fade = Math.min(1, sample / 400, (samples - sample) / 400)
    const value = Math.round(Math.sin(2 * Math.PI * frequency * time) * 2600 * fade)
    wave.writeInt16LE(value, 44 + sample * 2)
  }

  return wave
}

function normalizeKey(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function findStatusValue(input, candidates) {
  const wanted = new Set(candidates.map(normalizeKey))
  const queue = [input]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') continue

    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(normalizeKey(key)) && typeof value === 'string' && value.length > 0) {
        return value
      }
      if (value && typeof value === 'object') queue.push(value)
    }
  }

  return undefined
}

function parseStatusOutput(stdout) {
  const text = String(stdout).trim()
  const jsonStart = text.indexOf('{')
  if (jsonStart < 0) throw new Error('Supabase status did not return JSON.')
  return JSON.parse(text.slice(jsonStart))
}

export function getLocalStatus({ allowFailure = false } = {}) {
  const result = runSupabase(['status', '--output', 'json'], { capture: true, allowFailure })

  if (result.status !== 0) return null

  const raw = parseStatusOutput(result.stdout)
  const status = {
    apiUrl: findStatusValue(raw, ['API_URL', 'api.url']),
    studioUrl: findStatusValue(raw, ['STUDIO_URL', 'studio.url']),
    mailUrl: findStatusValue(raw, ['INBUCKET_URL', 'MAILPIT_URL', 'local_smtp.url']),
    publishableKey: findStatusValue(raw, ['PUBLISHABLE_KEY', 'ANON_KEY']),
    secretKey: findStatusValue(raw, ['SECRET_KEY', 'SERVICE_ROLE_KEY']),
  }

  if (!status.apiUrl || !status.publishableKey || !status.secretKey) {
    throw new Error('Supabase status omitted one or more required local connection fields.')
  }

  return status
}

function parseEnvironmentFile() {
  try {
    return readFileSync(environmentPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .reduce((result, line) => {
        const index = line.indexOf('=')
        if (index > 0 && !line.trimStart().startsWith('#')) {
          result[line.slice(0, index)] = line.slice(index + 1)
        }
        return result
      }, {})
  } catch {
    return {}
  }
}

export function writeLocalEnvironment(status) {
  const current = parseEnvironmentFile()
  const currentUrl = current.NUXT_PUBLIC_SUPABASE_URL

  if (currentUrl && !/^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/)/.test(currentUrl)) {
    throw new Error('Refusing to replace a non-local Supabase environment in .env.')
  }

  const values = {
    ...current,
    NUXT_PUBLIC_SUPABASE_URL: status.apiUrl,
    NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.publishableKey,
    NUXT_PUBLIC_DEMO_MODE: 'true',
    NUXT_SUPABASE_SECRET_KEY: status.secretKey,
    NUXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
  }

  const order = [
    'NUXT_PUBLIC_SUPABASE_URL',
    'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NUXT_PUBLIC_DEMO_MODE',
    'NUXT_SUPABASE_SECRET_KEY',
    'NUXT_PUBLIC_SITE_URL',
    ...Object.keys(values).filter(
      (key) =>
        ![
          'NUXT_PUBLIC_SUPABASE_URL',
          'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
          'NUXT_PUBLIC_DEMO_MODE',
          'NUXT_SUPABASE_SECRET_KEY',
          'NUXT_PUBLIC_SITE_URL',
        ].includes(key),
    ),
  ]

  writePrivateFile(environmentPath, `${order.map((key) => `${key}=${values[key]}`).join('\n')}\n`)
}

export async function seedDemonstrationArtist(status, { attempts = 12 } = {}) {
  const config = readJson(bootstrapConfigPath)
  const response = await fetchLocalService(
    `${status.apiUrl}/rest/v1/site_config_versions?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        apikey: status.secretKey,
        Authorization: `Bearer ${status.secretKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000001',
        installation_key: 'primary',
        status: 'published',
        config_schema_version: config.schemaVersion,
        config,
        published_at: '2026-07-14T00:00:00.000Z',
      }),
    },
    attempts,
  )

  if (!response.ok) {
    throw new Error(`Demonstration seed failed with HTTP ${response.status}.`)
  }
}

export async function seedAuthorizationDemonstration(
  status,
  { fixture = readJson(demoAccountsPath), allowHosted = false } = {},
) {
  const admin = createAdminClient(status)

  if (
    !Array.isArray(fixture.accounts) ||
    (allowHosted ? fixture.localOnly !== false : fixture.localOnly !== true)
  ) {
    throw new Error('The demonstration account fixture is invalid for this environment.')
  }

  const users = new Map()

  for (const account of fixture.accounts) {
    let user
    try {
      user = await ensureLocalUser(admin, {
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { display_name: account.displayName },
      })
    } catch (error) {
      const safeDetail = error instanceof Error ? ` ${error.message}` : ''
      throw new Error(`Could not create the ${account.key} demonstration account.${safeDetail}`, {
        cause: error,
      })
    }

    users.set(account.key, user.id)

    if (account.role === 'owner') {
      const { error: roleError } = await admin.rpc('bootstrap_owner', {
        target_user_id: user.id,
      })
      if (roleError) throw new Error('Could not bootstrap the demonstration owner account.')
    } else if (account.role === 'editor') {
      const { error: roleError } = await admin.from('app_roles').insert({
        user_id: user.id,
        role: 'editor',
        granted_by: users.get('owner'),
      })
      if (roleError) throw new Error('Could not seed the demonstration editor role.')
    }
  }

  const release = {
    id: demoFixtureIds.release,
    slug: 'lines-we-carry',
    title: 'Lines We Carry',
    description: 'A fictional release used to verify publication and protected fulfillment.',
    release_date: '2026-07-14',
    state: 'published',
    sort_order: 10,
    published_at: '2026-07-14T00:00:00.000Z',
    created_by: users.get('owner'),
  }
  const { error: releaseError } = await admin.from('releases').upsert(release)
  if (releaseError) throw new Error('Could not seed the demonstration release.')

  const trackFixtures = [
    {
      id: demoFixtureIds.trackOne,
      slug: 'first-light-repeated',
      title: 'First Light, Repeated',
      description: 'A fictional opening study in return and attention.',
      musical_key: 'D minor',
      meter: '4/4',
      tempo_bpm: 84,
      mood: 'Grounded',
      instruments: ['Piano'],
    },
    {
      id: demoFixtureIds.trackTwo,
      slug: 'a-measure-of-distance',
      title: 'A Measure of Distance',
      description: 'A fictional study in spacing and suspended arrival.',
      musical_key: 'A major',
      meter: '3/4',
      tempo_bpm: 72,
      mood: 'Spacious',
      instruments: ['Piano', 'Prepared strings'],
    },
    {
      id: demoFixtureIds.trackThree,
      slug: 'turn-toward-home',
      title: 'Turn Toward Home',
      description: 'A fictional closing study in weight and release.',
      musical_key: 'G major',
      meter: '6/8',
      tempo_bpm: 96,
      mood: 'Resolute',
      instruments: ['Piano'],
    },
  ].map((track) => ({
    ...track,
    primary_release_id: demoFixtureIds.release,
    duration_ms: 1000,
    state: 'published',
    published_at: '2026-07-14T00:00:00.000Z',
    created_by: users.get('owner'),
  }))
  const { error: trackError } = await admin.from('tracks').upsert(trackFixtures)
  if (trackError) throw new Error('Could not seed the demonstration tracks.')

  const { error: releaseTracksError } = await admin.from('release_tracks').upsert(
    trackFixtures.map((track, index) => ({
      release_id: demoFixtureIds.release,
      track_id: track.id,
      disc_number: 1,
      position: index + 1,
    })),
  )
  if (releaseTracksError) throw new Error('Could not seed the authored release order.')

  const { error: collectionError } = await admin.from('collections').upsert({
    id: demoFixtureIds.collection,
    slug: 'movement-studies',
    title: 'Movement Studies',
    description: 'The same fictional tracks in a separately authored collection order.',
    state: 'published',
    sort_order: 10,
    published_at: '2026-07-14T00:00:00.000Z',
    created_by: users.get('owner'),
  })
  if (collectionError) throw new Error('Could not seed the demonstration collection.')
  const { error: collectionTracksError } = await admin.from('collection_tracks').upsert([
    { collection_id: demoFixtureIds.collection, track_id: demoFixtureIds.trackThree, position: 1 },
    { collection_id: demoFixtureIds.collection, track_id: demoFixtureIds.trackOne, position: 2 },
  ])
  if (collectionTracksError) throw new Error('Could not seed the collection order.')

  const { error: taxonomyError } = await admin.from('catalog_taxonomies').upsert({
    id: demoFixtureIds.taxonomy,
    key: 'practice',
    label: 'Practice',
  })
  if (taxonomyError) throw new Error('Could not seed the catalog taxonomy.')
  const { error: termError } = await admin.from('catalog_terms').upsert({
    id: demoFixtureIds.taxonomyTerm,
    taxonomy_id: demoFixtureIds.taxonomy,
    slug: 'movement-study',
    label: 'Movement study',
    sort_order: 10,
  })
  if (termError) throw new Error('Could not seed the catalog term.')
  const { error: assignmentError } = await admin.from('catalog_term_assignments').upsert(
    trackFixtures.map((track) => ({
      term_id: demoFixtureIds.taxonomyTerm,
      resource_type: 'track',
      resource_id: track.id,
    })),
  )
  if (assignmentError) throw new Error('Could not seed the catalog term assignments.')

  const { error: creditsError } = await admin.from('catalog_credits').upsert([
    {
      resource_type: 'release',
      resource_id: demoFixtureIds.release,
      role: 'Music and performance',
      name: 'Daymark Assembly',
      position: 1,
    },
    {
      resource_type: 'track',
      resource_id: demoFixtureIds.trackOne,
      role: 'Piano',
      name: 'Daymark Assembly',
      position: 1,
    },
  ])
  if (creditsError) throw new Error('Could not seed the catalog credits.')

  const previewFixtures = [
    {
      id: demoFixtureIds.preview,
      trackId: demoFixtureIds.trackOne,
      path: 'gate-a/first-light-repeated-preview.wav',
      bytes: createPreviewWave(440),
    },
    {
      id: demoFixtureIds.previewTwo,
      trackId: demoFixtureIds.trackTwo,
      path: 'gate-a/a-measure-of-distance-preview.wav',
      bytes: createPreviewWave(554.37),
    },
    {
      id: demoFixtureIds.previewThree,
      trackId: demoFixtureIds.trackThree,
      path: 'gate-a/turn-toward-home-preview.wav',
      bytes: createPreviewWave(659.25),
    },
  ]
  const downloadBytes = Buffer.from(
    'Daymark Assembly local demonstration download. This fixture contains no private artist material.\n',
    'utf8',
  )
  const downloadPath = 'gate-a/lines-we-carry-download.txt'

  for (const preview of previewFixtures) {
    const { error: previewUploadError } = await admin.storage
      .from('preview-media')
      .upload(preview.path, preview.bytes, { contentType: 'audio/wav', upsert: true })
    if (previewUploadError) throw new Error('Could not upload a public preview fixture.')
  }

  const { error: downloadUploadError } = await admin.storage
    .from('downloads')
    .upload(downloadPath, downloadBytes, { contentType: 'text/plain', upsert: true })
  if (downloadUploadError) throw new Error('Could not upload the private download fixture.')

  const { error: mediaError } = await admin.from('media_objects').upsert([
    ...previewFixtures.map((preview) => ({
      id: preview.id,
      release_id: demoFixtureIds.release,
      track_id: preview.trackId,
      kind: 'preview_audio',
      bucket_id: 'preview-media',
      object_path: preview.path,
      media_type: 'audio/wav',
      byte_size: preview.bytes.byteLength,
      sha256: sha256(preview.bytes),
      status: 'ready',
      is_public: true,
      metadata: { generated: true, durationMs: 1000 },
      processing_profile_version: 'demo-generated-v1',
      derivative_key: `${sha256(preview.bytes)}:demo-generated-v1:preview`,
      created_by: users.get('owner'),
    })),
    {
      id: demoFixtureIds.download,
      release_id: demoFixtureIds.release,
      kind: 'download',
      bucket_id: 'downloads',
      object_path: downloadPath,
      media_type: 'text/plain',
      byte_size: downloadBytes.byteLength,
      sha256: sha256(downloadBytes),
      status: 'ready',
      is_public: false,
      metadata: { fixture: true },
      processing_profile_version: null,
      derivative_key: null,
      created_by: users.get('owner'),
    },
  ])
  if (mediaError) {
    throw new Error(
      `Could not seed the demonstration media records: ${redactOutput(mediaError.message)}`,
    )
  }

  const { error: productError } = await admin.from('products').upsert({
    id: demoFixtureIds.product,
    slug: 'lines-we-carry-download',
    product_type: 'album_download',
    name: 'Lines We Carry download',
    description: 'Local-only product used to verify idempotent fulfillment.',
    resource_type: 'release',
    resource_id: demoFixtureIds.release,
    state: 'published',
    created_by: users.get('owner'),
  })
  if (productError) throw new Error('Could not seed the demonstration product.')

  const { error: priceError } = await admin.from('prices').upsert({
    id: demoFixtureIds.price,
    product_id: demoFixtureIds.product,
    currency: 'USD',
    amount_minor: 1200,
    active: true,
  })
  if (priceError) throw new Error('Could not seed the demonstration price.')

  const { error: membershipTierError } = await admin.from('membership_tiers').upsert({
    id: demoFixtureIds.membershipTier,
    slug: 'daymark-circle',
    name: 'Daymark Circle',
    description: 'A fictional monthly membership for teaching and process notes.',
    benefits: ['Member learning path', 'Studio notes', 'Continuing access while active'],
    state: 'published',
    sort_order: 1,
    created_by: users.get('owner'),
  })
  if (membershipTierError) throw new Error('Could not seed the demonstration membership tier.')

  const { error: commerceProductsError } = await admin.from('products').upsert([
    {
      id: demoFixtureIds.membershipProduct,
      slug: 'daymark-circle-membership',
      product_type: 'membership',
      name: 'Daymark Circle membership',
      description: 'Monthly access to the fictional artist membership.',
      resource_type: 'membership',
      resource_id: demoFixtureIds.membershipTier,
      purchase_mode: 'stripe',
      state: 'published',
      sort_order: 2,
      created_by: users.get('owner'),
    },
    {
      id: demoFixtureIds.freeProduct,
      slug: 'turn-toward-home-listening-notes',
      product_type: 'track_download',
      name: 'Turn Toward Home listening notes',
      description: 'A free local demonstration entitlement.',
      resource_type: 'track',
      resource_id: demoFixtureIds.trackThree,
      purchase_mode: 'free',
      state: 'published',
      sort_order: 3,
      created_by: users.get('owner'),
    },
    {
      id: demoFixtureIds.externalProduct,
      slug: 'commission-inquiry',
      product_type: 'learning',
      name: 'Commission inquiry',
      description: 'An example of an artist-controlled external offering.',
      resource_type: 'release',
      resource_id: demoFixtureIds.release,
      purchase_mode: 'external',
      external_url: 'https://example.com/commissions',
      state: 'published',
      sort_order: 4,
      created_by: users.get('owner'),
    },
  ])
  if (commerceProductsError) throw new Error('Could not seed the demonstration commerce products.')

  const { error: commercePricesError } = await admin.from('prices').upsert([
    {
      id: demoFixtureIds.membershipPrice,
      product_id: demoFixtureIds.membershipProduct,
      currency: 'USD',
      amount_minor: 800,
      billing_interval: 'month',
      active: true,
    },
    {
      id: demoFixtureIds.freePrice,
      product_id: demoFixtureIds.freeProduct,
      currency: 'USD',
      amount_minor: 0,
      billing_interval: 'one_time',
      active: true,
    },
  ])
  if (commercePricesError) throw new Error('Could not seed the demonstration commerce prices.')

  const { data: existingLicenseTemplate, error: existingLicenseTemplateError } = await admin
    .from('license_templates')
    .select('id')
    .eq('slug', 'turn-toward-home-licensing')
    .maybeSingle()
  if (existingLicenseTemplateError) {
    throw new Error('Could not inspect the demonstration license template.')
  }
  if (!existingLicenseTemplate) {
    const { error: licenseTemplateError } = await admin.rpc('publish_license_template_version', {
      p_actor_id: users.get('owner'),
      p_template_id: null,
      p_track_id: demoFixtureIds.trackThree,
      p_slug: 'turn-toward-home-licensing',
      p_name: 'Turn Toward Home supported uses',
      p_summary:
        'Two fictional, non-exclusive uses show how an artist can publish clear terms and prices.',
      p_title: 'Limited non-exclusive music synchronization license',
      p_introduction:
        'This license grants only the supported use selected below. The artist keeps every right not expressly granted.',
      p_general_terms: [
        {
          heading: 'Music and project',
          body: 'The named recording may be synchronized only with the project described by the licensee.',
        },
        {
          heading: 'Ownership',
          body: 'Copyright and ownership remain with the artist. This agreement does not transfer the recording or composition.',
        },
        {
          heading: 'Changes and transfer',
          body: 'The license may not be transferred, sublicensed, or expanded beyond the selected use without written approval.',
        },
      ],
      p_disclaimer:
        'This artist-configurable demonstration document is a business record, not legal advice. An artist should review production terms with qualified counsel before live use.',
      p_options: [
        {
          key: 'dance-film-study',
          label: 'Dance film study',
          description:
            'A small, non-commercial dance film, rehearsal study, or choreographic reel released online.',
          usageCategory: 'Synchronization',
          allowedMedia: ['Dance film', 'Rehearsal study', 'Choreographic reel'],
          audienceLabel: 'Up to 10,000 total viewers',
          maxAudience: 10000,
          distributionLabel: 'One online project on artist-controlled or social channels',
          maxCopies: 1,
          termMonths: 12,
          territory: 'Worldwide',
          attributionRequired: true,
          attributionText: 'Music: Turn Toward Home by Daymark Assembly',
          exclusive: false,
          currency: 'USD',
          amountMinor: 7500,
          sortOrder: 1,
        },
        {
          key: 'small-live-performance',
          label: 'Small live performance',
          description:
            'Use in one independently produced live dance performance and its private rehearsal process.',
          usageCategory: 'Live performance',
          allowedMedia: ['Live performance', 'Private rehearsal'],
          audienceLabel: 'Up to 300 in-person attendees',
          maxAudience: 300,
          distributionLabel:
            'One performance; no broadcast, paid stream, or recording distribution',
          maxCopies: 1,
          termMonths: 6,
          territory: 'United States',
          attributionRequired: true,
          attributionText: 'Music: Turn Toward Home by Daymark Assembly',
          exclusive: false,
          currency: 'USD',
          amountMinor: 12500,
          sortOrder: 2,
        },
      ],
    })
    if (licenseTemplateError) throw new Error('Could not seed the demonstration license template.')
  }

  const lessonImage = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-labelledby="title description">
  <title id="title">Phrase arc study</title>
  <desc id="description">Three warm arcs rise, suspend, and return across a dark field.</desc>
  <rect width="1200" height="675" fill="#17201d"/>
  <path d="M90 500 C280 120 470 120 650 430 C770 620 930 590 1110 220" fill="none" stroke="#ef8354" stroke-width="24" stroke-linecap="round"/>
  <path d="M90 545 C300 280 500 270 690 495" fill="none" stroke="#f3d6b5" stroke-width="8" stroke-linecap="round" opacity="0.9"/>
  <circle cx="650" cy="430" r="18" fill="#f3d6b5"/>
</svg>
`)
  const lessonResource = Buffer.from(
    'Daymark Assembly phrase observation sheet\n\n1. Name the first arrival.\n2. Mark the suspended moment.\n3. Describe how the phrase returns.\n',
    'utf8',
  )
  const lessonImagePath = 'daymark/learning/phrase-arc-study.svg'
  const lessonResourcePath = 'daymark/learning/phrase-observation-sheet.txt'
  const [{ error: lessonImageUploadError }, { error: lessonResourceUploadError }] =
    await Promise.all([
      admin.storage.from('lesson-media').upload(lessonImagePath, lessonImage, {
        contentType: 'image/svg+xml',
        upsert: true,
      }),
      admin.storage.from('lesson-media').upload(lessonResourcePath, lessonResource, {
        contentType: 'text/plain',
        upsert: true,
      }),
    ])
  if (lessonImageUploadError || lessonResourceUploadError) {
    throw new Error('Could not upload the fictional lesson media.')
  }
  const { error: lessonMediaError } = await admin.from('media_objects').upsert([
    {
      id: demoFixtureIds.lessonImage,
      lesson_id: demoFixtureIds.lessonOne,
      kind: 'lesson_media',
      bucket_id: 'lesson-media',
      object_path: lessonImagePath,
      media_type: 'image/svg+xml',
      byte_size: lessonImage.byteLength,
      sha256: sha256(lessonImage),
      status: 'ready',
      is_public: false,
      metadata: { generated: true, use: 'image' },
      created_by: users.get('owner'),
    },
    {
      id: demoFixtureIds.lessonResource,
      lesson_id: demoFixtureIds.lessonTwo,
      kind: 'lesson_media',
      bucket_id: 'lesson-media',
      object_path: lessonResourcePath,
      media_type: 'text/plain',
      byte_size: lessonResource.byteLength,
      sha256: sha256(lessonResource),
      status: 'ready',
      is_public: false,
      metadata: { generated: true, use: 'download' },
      created_by: users.get('owner'),
    },
  ])
  if (lessonMediaError) throw new Error('Could not seed the fictional lesson media records.')

  const videoPayload = {
    id: demoFixtureIds.video,
    slug: 'external-video-with-context',
    title: 'External video, presented with context',
    summary:
      'A fictional teaching entry demonstrates an approved privacy-gated embed, complete transcript, and visible source credit.',
    provider: 'youtube',
    externalId: 'M7lc1UVf-VE',
    hostedMediaId: null,
    posterUrl: '/demo/video-poster.svg',
    transcript:
      'This demonstration entry uses the official YouTube IFrame API sample video. The external player remains unloaded until the visitor chooses to load it. In a real artist installation, replace this transcript with the complete accessible transcript for the approved video.',
    credits: [{ role: 'External demonstration source', name: 'YouTube Developers' }],
  }
  const { error: videoDraftError } = await admin.from('video_drafts').upsert({
    id: demoFixtureIds.video,
    slug: videoPayload.slug,
    payload: videoPayload,
    updated_by: users.get('owner'),
  })
  if (videoDraftError) throw new Error('Could not seed the demonstration video draft.')
  const { error: videoPublishError } = await admin.rpc('publish_video_draft', {
    p_actor_id: users.get('owner'),
    p_draft_id: demoFixtureIds.video,
  })
  if (videoPublishError) throw new Error('Could not publish the demonstration video.')

  const learningPayload = {
    area: {
      id: demoFixtureIds.learningArea,
      slug: 'listening-practice',
      name: 'Listening practice',
      description: 'Short paths for hearing form, weight, and return in music for movement.',
    },
    id: demoFixtureIds.learningPath,
    slug: 'listening-with-the-whole-phrase',
    title: 'Listening with the whole phrase',
    summary:
      'Three ordered lessons move from a public first listening through member study and an account-based return practice.',
    introduction:
      'Begin with one complete phrase. Notice where its weight gathers, where it suspends, and what makes the return feel earned.',
    courses: [
      {
        id: demoFixtureIds.learningCourse,
        slug: 'phrase-weight-and-return',
        title: 'Phrase, weight, and return',
        summary: 'A compact course in listening across the full arc instead of counting moments.',
        lessons: [
          {
            id: demoFixtureIds.lessonOne,
            slug: 'hear-the-first-arc',
            title: 'Hear the first arc',
            summary: 'Listen once without stopping and name the first real arrival.',
            estimatedMinutes: 8,
            accessMode: 'public',
            accessExplanation: 'This opening lesson is public.',
            membershipTierId: null,
            price: null,
            sections: [
              {
                id: demoFixtureIds.lessonSectionOne,
                type: 'prose',
                eyebrow: 'First listening',
                heading: 'Let the complete phrase arrive before naming it.',
                body: 'Listen once without **counting**. On the second pass, notice the first point that feels like an _arrival_ rather than a pause.\n\n- Follow the rise\n- Stay with the suspension\n- Hear what makes the return possible',
              },
              {
                id: demoFixtureIds.lessonSectionTwo,
                type: 'image',
                heading: 'A phrase can rise, suspend, and continue.',
                mediaId: demoFixtureIds.lessonImage,
                alt: 'Three warm arcs rise, suspend, and return across a dark field.',
                caption: 'A fictional visual score for following the whole phrase.',
              },
              {
                id: demoFixtureIds.lessonSectionThree,
                type: 'audio',
                heading: 'Listen to Turn Toward Home',
                mediaId: demoFixtureIds.previewThree,
                prompt: 'Where does the phrase gather enough weight to turn?',
                transcript: 'Instrumental audio with no spoken text.',
              },
            ],
          },
          {
            id: demoFixtureIds.lessonTwo,
            slug: 'hold-the-suspended-moment',
            title: 'Hold the suspended moment',
            summary:
              'A member lesson connects phrase suspension with a deliberate movement prompt.',
            estimatedMinutes: 12,
            accessMode: 'membership',
            accessExplanation: 'Daymark Circle members can open this studio lesson.',
            membershipTierId: demoFixtureIds.membershipTier,
            price: null,
            sections: [
              {
                id: demoFixtureIds.lessonSectionFour,
                type: 'prose',
                heading: 'Suspension still has direction.',
                body: 'A held moment is not empty. Listen for the energy that continues through it and decide what the next motion inherits.',
              },
              {
                id: demoFixtureIds.lessonSectionFive,
                type: 'video',
                heading: 'See the external-player pattern',
                videoId: demoFixtureIds.video,
              },
              {
                id: demoFixtureIds.lessonSectionSix,
                type: 'download',
                heading: 'Take the observation sheet',
                mediaId: demoFixtureIds.lessonResource,
                label: 'Download the phrase observation sheet',
                description:
                  'A private fictional text resource delivered only after lesson access is verified.',
              },
              {
                id: demoFixtureIds.lessonSectionSeven,
                type: 'prompt',
                heading: 'Movement prompt',
                body: 'Choose one suspended moment. Continue its direction without rushing its arrival.',
              },
            ],
          },
          {
            id: demoFixtureIds.lessonThree,
            slug: 'return-with-context',
            title: 'Return with context',
            summary: 'A signed-in listener carries the earlier observations into one final pass.',
            estimatedMinutes: 7,
            accessMode: 'account',
            accessExplanation: 'Create a free account to save and resume this return practice.',
            membershipTierId: null,
            price: null,
            sections: [
              {
                id: demoFixtureIds.lessonSectionEight,
                type: 'prose',
                heading: 'The return contains what came before it.',
                body: 'Listen again and notice which earlier event changes the meaning of the final arrival.',
              },
              {
                id: demoFixtureIds.lessonSectionNine,
                type: 'audio',
                heading: 'One final pass',
                mediaId: demoFixtureIds.preview,
                prompt: 'What does the ending remember?',
                transcript: 'Instrumental audio with no spoken text.',
              },
            ],
          },
        ],
      },
    ],
  }
  const { error: learningDraftError } = await admin.from('learning_path_drafts').upsert({
    id: demoFixtureIds.learningPath,
    slug: learningPayload.slug,
    payload: learningPayload,
    updated_by: users.get('owner'),
  })
  if (learningDraftError) throw new Error('Could not seed the demonstration learning draft.')
  const { error: learningPublishError } = await admin.rpc('publish_learning_path_draft', {
    p_actor_id: users.get('owner'),
    p_draft_id: demoFixtureIds.learningPath,
  })
  if (learningPublishError) throw new Error('Could not publish the demonstration learning path.')

  const editorialPayload = {
    id: demoFixtureIds.editorial,
    kind: 'learning_note',
    slug: 'what-a-phrase-carries',
    title: 'What a phrase carries',
    summary: 'A fictional editorial note about hearing continuity through arrival and suspension.',
    publishedOn: '2026-07-15',
    sections: [
      {
        id: '10000000-0000-4000-8000-000000000029',
        type: 'prose',
        eyebrow: 'Studio note',
        heading: 'An arrival belongs to the path that made it possible.',
        body: 'When listening supports movement, the useful question is rarely where the phrase stops. It is what the phrase has carried into that moment and what remains available afterward.',
      },
      {
        id: '10000000-0000-4000-8000-00000000002a',
        type: 'call_to_action',
        heading: 'Listen through the full arc.',
        body: 'The demonstration learning path turns this note into a short practice.',
        label: 'Open the learning path',
        href: '/learn/listening-with-the-whole-phrase',
      },
    ],
  }
  const { error: editorialDraftError } = await admin.from('editorial_drafts').upsert({
    id: demoFixtureIds.editorial,
    slug: editorialPayload.slug,
    payload: editorialPayload,
    updated_by: users.get('owner'),
  })
  if (editorialDraftError) throw new Error('Could not seed the demonstration editorial draft.')
  const { error: editorialPublishError } = await admin.rpc('publish_editorial_draft', {
    p_actor_id: users.get('owner'),
    p_draft_id: demoFixtureIds.editorial,
  })
  if (editorialPublishError) throw new Error('Could not publish the demonstration editorial note.')

  const { error: pageError } = await admin.from('pages').upsert([
    {
      id: demoFixtureIds.aboutPage,
      slug: 'about',
      title: 'About Daymark Assembly',
      navigation_label: 'About',
      status: 'published',
      seo: {
        title: 'About',
        description: 'Meet the fictional artist demonstrating this artist-owned platform.',
      },
      sections: [
        {
          id: '30000000-0000-4000-8000-000000000001',
          type: 'prose',
          eyebrow: 'Practice and place',
          heading: 'Work built around attentive movement.',
          body: 'Daymark Assembly is a fictional independent music practice created to prove that an artist can publish, teach, license, and build direct relationships from infrastructure they own.',
        },
      ],
      created_by: users.get('owner'),
      updated_by: users.get('owner'),
      published_at: '2026-07-14T00:00:00.000Z',
    },
    {
      id: demoFixtureIds.contactPage,
      slug: 'contact',
      title: 'Contact Daymark Assembly',
      navigation_label: 'Contact',
      status: 'published',
      seo: {
        title: 'Contact',
        description: 'Send a local demonstration message to the fictional artist.',
      },
      sections: [
        {
          id: '30000000-0000-4000-8000-000000000002',
          type: 'contact',
          heading: 'Begin with a clear note.',
          introduction:
            'Messages are stored in the artist-owned database. This local demonstration does not send external email.',
          consentLabel: 'I understand this message will be stored so the artist can respond.',
        },
      ],
      created_by: users.get('owner'),
      updated_by: users.get('owner'),
      published_at: '2026-07-14T00:00:00.000Z',
    },
  ])
  if (pageError) throw new Error('Could not seed the demonstration pages.')

  const { error: configOwnerError } = await admin
    .from('site_config_versions')
    .update({ updated_by: users.get('owner') })
    .eq('installation_key', 'primary')
    .eq('status', 'published')
  if (configOwnerError) throw new Error('Could not assign the demonstration configuration owner.')
}

export async function verifyPublicDemonstration(status) {
  const response = await fetchLocalService(
    `${status.apiUrl}/rest/v1/published_site_config?installation_key=eq.primary&select=config_schema_version`,
    {
      headers: {
        apikey: status.publishableKey,
        Authorization: `Bearer ${status.publishableKey}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Public demonstration check failed with HTTP ${response.status}.`)
  }

  const records = await response.json()
  if (!Array.isArray(records) || records.length !== 1 || records[0].config_schema_version !== 1) {
    throw new Error('Public demonstration configuration is missing or duplicated.')
  }
}

export async function verifyAuthorizationDemonstration(status) {
  const publicHeaders = {
    apikey: status.publishableKey,
    Authorization: `Bearer ${status.publishableKey}`,
  }
  const releaseResponse = await fetchLocalService(
    `${status.apiUrl}/rest/v1/releases?id=eq.${demoFixtureIds.release}&state=eq.published&select=id`,
    { headers: publicHeaders },
  )
  const mediaResponse = await fetchLocalService(
    `${status.apiUrl}/rest/v1/media_objects?id=eq.${demoFixtureIds.preview}&is_public=eq.true&select=id`,
    { headers: publicHeaders },
  )
  const serviceHeaders = {
    apikey: status.secretKey,
    Authorization: `Bearer ${status.secretKey}`,
  }
  const rolesResponse = await fetchLocalService(`${status.apiUrl}/rest/v1/app_roles?select=role`, {
    headers: serviceHeaders,
  })
  const bucketsResponse = await fetchLocalService(`${status.apiUrl}/storage/v1/bucket`, {
    headers: serviceHeaders,
  })
  const pagesResponse = await fetchLocalService(
    `${status.apiUrl}/rest/v1/pages?status=eq.published&select=slug`,
    { headers: publicHeaders },
  )

  if (
    !releaseResponse.ok ||
    !mediaResponse.ok ||
    !rolesResponse.ok ||
    !bucketsResponse.ok ||
    !pagesResponse.ok
  ) {
    throw new Error('The authorization or storage fixtures could not be read.')
  }

  const [releases, media, roles, buckets, pages] = await Promise.all([
    releaseResponse.json(),
    mediaResponse.json(),
    rolesResponse.json(),
    bucketsResponse.json(),
    pagesResponse.json(),
  ])
  if (releases.length !== 1 || media.length !== 1) {
    throw new Error('The public authorization fixtures are missing or duplicated.')
  }

  const roleNames = new Set(roles.map(({ role }) => role))
  if (!['owner', 'editor', 'customer'].every((role) => roleNames.has(role))) {
    throw new Error('The demonstration roles are incomplete.')
  }

  const bucketNames = new Set(buckets.map(({ id }) => id))
  const expectedBuckets = [
    'artwork',
    'preview-media',
    'source-audio',
    'downloads',
    'license-documents',
    'lesson-media',
    'administrative',
  ]
  if (!expectedBuckets.every((bucket) => bucketNames.has(bucket))) {
    throw new Error('The demonstration storage buckets are incomplete.')
  }

  const pageSlugs = new Set(pages.map(({ slug }) => slug))
  if (!['about', 'contact'].every((slug) => pageSlugs.has(slug))) {
    throw new Error('The demonstration pages are incomplete.')
  }
}

export function safeSupabaseError(error) {
  return redactOutput(error instanceof Error ? error.message : String(error))
}
