import { z } from 'zod'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const mediaUploadTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('source_audio'),
    trackId: z.uuid(),
    filename: z.string().min(1).max(255),
    mediaType: z.enum(['audio/wav', 'audio/aiff', 'audio/x-aiff', 'audio/flac']),
    byteSize: z.number().int().positive().max(524_288_000),
    sha256: sha256Schema,
  }),
  z.object({
    kind: z.literal('artwork'),
    releaseId: z.uuid(),
    filename: z.string().min(1).max(255),
    mediaType: z.literal('image/webp'),
    byteSize: z.number().int().positive().max(20_971_520),
    sha256: sha256Schema,
  }),
])

export const mediaUploadCompleteSchema = z.object({ intentId: z.uuid() })

export type MediaUploadTargetInput = z.infer<typeof mediaUploadTargetSchema>
