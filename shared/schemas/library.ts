import { z } from 'zod'

export const favoriteTrackSchema = z.object({
  trackId: z.uuid(),
  favorite: z.boolean(),
})

export const createPlaylistSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
})

export const updatePlaylistSchema = createPlaylistSchema.extend({
  trackIds: z.array(z.uuid()).max(1000),
})

export const listeningHistorySchema = z.object({
  trackId: z.uuid(),
  progressMs: z.number().int().min(0).max(86_400_000),
  completed: z.boolean().default(false),
})
