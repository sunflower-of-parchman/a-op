import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../../shared/types/database.ts'

const execute = promisify(execFile)
const processingDefaults = {
  previewSeconds: 30,
  previewBitrate: '192k',
  waveformPoints: 120,
}

export type MediaJobClaim = {
  jobId: string
  mediaId: string
  sourceHash: string
  sourceBucket: string
  sourcePath: string
  processingProfileVersion: string
  leaseExpiresAt: string
}

export type MediaWorkerOptions = {
  supabaseUrl: string
  supabaseSecretKey: string
  workerId: string
  previewSeconds?: number
  previewBitrate?: string
  waveformPoints?: number
}

type ProbeOutput = {
  format?: { duration?: string; format_name?: string; bit_rate?: string }
  streams?: Array<{
    codec_type?: string
    codec_name?: string
    sample_rate?: string
    channels?: number
  }>
}

function sha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeClaim(
  row: Database['public']['Functions']['claim_media_job']['Returns'][number],
) {
  return {
    jobId: row.job_id,
    mediaId: row.media_id,
    sourceHash: row.source_hash,
    sourceBucket: row.source_bucket,
    sourcePath: row.source_path,
    processingProfileVersion: row.processing_profile_version,
    leaseExpiresAt: row.lease_expires_at,
  } satisfies MediaJobClaim
}

function safeErrorCategory(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('hash')) return 'source-hash-mismatch'
  if (message.includes('ffprobe') || message.includes('audio stream')) return 'unsupported-audio'
  if (message.includes('ffmpeg')) return 'processing-failed'
  if (message.includes('download')) return 'source-download-failed'
  if (message.includes('upload')) return 'derivative-upload-failed'
  return 'media-processing-failed'
}

function createWaveform(pcm: Buffer, pointCount: number) {
  const sampleCount = Math.floor(pcm.byteLength / 2)
  const samplesPerPoint = Math.max(1, Math.ceil(sampleCount / pointCount))
  const peaks: number[] = []

  for (let point = 0; point < pointCount; point += 1) {
    const start = point * samplesPerPoint
    if (start >= sampleCount) break
    const end = Math.min(sampleCount, start + samplesPerPoint)
    let peak = 0
    for (let sample = start; sample < end; sample += 1) {
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(sample * 2)) / 32768)
    }
    peaks.push(Number(peak.toFixed(4)))
  }

  return peaks
}

async function inspectAudio(sourcePath: string): Promise<ProbeOutput> {
  try {
    const { stdout } = await execute(
      'ffprobe',
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', sourcePath],
      { maxBuffer: 4 * 1024 * 1024 },
    )
    return JSON.parse(stdout) as ProbeOutput
  } catch {
    throw new Error('ffprobe could not inspect the source audio.')
  }
}

async function generatePreview(
  sourcePath: string,
  destination: string,
  seconds: number,
  bitrate: string,
) {
  try {
    await execute(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        sourcePath,
        '-t',
        String(seconds),
        '-vn',
        '-map_metadata',
        '-1',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        bitrate,
        destination,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    )
  } catch {
    throw new Error('ffmpeg could not generate the preview derivative.')
  }
}

async function generateWaveform(sourcePath: string, seconds: number, pointCount: number) {
  try {
    const { stdout } = await execute(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        sourcePath,
        '-t',
        String(seconds),
        '-map',
        '0:a:0',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-f',
        's16le',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 },
    )
    return createWaveform(stdout, pointCount)
  } catch {
    throw new Error('ffmpeg could not generate waveform data.')
  }
}

async function storeDerivative(
  supabase: SupabaseClient<Database>,
  claim: MediaJobClaim,
  source: Database['public']['Tables']['media_objects']['Row'],
  preview: Buffer,
  metadata: Json,
) {
  const derivativeKey = `${claim.sourceHash}:${claim.processingProfileVersion}:preview_audio`
  const objectPath = `derived/${claim.sourceHash}/${claim.processingProfileVersion}/preview.mp3`
  const previewHash = sha256(preview)
  const { error: uploadError } = await supabase.storage
    .from('preview-media')
    .upload(objectPath, preview, { contentType: 'audio/mpeg', upsert: true })
  if (uploadError) throw new Error('Derivative upload failed.')

  const record = {
    release_id: source.release_id,
    track_id: source.track_id,
    source_media_id: source.id,
    kind: 'preview_audio' as const,
    bucket_id: 'preview-media',
    object_path: objectPath,
    media_type: 'audio/mpeg',
    byte_size: preview.byteLength,
    sha256: previewHash,
    status: 'ready' as const,
    is_public: true,
    metadata,
    processing_profile_version: claim.processingProfileVersion,
    derivative_key: derivativeKey,
  }
  const { data: existing, error: existingError } = await supabase
    .from('media_objects')
    .select('id')
    .eq('derivative_key', derivativeKey)
    .maybeSingle()
  if (existingError) throw new Error('Derivative lookup failed.')
  if (existing) {
    const { data, error } = await supabase
      .from('media_objects')
      .update(record)
      .eq('id', existing.id)
      .select('id, object_path, sha256')
      .single()
    if (error) throw new Error('Derivative record update failed.')
    return data
  }

  const { data, error } = await supabase
    .from('media_objects')
    .insert(record)
    .select('id, object_path, sha256')
    .single()
  if (error) throw new Error('Derivative record creation failed.')
  return data
}

