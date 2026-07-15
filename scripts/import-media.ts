import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../shared/types/database.ts'

const execute = promisify(execFile)
const supportedAudio = new Map([
  ['.wav', 'audio/wav'],
  ['.aif', 'audio/aiff'],
  ['.aiff', 'audio/aiff'],
  ['.flac', 'audio/flac'],
])

const importTrackSchema = z.object({
  stableId: z.uuid(),
  sourceMediaId: z.uuid(),
  relativePath: z.string().min(1),
  filename: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: z.enum(['audio/wav', 'audio/aiff', 'audio/flac']),
  byteSize: z.number().int().positive().max(524_288_000),
  durationMs: z.number().int().positive(),
  codec: z.string().min(1),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().positive(),
  proposed: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1).max(200),
    description: z.string().max(5000),
    position: z.number().int().positive(),
    musicalKey: z.string().max(40),
    meter: z.string().max(40),
    tempoBpm: z.number().positive().max(999).nullable(),
    mood: z.string().max(100),
    instruments: z.array(z.string().min(1).max(100)).max(30),
  }),
})

export const importProposalSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceDirectory: z.string().min(1),
    processingProfileVersion: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
    release: z.object({
      stableId: z.uuid(),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      title: z.string().min(1).max(200),
      subtitle: z.string().max(240),
      description: z.string().max(5000),
      releaseType: z.enum(['album', 'ep', 'single', 'collection']),
      releaseDate: z.iso.date(),
    }),
    tracks: z.array(importTrackSchema).min(1).max(500),
    confirmations: z.object({
      rightsConfirmed: z.boolean(),
      metadataApproved: z.boolean(),
      publicationApproved: z.boolean(),
      approvedBy: z.string().min(1).max(160),
    }),
  })
  .superRefine((proposal, context) => {
    const hashes = new Set<string>()
    const ids = new Set<string>()
    const positions = new Set<number>()
    for (const track of proposal.tracks) {
      if (hashes.has(track.sha256)) {
        context.addIssue({ code: 'custom', message: 'Each source hash may appear only once.' })
      }
      if (ids.has(track.stableId) || ids.has(track.sourceMediaId)) {
        context.addIssue({ code: 'custom', message: 'Stable identifiers must be unique.' })
      }
      if (positions.has(track.proposed.position)) {
        context.addIssue({ code: 'custom', message: 'Track positions must be unique.' })
      }
      hashes.add(track.sha256)
      ids.add(track.stableId)
      ids.add(track.sourceMediaId)
      positions.add(track.proposed.position)
    }
  })

export type ImportProposal = z.infer<typeof importProposalSchema>
export type ImportResult = {
  releaseId: string
  tracksApplied: number
  sourcesCreated: number
  sourcesReused: number
  jobsCreated: number
}

type ProbeOutput = {
  format?: { duration?: string }
  streams?: Array<{
    codec_type?: string
    codec_name?: string
    sample_rate?: string
    channels?: number
  }>
}

function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex')
}

function stableUuid(value: string) {
  const hash = sha256(value)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

function slugify(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  )
}

function titleFromFilename(filename: string) {
  const withoutExtension = basename(filename, extname(filename))
  const withoutOrder = withoutExtension.replace(/^\s*\d+[\s._-]+/, '')
  return withoutOrder.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function listAudioFiles(directory: string): Promise<string[]> {
  const output: string[] = []
  const entries: Dirent[] = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink())
      throw new Error('Symbolic links are not accepted during media intake.')
    if (entry.isDirectory()) output.push(...(await listAudioFiles(path)))
    if (entry.isFile() && supportedAudio.has(extname(entry.name).toLowerCase())) output.push(path)
  }
  return output
}

async function probeAudio(path: string) {
  let probe: ProbeOutput
  try {
    const { stdout } = await execute(
      'ffprobe',
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      { maxBuffer: 4 * 1024 * 1024 },
    )
    probe = JSON.parse(stdout) as ProbeOutput
  } catch (error) {
    throw new Error(`Could not inspect ${basename(path)} with ffprobe.`, { cause: error })
  }
  const audio = probe.streams?.find(({ codec_type }) => codec_type === 'audio')
  const durationMs = Math.round(Number(probe.format?.duration ?? 0) * 1000)
  const sampleRate = Number(audio?.sample_rate ?? 0)
  if (!audio?.codec_name || !durationMs || !sampleRate || !audio.channels) {
    throw new Error(`${basename(path)} does not contain a supported audio stream.`)
  }
  return { durationMs, codec: audio.codec_name, sampleRate, channels: audio.channels }
}

