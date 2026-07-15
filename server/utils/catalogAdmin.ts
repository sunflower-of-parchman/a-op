import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReleaseDraftInput } from '#shared/schemas/catalog'
import type { AuthIdentity } from './supabase'
import type { Database, Json } from '#shared/types/database'

export function normalizeReleaseDraft(
  input: ReleaseDraftInput,
  releaseId = input.id ?? randomUUID(),
) {
  return {
    id: releaseId,
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    releaseType: input.releaseType,
    releaseDate: input.releaseDate,
    label: input.label,
    catalogNumber: input.catalogNumber,
    genre: input.genre,
    mood: input.mood,
    artworkMediaId: input.artworkMediaId,
    tracks: input.tracks.map((track) => ({ ...track, id: track.id ?? randomUUID() })),
    credits: input.credits.map((credit, index) => ({ ...credit, position: index + 1 })),
  }
}

export function releaseDraftPayload(input: ReturnType<typeof normalizeReleaseDraft>) {
  return {
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    release_type: input.releaseType,
    release_date: input.releaseDate,
    label: input.label,
    catalog_number: input.catalogNumber,
    genre: input.genre,
    mood: input.mood,
    artwork_media_id: input.artworkMediaId,
    tracks: input.tracks.map((track) => ({
      id: track.id,
      slug: track.slug,
      title: track.title,
      description: track.description,
      duration_ms: track.durationMs,
      musical_key: track.musicalKey,
      meter: track.meter,
      tempo_bpm: track.tempoBpm,
      mood: track.mood,
      instruments: track.instruments,
      explicit: track.explicit,
      disc_number: track.discNumber,
      position: track.position,
    })),
    credits: input.credits,
  } satisfies Json
}

export async function saveReleaseDraft(
  admin: SupabaseClient<Database>,
  identity: AuthIdentity,
  input: ReleaseDraftInput,
  expectedId?: string,
) {
  const release = normalizeReleaseDraft(input, expectedId)
  const { data: existing, error: existingError } = await admin
    .from('releases')
    .select('id')
    .eq('id', release.id)
    .maybeSingle()
  if (existingError) throw new Error('Release lookup failed.')
  if (!existing) {
    const { error } = await admin.from('releases').insert({
      id: release.id,
      slug: release.slug,
      title: release.title,
      subtitle: release.subtitle,
      description: release.description,
      release_type: release.releaseType,
      release_date: release.releaseDate,
      label: release.label,
      catalog_number: release.catalogNumber,
      genre: release.genre,
      mood: release.mood,
      artwork_media_id: release.artworkMediaId,
      state: 'draft',
      created_by: identity.user.id,
    })
    if (error) throw new Error('Release draft shell could not be created.')
  }

  for (const track of release.tracks) {
    const { data: existingTrack, error: trackLookupError } = await admin
      .from('tracks')
      .select('id')
      .eq('id', track.id)
      .maybeSingle()
    if (trackLookupError) throw new Error('Track lookup failed.')
    if (!existingTrack) {
      const { error } = await admin.from('tracks').insert({
        id: track.id,
        slug: track.slug,
        title: track.title,
        description: track.description,
        primary_release_id: release.id,
        duration_ms: track.durationMs,
        musical_key: track.musicalKey,
        meter: track.meter,
        tempo_bpm: track.tempoBpm,
        mood: track.mood,
        instruments: track.instruments,
        explicit: track.explicit,
        state: 'draft',
        created_by: identity.user.id,
      })
      if (error) throw new Error('Track draft shell could not be created.')
    }
  }

  const payload = releaseDraftPayload(release)
  const { error: draftError } = await admin.from('release_drafts').upsert({
    release_id: release.id,
    payload,
    updated_by: identity.user.id,
    updated_at: new Date().toISOString(),
  })
  if (draftError) throw new Error('Release draft could not be saved.')
  await admin.from('audit_records').insert({
    actor_id: identity.user.id,
    event_type: 'catalog.release_draft_saved',
    target_type: 'release',
    target_id: release.id,
    detail: { tracks: release.tracks.length },
  })
  return release
}
