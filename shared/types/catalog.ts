export type PublicCatalogPreview = {
  id: string
  track_id: string | null
  media_type: string
  url: string
  waveform: number[]
}

export type PublicCatalogTrack = {
  id: string
  slug: string
  title: string
  description: string
  duration_ms: number | null
  musical_key: string
  meter: string
  tempo_bpm: number | null
  mood: string
  instruments: string[]
  explicit: boolean
  position: number
  preview: PublicCatalogPreview | null
}

export type PublicCatalogRelease = {
  id: string
  slug: string
  title: string
  subtitle: string
  description: string
  release_date: string | null
  release_type: string
  genre: string
  mood: string
  tracks: PublicCatalogTrack[]
}

export type PublicCatalogCollection = {
  id: string
  slug: string
  title: string
  description: string
  trackCount: number
}

export type PublicCatalogResponse = {
  releases: PublicCatalogRelease[]
  collections: PublicCatalogCollection[]
}