function loadLocalEnvironment() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
    }
  } catch {
    // Hosted or explicitly configured shells already contain their environment.
  }
}

function requireEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Required environment variable ${name} is missing.`)
  return value
}

export async function inspectMedia(inputDirectory: string): Promise<ImportProposal> {
  const sourceDirectory = await realpath(resolve(inputDirectory))
  const directoryStat = await lstat(sourceDirectory)
  if (!directoryStat.isDirectory()) throw new Error('Media intake requires a directory.')
  const paths = await listAudioFiles(sourceDirectory)
  if (!paths.length) throw new Error('No supported WAV, AIFF, or FLAC files were found.')

  const inspected = []
  for (const [index, path] of paths.entries()) {
    const bytes = await readFile(path)
    if (bytes.byteLength > 524_288_000) throw new Error(`${basename(path)} exceeds 500 MiB.`)
    const contentHash = sha256(bytes)
    const technical = await probeAudio(path)
    const title = titleFromFilename(path)
    inspected.push({
      stableId: stableUuid(`track:${contentHash}`),
      sourceMediaId: stableUuid(`source:${contentHash}`),
      relativePath: relative(sourceDirectory, path),
      filename: basename(path),
      sha256: contentHash,
      mediaType: supportedAudio.get(extname(path).toLowerCase())!,
      byteSize: bytes.byteLength,
      ...technical,
      proposed: {
        slug: slugify(title),
        title,
        description: '',
        position: index + 1,
        musicalKey: '',
        meter: '',
        tempoBpm: null,
        mood: '',
        instruments: [],
      },
    })
  }

  const releaseTitle = titleFromFilename(basename(sourceDirectory))
  return validateImportProposal({
    schemaVersion: 1,
    sourceDirectory,
    processingProfileVersion: 'preview-v1',
    release: {
      stableId: stableUuid(`release:${inspected.map(({ sha256: hash }) => hash).join(':')}`),
      slug: slugify(releaseTitle),
      title: releaseTitle,
      subtitle: '',
      description: '',
      releaseType: inspected.length === 1 ? 'single' : 'album',
      releaseDate: new Date().toISOString().slice(0, 10),
    },
    tracks: inspected,
    confirmations: {
      rightsConfirmed: false,
      metadataApproved: false,
      publicationApproved: false,
      approvedBy: 'pending',
    },
  })
}

export function validateImportProposal(proposal: unknown): ImportProposal {
  return importProposalSchema.parse(proposal)
}

export async function applyApprovedImport(input: ImportProposal): Promise<ImportResult> {
  const proposal = validateImportProposal(input)
  if (
    !proposal.confirmations.rightsConfirmed ||
    !proposal.confirmations.metadataApproved ||
    !proposal.confirmations.publicationApproved ||
    proposal.confirmations.approvedBy === 'pending'
  ) {
    throw new Error('Rights, metadata, publication, and approver confirmations are required.')
  }

  loadLocalEnvironment()
  const supabase = createClient<Database>(
    requireEnvironment('NUXT_PUBLIC_SUPABASE_URL'),
    requireEnvironment('NUXT_SUPABASE_SECRET_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const sourceRoot = await realpath(proposal.sourceDirectory)
  const publishedAt = new Date().toISOString()
  const { error: releaseError } = await supabase.from('releases').upsert({
    id: proposal.release.stableId,
    slug: proposal.release.slug,
    title: proposal.release.title,
    subtitle: proposal.release.subtitle,
    description: proposal.release.description,
    release_type: proposal.release.releaseType,
    release_date: proposal.release.releaseDate,
    state: 'published',
    published_at: publishedAt,
  })
  if (releaseError) throw new Error(`Release application failed: ${releaseError.message}`)

  let sourcesCreated = 0
  let sourcesReused = 0
  let jobsCreated = 0
  for (const track of proposal.tracks.sort(
    (left, right) => left.proposed.position - right.proposed.position,
  )) {
    const candidate = resolve(sourceRoot, track.relativePath)
    const verifiedPath = await realpath(candidate)
    if (!verifiedPath.startsWith(`${sourceRoot}${sep}`)) {
      throw new Error('A proposed source path escapes the approved directory.')
    }
    const bytes = await readFile(verifiedPath)
    if (sha256(bytes) !== track.sha256 || bytes.byteLength !== track.byteSize) {
      throw new Error(`${track.filename} changed after the proposal was approved.`)
    }

    const { error: trackError } = await supabase.from('tracks').upsert({
      id: track.stableId,
      slug: track.proposed.slug,
      title: track.proposed.title,
      description: track.proposed.description,
      primary_release_id: proposal.release.stableId,
      duration_ms: track.durationMs,
      musical_key: track.proposed.musicalKey,
      meter: track.proposed.meter,
      tempo_bpm: track.proposed.tempoBpm,
      mood: track.proposed.mood,
      instruments: track.proposed.instruments,
      state: 'published',
      published_at: publishedAt,
    })
    if (trackError) throw new Error(`Track application failed: ${trackError.message}`)

    const { error: orderError } = await supabase.from('release_tracks').upsert({
      release_id: proposal.release.stableId,
      track_id: track.stableId,
      disc_number: 1,
      position: track.proposed.position,
    })
    if (orderError) throw new Error(`Track-order application failed: ${orderError.message}`)

    const { data: existingSource, error: sourceLookupError } = await supabase
      .from('media_objects')
      .select('id')
      .eq('sha256', track.sha256)
      .eq('kind', 'source_audio')
      .maybeSingle()
    if (sourceLookupError) throw new Error(`Source lookup failed: ${sourceLookupError.message}`)
    let sourceId = existingSource?.id
    if (sourceId) {
      sourcesReused += 1
    } else {
      const extension = extname(track.filename).toLowerCase()
      const objectPath = `imports/${track.sha256}/source${extension}`
      const { error: uploadError } = await supabase.storage
        .from('source-audio')
        .upload(objectPath, bytes, { contentType: track.mediaType, upsert: false })
      if (uploadError) throw new Error(`Source upload failed: ${uploadError.message}`)
      const { data: createdSource, error: sourceError } = await supabase
        .from('media_objects')
        .insert({
          id: track.sourceMediaId,
          release_id: proposal.release.stableId,
          track_id: track.stableId,
          kind: 'source_audio',
          bucket_id: 'source-audio',
          object_path: objectPath,
          media_type: track.mediaType,
          byte_size: track.byteSize,
          sha256: track.sha256,
          status: 'pending',
          is_public: false,
          metadata: {
            codec: track.codec,
            sampleRate: track.sampleRate,
            channels: track.channels,
            inspectedDurationMs: track.durationMs,
          },
        })
        .select('id')
        .single()
      if (sourceError) throw new Error(`Source record failed: ${sourceError.message}`)
      sourceId = createdSource.id
      sourcesCreated += 1
    }

    const { data: existingJob, error: jobLookupError } = await supabase
      .from('media_jobs')
      .select('id')
      .eq('media_object_id', sourceId)
      .eq('processing_profile_version', proposal.processingProfileVersion)
      .maybeSingle()
    if (jobLookupError) throw new Error(`Media-job lookup failed: ${jobLookupError.message}`)
    if (!existingJob) {
      const { error: jobError } = await supabase.from('media_jobs').insert({
        media_object_id: sourceId,
        processing_profile_version: proposal.processingProfileVersion,
      })
      if (jobError) throw new Error(`Media-job creation failed: ${jobError.message}`)
      jobsCreated += 1
    }
  }

  await supabase.from('audit_records').insert({
    event_type: 'catalog.import_applied',
    target_type: 'release',
    target_id: proposal.release.stableId,
    detail: {
      approvedBy: proposal.confirmations.approvedBy,
      tracksApplied: proposal.tracks.length,
      sourcesCreated,
      sourcesReused,
    },
  })

  return {
    releaseId: proposal.release.stableId,
    tracksApplied: proposal.tracks.length,
    sourcesCreated,
    sourcesReused,
    jobsCreated,
  }
}

function readArgument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const action = process.argv[2]
  if (action === 'inspect') {
    const directory = process.argv[3]
    if (!directory)
      throw new Error('Usage: npm run media:inspect -- <approved-directory> --out <manifest>')
    const proposal = await inspectMedia(directory)
    const output = readArgument('--out')
    if (output) {
      await writeFile(resolve(output), `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' })
      console.log(
        JSON.stringify({
          event: 'media-import-proposed',
          releaseId: proposal.release.stableId,
          tracks: proposal.tracks.length,
        }),
      )
    } else {
      console.log(JSON.stringify(proposal, null, 2))
    }
    return
  }
  if (action === 'apply') {
    const manifest = process.argv[3]
    if (!manifest || !process.argv.includes('--confirm-apply')) {
      throw new Error('Applying requires a manifest path and --confirm-apply.')
    }
    const proposal = validateImportProposal(JSON.parse(await readFile(resolve(manifest), 'utf8')))
    console.log(
      JSON.stringify({ event: 'media-import-applied', ...(await applyApprovedImport(proposal)) }),
    )
    return
  }
  throw new Error('Choose the inspect or apply action.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Media import failed.')
    process.exit(1)
  })
}