export function createMediaWorker(options: MediaWorkerOptions) {
  const previewSeconds = options.previewSeconds ?? processingDefaults.previewSeconds
  const previewBitrate = options.previewBitrate ?? processingDefaults.previewBitrate
  const waveformPoints = options.waveformPoints ?? processingDefaults.waveformPoints
  const supabase = createClient<Database>(options.supabaseUrl, options.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  async function claimMediaJob(): Promise<MediaJobClaim | null> {
    const { data, error } = await supabase.rpc('claim_media_job', {
      p_worker_id: options.workerId,
      p_lease_seconds: 300,
    })
    if (error) throw new Error('Media job claim failed.')
    return data[0] ? normalizeClaim(data[0]) : null
  }

  async function processMediaJob(claim: MediaJobClaim) {
    const workspace = await mkdtemp(join(tmpdir(), 'artist-media-'))
    try {
      const { data: source, error: sourceError } = await supabase
        .from('media_objects')
        .select('*')
        .eq('id', claim.mediaId)
        .single()
      if (sourceError) throw new Error('Source media lookup failed.')

      const { data: sourceBlob, error: downloadError } = await supabase.storage
        .from(claim.sourceBucket)
        .download(claim.sourcePath)
      if (downloadError) throw new Error('Source download failed.')
      const sourceBytes = Buffer.from(await sourceBlob.arrayBuffer())
      if (sha256(sourceBytes) !== claim.sourceHash) throw new Error('Source hash mismatch.')

      const extension = basename(claim.sourcePath).split('.').pop() || 'audio'
      const localSource = join(workspace, `source.${extension}`)
      const localPreview = join(workspace, 'preview.mp3')
      await writeFile(localSource, sourceBytes, { flag: 'wx' })
      const probe = await inspectAudio(localSource)
      const audio = probe.streams?.find(({ codec_type }) => codec_type === 'audio')
      const durationSeconds = Number(probe.format?.duration ?? 0)
      if (!audio || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error('The source contains no supported audio stream.')
      }
      const derivativeSeconds = Math.min(previewSeconds, durationSeconds)
      await generatePreview(localSource, localPreview, derivativeSeconds, previewBitrate)
      const [preview, waveform] = await Promise.all([
        readFile(localPreview),
        generateWaveform(localSource, derivativeSeconds, waveformPoints),
      ])
      const technical = {
        durationMs: Math.round(durationSeconds * 1000),
        format: probe.format?.format_name ?? null,
        codec: audio.codec_name ?? null,
        sampleRate: audio.sample_rate ? Number(audio.sample_rate) : null,
        channels: audio.channels ?? null,
        sourceBitrate: probe.format?.bit_rate ? Number(probe.format.bit_rate) : null,
      }
      const derivative = await storeDerivative(supabase, claim, source, preview, {
        technical,
        waveform,
        waveformSampleRate: 8000,
        previewSeconds: derivativeSeconds,
      })

      const { error: trackError } = source.track_id
        ? await supabase
            .from('tracks')
            .update({ duration_ms: technical.durationMs })
            .eq('id', source.track_id)
        : { error: null }
      if (trackError) throw new Error('Track metadata update failed.')

      const { error: finalizeError } = await supabase.rpc('finalize_media_job', {
        p_job_id: claim.jobId,
        p_worker_id: options.workerId,
        p_result_metadata: {
          derivativeId: derivative.id,
          derivativePath: derivative.object_path,
          derivativeHash: derivative.sha256,
          waveformPoints: waveform.length,
          technical,
        },
      })
      if (finalizeError) throw new Error('Media job finalization failed.')
      return { derivativeId: derivative.id, derivativePath: derivative.object_path }
    } catch (error) {
      const category = safeErrorCategory(error)
      await supabase.rpc('fail_media_job', {
        p_job_id: claim.jobId,
        p_worker_id: options.workerId,
        p_error_category: category,
      })
      throw new Error(category, { cause: error })
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  }

  return { claimMediaJob, processMediaJob }
}
