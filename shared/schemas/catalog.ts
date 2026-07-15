import { z } from 'zod'

export const catalogCreditSchema = z.object({
  role: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(160),
  position: z.number().int().positive(),
})

export const catalogTrackSchema = z.object({
  id: z.uuid().optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  durationMs: z.number().int().positive().nullable().default(null),
  musicalKey: z.string().max(40).default(''),
  meter: z.string().max(40).default(''),
  tempoBpm: z.number().positive().max(999).nullable().default(null),
  mood: z.string().max(100).default(''),
  instruments: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  explicit: z.boolean().default(false),
  discNumber: z.number().int().positive().default(1),
  position: z.number().int().positive(),
})

export const releaseDraftSchema = z
  .object({
    id: z.uuid().optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().max(240).default(''),
    description: z.string().max(5000).default(''),
    releaseType: z.enum(['album', 'ep', 'single', 'collection']).default('album'),
    releaseDate: z.iso.date().nullable().default(null),
    label: z.string().max(160).default(''),
    catalogNumber: z.string().max(80).default(''),
    genre: z.string().max(100).default(''),
    mood: z.string().max(100).default(''),
    artworkMediaId: z.uuid().nullable().default(null),
    tracks: z.array(catalogTrackSchema).min(1).max(500),
    credits: z.array(catalogCreditSchema).max(100).default([]),
  })
  .superRefine((release, context) => {
    const positions = new Set<number>()
    const slugs = new Set<string>()
    for (const track of release.tracks) {
      const positionKey = track.discNumber * 10_000 + track.position
      if (positions.has(positionKey)) {
        context.addIssue({ code: 'custom', message: 'Track positions must be unique.' })
      }
      if (slugs.has(track.slug)) {
        context.addIssue({ code: 'custom', message: 'Track slugs must be unique.' })
      }
      positions.add(positionKey)
      slugs.add(track.slug)
    }
  })

export const collectionDraftSchema = z
  .object({
    id: z.uuid().optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).default(''),
    tracks: z
      .array(
        z.object({
          trackId: z.uuid(),
          position: z.number().int().positive(),
          note: z.string().max(500).default(''),
        }),
      )
      .min(1)
      .max(1000),
  })
  .superRefine((collection, context) => {
    const trackIds = new Set<string>()
    const positions = new Set<number>()
    for (const track of collection.tracks) {
      if (trackIds.has(track.trackId)) {
        context.addIssue({
          code: 'custom',
          message: 'A track can appear only once per collection.',
        })
      }
      if (positions.has(track.position)) {
        context.addIssue({ code: 'custom', message: 'Collection positions must be unique.' })
      }
      trackIds.add(track.trackId)
      positions.add(track.position)
    }
  })

export type ReleaseDraftInput = z.infer<typeof releaseDraftSchema>
export type CollectionDraftInput = z.infer<typeof collectionDraftSchema>
