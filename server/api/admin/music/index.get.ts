import { releaseDraftSchema } from '#shared/schemas/catalog'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

type DraftPayload = {
  slug: string
  title: string
  subtitle?: string
  description?: string
  release_type?: string
  release_date?: string | null
  label?: string
  catalog_number?: string
  genre?: string
  mood?: string
  artwork_media_id?: string | null
  tracks?: Array<{
    id: string
    slug: string
    title: string
    description?: string
    duration_ms?: number | null
    musical_key?: string
    meter?: string
    tempo_bpm?: number | null
    mood?: string
    instruments?: string[]
    explicit?: boolean
    disc_number?: number
    position: number
  }>
  credits?: Array<{ role: string; name: string; position: number }>
}

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner', 'editor'])
  const admin = getAdminSupabase(event)
  const [
    { data: releases, error: releasesError },
    { data: order, error: orderError },
    { data: tracks, error: tracksError },
    { data: credits, error: creditsError },
    { data: drafts, error: draftsError },
    { data: media, error: mediaError },
    { data: jobs, error: jobsError },
    { data: collections, error: collectionsError },
  ] = await Promise.all([
    admin.from('releases').select('*').neq('state', 'archived').order('sort_order'),
    admin.from('release_tracks').select('release_id, track_id, disc_number, position'),
    admin.from('tracks').select('*').neq('state', 'archived'),
    admin.from('catalog_credits').select('*').order('position'),
    admin.from('release_drafts').select('release_id, payload, updated_at'),
    admin
      .from('media_objects')
      .select('id, release_id, track_id, kind, status, bucket_id, object_path, metadata'),
    admin
      .from('media_jobs')
      .select('id, media_object_id, status, attempts, error_category, updated_at'),
    admin.from('collections').select('id, slug, title, description, state, sort_order'),
  ])
  if (
    releasesError ||
    orderError ||
    tracksError ||
    creditsError ||
    draftsError ||
    mediaError ||
    jobsError ||
    collectionsError
  ) {
    throw createError({ statusCode: 503, statusMessage: 'The catalog workspace could not load.' })
  }

  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const draftByRelease = new Map(drafts.map((draft) => [draft.release_id, draft]))
  const jobByMedia = new Map(jobs.map((job) => [job.media_object_id, job]))
  const mediaForTrack = new Map<string, typeof media>()
  for (const item of media) {
    if (!item.track_id) continue
    mediaForTrack.set(item.track_id, [...(mediaForTrack.get(item.track_id) ?? []), item])
  }

  return {
    releases: releases.map((release) => {
      const draft = draftByRelease.get(release.id)
      const payload = draft?.payload as DraftPayload | undefined
      const releaseOrder = order
        .filter(({ release_id }) => release_id === release.id)
        .sort(
          (left, right) => left.disc_number - right.disc_number || left.position - right.position,
        )
      const input = payload
        ? releaseDraftSchema.parse({
            id: release.id,
            slug: payload.slug,
            title: payload.title,
            subtitle: payload.subtitle,
            description: payload.description,
            releaseType: payload.release_type,
            releaseDate: payload.release_date,
            label: payload.label,
            catalogNumber: payload.catalog_number,
            genre: payload.genre,
            mood: payload.mood,
            artworkMediaId: payload.artwork_media_id,
            tracks: payload.tracks?.map((track) => ({
              id: track.id,
              slug: track.slug,
              title: track.title,
              description: track.description,
              durationMs: track.duration_ms,
              musicalKey: track.musical_key,
              meter: track.meter,
              tempoBpm: track.tempo_bpm,
              mood: track.mood,
              instruments: track.instruments,
              explicit: track.explicit,
              discNumber: track.disc_number,
              position: track.position,
            })),
            credits: payload.credits,
          })
        : releaseDraftSchema.parse({
            id: release.id,
            slug: release.slug,
            title: release.title,
            subtitle: release.subtitle,
            description: release.description,
            releaseType: release.release_type,
            releaseDate: release.release_date,
            label: release.label,
            catalogNumber: release.catalog_number,
            genre: release.genre,
            mood: release.mood,
            artworkMediaId: release.artwork_media_id,
            tracks: releaseOrder.flatMap((position) => {
              const track = trackById.get(position.track_id)
              return track
                ? [
                    {
                      id: track.id,
                      slug: track.slug,
                      title: track.title,
                      description: track.description,
                      durationMs: track.duration_ms,
                      musicalKey: track.musical_key,
                      meter: track.meter,
                      tempoBpm: track.tempo_bpm ? Number(track.tempo_bpm) : null,
                      mood: track.mood,
                      instruments: track.instruments,
                      explicit: track.explicit,
                      discNumber: position.disc_number,
                      position: position.position,
                    },
                  ]
                : []
            }),
            credits: credits
              .filter(
                ({ resource_type, resource_id }) =>
                  resource_type === 'release' && resource_id === release.id,
              )
              .map(({ role, name, position }) => ({ role, name, position })),
          })

      return {
        ...input,
        state: release.state,
        publishedAt: release.published_at,
        hasDraft: Boolean(draft),
        draftUpdatedAt: draft?.updated_at ?? null,
        tracks: input.tracks.map((track) => {
          const trackMedia = mediaForTrack.get(track.id!) ?? []
          const source = trackMedia.find(({ kind }) => kind === 'source_audio')
          const preview = trackMedia.find(
            ({ kind, status }) => kind === 'preview_audio' && status === 'ready',
          )
          return {
            ...track,
            media: {
              source: source
                ? { id: source.id, status: source.status, job: jobByMedia.get(source.id) ?? null }
                : null,
              preview: preview
                ? {
                    id: preview.id,
                    url: admin.storage.from(preview.bucket_id).getPublicUrl(preview.object_path)
                      .data.publicUrl,
                    metadata: preview.metadata,
                  }
                : null,
            },
          }
        }),
      }
    }),
    collections,
  }
})
