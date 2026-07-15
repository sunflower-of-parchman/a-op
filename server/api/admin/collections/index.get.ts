import { collectionDraftSchema } from '#shared/schemas/catalog'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

type DraftPayload = {
  slug: string
  title: string
  description?: string
  tracks?: Array<{ track_id: string; position: number; note?: string }>
}

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner', 'editor'])
  const admin = getAdminSupabase(event)
  const [
    { data: collections, error: collectionsError },
    { data: order, error: orderError },
    { data: drafts, error: draftsError },
    { data: tracks, error: tracksError },
  ] = await Promise.all([
    admin.from('collections').select('*').neq('state', 'archived').order('sort_order'),
    admin.from('collection_tracks').select('collection_id, track_id, position, note'),
    admin.from('collection_drafts').select('collection_id, payload, updated_at'),
    admin.from('tracks').select('id, slug, title, state').neq('state', 'archived').order('title'),
  ])
  if (collectionsError || orderError || draftsError || tracksError) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The collection workspace could not load.',
    })
  }

  const draftByCollection = new Map(drafts.map((draft) => [draft.collection_id, draft]))
  return {
    collections: collections.map((collection) => {
      const draft = draftByCollection.get(collection.id)
      const payload = draft?.payload as DraftPayload | undefined
      const input = payload
        ? collectionDraftSchema.parse({
            id: collection.id,
            slug: payload.slug,
            title: payload.title,
            description: payload.description,
            tracks: payload.tracks?.map((track) => ({
              trackId: track.track_id,
              position: track.position,
              note: track.note,
            })),
          })
        : collectionDraftSchema.parse({
            id: collection.id,
            slug: collection.slug,
            title: collection.title,
            description: collection.description,
            tracks: order
              .filter(({ collection_id }) => collection_id === collection.id)
              .sort((left, right) => left.position - right.position)
              .map(({ track_id, position, note }) => ({ trackId: track_id, position, note })),
          })
      return {
        ...input,
        state: collection.state,
        publishedAt: collection.published_at,
        hasDraft: Boolean(draft),
        draftUpdatedAt: draft?.updated_at ?? null,
      }
    }),
    tracks,
  }
})
