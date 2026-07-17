<script setup lang="ts">
import type { CommerceCatalogResponse, CommerceProduct } from '#shared/types/commerce'
import type { LibraryPlaylist, LibraryResponse } from '#shared/types/library'
import type {
  PublicCatalogRelease,
  PublicCatalogResponse,
  PublicCatalogTrack,
} from '#shared/types/catalog'

type MusicView = 'explore' | 'tracks' | 'collections' | 'albums' | 'favorites' | 'playlists'
type TrackSort = 'authored' | 'newest' | 'oldest' | 'a_z' | 'z_a' | 'tempo_asc' | 'tempo_desc'
type AlbumSort = 'authored' | 'newest' | 'oldest' | 'a_z' | 'z_a'
type CollectionSort = 'authored' | 'a_z' | 'z_a'
type PlaylistSort = 'updated' | 'a_z' | 'z_a' | 'most_tracks'
type TempoFilter = '' | 'slow' | 'moderate' | 'fast'
type DurationFilter = '' | 'short' | 'medium' | 'long'

type BrowserTrack = PublicCatalogTrack & {
  album: Pick<PublicCatalogRelease, 'id' | 'slug' | 'title' | 'release_date' | 'release_type'>
  catalogOrder: number
}

const artist = useArtistConfig()
const starterMode = useStarterMode()
const { data, error, status, refresh } = await useFetch<PublicCatalogResponse>('/api/catalog')
const { data: library, refresh: refreshLibrary } = await useFetch<LibraryResponse>('/api/library')
const { data: commerce } = await useFetch<CommerceCatalogResponse>('/api/commerce/products')
const { track: recordTelemetry } = useTelemetry()
const audioPlayer = useAudioPlayer()
const libraryMessage = ref('')
const mobileFiltersOpen = ref(false)
const mobileLibrary = useMediaQuery('(max-width: 48rem)')
const filterPanelVisible = computed(() => !mobileLibrary.value || mobileFiltersOpen.value)

const activeView = ref<MusicView>('tracks')
const query = ref('')
const meter = ref('')
const mood = ref('')
const musicalKey = ref('')
const instrument = ref('')
const tempo = ref<TempoFilter>('')
const duration = ref<DurationFilter>('')
const trackSort = ref<TrackSort>('authored')
const albumSort = ref<AlbumSort>('authored')
const collectionSort = ref<CollectionSort>('authored')
const playlistSort = ref<PlaylistSort>('updated')

const viewLabels: Record<MusicView, string> = {
  explore: 'Explore',
  tracks: 'Tracks',
  collections: 'Collections',
  albums: 'Albums',
  favorites: 'Favorites',
  playlists: 'Playlists',
}

const views: MusicView[] = ['explore', 'tracks', 'collections', 'albums', 'favorites', 'playlists']

const catalogTracks = computed<BrowserTrack[]>(() => {
  let catalogOrder = 0
  const seen = new Set<string>()
  return (data.value?.releases ?? []).flatMap((release) =>
    release.tracks.flatMap((track) => {
      if (seen.has(track.id)) return []
      seen.add(track.id)
      catalogOrder += 1
      return [
        {
          ...track,
          album: {
            id: release.id,
            slug: release.slug,
            title: release.title,
            release_date: release.release_date,
            release_type: release.release_type,
          },
          catalogOrder,
        },
      ]
    }),
  )
})

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

const meters = computed(() => unique(catalogTracks.value.map((track) => track.meter)))
const moods = computed(() => unique(catalogTracks.value.map((track) => track.mood)))
const musicalKeys = computed(() => unique(catalogTracks.value.map((track) => track.musical_key)))
const instruments = computed(() =>
  unique(catalogTracks.value.flatMap((track) => track.instruments)),
)

function includesSearch(values: Array<string | null | undefined>) {
  const normalized = query.value.trim().toLocaleLowerCase()
  return (
    !normalized || values.some((value) => value?.toLocaleLowerCase().includes(normalized) ?? false)
  )
}

function releaseTime(value: string | null) {
  return value ? new Date(`${value}T00:00:00Z`).getTime() : 0
}

function matchesTempo(track: BrowserTrack) {
  if (!tempo.value) return true
  if (track.tempo_bpm === null) return false
  if (tempo.value === 'slow') return track.tempo_bpm < 75
  if (tempo.value === 'moderate') return track.tempo_bpm >= 75 && track.tempo_bpm < 90
  return track.tempo_bpm >= 90
}

function matchesDuration(track: BrowserTrack) {
  if (!duration.value) return true
  if (track.duration_ms === null) return false
  const minutes = track.duration_ms / 60_000
  if (duration.value === 'short') return minutes < 3
  if (duration.value === 'medium') return minutes >= 3 && minutes < 6
  return minutes >= 6
}

const filteredTracks = computed(() => {
  const tracks = catalogTracks.value.filter(
    (track) =>
      includesSearch([
        track.title,
        track.description,
        track.album.title,
        track.mood,
        track.meter,
        track.musical_key,
        ...track.instruments,
      ]) &&
      (!meter.value || track.meter === meter.value) &&
      (!mood.value || track.mood === mood.value) &&
      (!musicalKey.value || track.musical_key === musicalKey.value) &&
      (!instrument.value || track.instruments.includes(instrument.value)) &&
      matchesTempo(track) &&
      matchesDuration(track),
  )

  return [...tracks].sort((left, right) => {
    if (trackSort.value === 'newest') {
      return releaseTime(right.album.release_date) - releaseTime(left.album.release_date)
    }
    if (trackSort.value === 'oldest') {
      return releaseTime(left.album.release_date) - releaseTime(right.album.release_date)
    }
    if (trackSort.value === 'a_z') return left.title.localeCompare(right.title)
    if (trackSort.value === 'z_a') return right.title.localeCompare(left.title)
    if (trackSort.value === 'tempo_asc') {
      return (
        (left.tempo_bpm ?? Number.POSITIVE_INFINITY) - (right.tempo_bpm ?? Number.POSITIVE_INFINITY)
      )
    }
    if (trackSort.value === 'tempo_desc') {
      return (
        (right.tempo_bpm ?? Number.NEGATIVE_INFINITY) - (left.tempo_bpm ?? Number.NEGATIVE_INFINITY)
      )
    }
    return left.catalogOrder - right.catalogOrder
  })
})

const favoriteTracks = computed(() => {
  if (!library.value?.authenticated) return []
  const favoriteIds = new Set(library.value.favoriteTrackIds)
  return filteredTracks.value.filter((track) => favoriteIds.has(track.id))
})

const visibleTracks = computed(() =>
  activeView.value === 'favorites' ? favoriteTracks.value : filteredTracks.value,
)

const filteredAlbums = computed(() => {
  const releases = (data.value?.releases ?? []).filter((release) =>
    includesSearch([
      release.title,
      release.subtitle,
      release.description,
      release.genre,
      release.mood,
      ...release.tracks.map((track) => track.title),
    ]),
  )
  return [...releases].sort((left, right) => {
    if (albumSort.value === 'newest') {
      return releaseTime(right.release_date) - releaseTime(left.release_date)
    }
    if (albumSort.value === 'oldest') {
      return releaseTime(left.release_date) - releaseTime(right.release_date)
    }
    if (albumSort.value === 'a_z') return left.title.localeCompare(right.title)
    if (albumSort.value === 'z_a') return right.title.localeCompare(left.title)
    return 0
  })
})

const filteredCollections = computed(() => {
  const collections = (data.value?.collections ?? []).filter((collection) =>
    includesSearch([collection.title, collection.description]),
  )
  return [...collections].sort((left, right) => {
    if (collectionSort.value === 'a_z') return left.title.localeCompare(right.title)
    if (collectionSort.value === 'z_a') return right.title.localeCompare(left.title)
    return 0
  })
})

const sortedPlaylists = computed(() => {
  if (!library.value?.authenticated) return []
  const playlists = library.value.playlists.filter((playlist) =>
    includesSearch([
      playlist.title,
      playlist.description,
      ...playlist.tracks.map((track) => track.title),
    ]),
  )
  return [...playlists].sort((left, right) => {
    if (playlistSort.value === 'a_z') return left.title.localeCompare(right.title)
    if (playlistSort.value === 'z_a') return right.title.localeCompare(left.title)
    if (playlistSort.value === 'most_tracks') return right.tracks.length - left.tracks.length
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  })
})

const currentResultCount = computed(() => {
  if (activeView.value === 'explore') return catalogTracks.value.length
  if (activeView.value === 'tracks') return visibleTracks.value.length
  if (activeView.value === 'favorites') return favoriteTracks.value.length
  if (activeView.value === 'albums') return filteredAlbums.value.length
  if (activeView.value === 'collections') return filteredCollections.value.length
  return sortedPlaylists.value.length
})

const playableTracks = computed(() =>
  visibleTracks.value.flatMap((track) =>
    track.preview
      ? [
          {
            id: track.id,
            slug: track.slug,
            title: starterMode ? 'Track Title' : track.title,
            artist: starterMode ? 'Artist Name' : artist.identity.name,
            releaseTitle: starterMode ? 'Album Title' : track.album.title,
            href: `/music/tracks/${track.slug}`,
            src: track.preview.url,
          },
        ]
      : [],
  ),
)

watch(playableTracks, (tracks) => audioPlayer.loadQueue(tracks), { immediate: true })

function playTrack(trackId: string) {
  const index = playableTracks.value.findIndex(({ id }) => id === trackId)
  if (index >= 0) audioPlayer.playAt(index)
}

function clearTrackFilters() {
  meter.value = ''
  mood.value = ''
  musicalKey.value = ''
  instrument.value = ''
  tempo.value = ''
  duration.value = ''
}

function isFavorite(trackId: string) {
  return library.value?.authenticated === true && library.value.favoriteTrackIds.includes(trackId)
}

async function toggleFavorite(track: BrowserTrack) {
  if (library.value?.authenticated !== true) {
    await navigateTo(`/sign-in?redirect=${encodeURIComponent('/music')}`)
    return
  }
  await $fetch('/api/library/favorites', {
    method: 'POST',
    body: { trackId: track.id, favorite: !isFavorite(track.id) },
  })
  await refreshLibrary()
  libraryMessage.value = isFavorite(track.id)
    ? `${starterMode ? 'Track Title' : track.title} saved to favorites.`
    : `${starterMode ? 'Track Title' : track.title} removed from favorites.`
}

async function addToPlaylist(track: BrowserTrack, playlist: LibraryPlaylist) {
  if (playlist.tracks.some(({ id }) => id === track.id)) {
    libraryMessage.value = 'That track is already in this playlist.'
    return
  }
  await $fetch(`/api/library/playlists/${playlist.id}`, {
    method: 'PUT',
    body: {
      title: playlist.title,
      description: playlist.description,
      trackIds: [...playlist.tracks.map(({ id }) => id), track.id],
    },
  })
  await refreshLibrary()
  libraryMessage.value = `Track added to ${playlist.title}.`
}

function commerceProduct(track: BrowserTrack): CommerceProduct | null {
  const products = commerce.value?.products ?? []
  return (
    products.find(
      (product) => product.resourceType === 'track' && product.resourceId === track.id,
    ) ??
    products.find(
      (product) => product.resourceType === 'release' && product.resourceId === track.album.id,
    ) ??
    null
  )
}

function buyLabel(track: BrowserTrack) {
  return commerceProduct(track)?.productType === 'track_download' ? 'Buy Track' : 'Buy Album'
}

function commerceHref(track: BrowserTrack) {
  const product = commerceProduct(track)
  return product ? `/support#${product.slug}` : '/support'
}

function displayTrackTitle(track: BrowserTrack) {
  return starterMode ? `Track Title ${String(track.catalogOrder).padStart(2, '0')}` : track.title
}

function displayAlbumTitle(track: BrowserTrack) {
  return starterMode ? 'Album Title' : track.album.title
}

function artworkLabel(track: BrowserTrack) {
  if (starterMode) return 'Art'
  return track.album.title
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
}

function waveformPoints(track: BrowserTrack) {
  const points = track.preview?.waveform ?? []
  if (points.length <= 36) return points
  const step = points.length / 36
  return Array.from({ length: 36 }, (_, index) => points[Math.floor(index * step)] ?? 0)
}

function viewCount(view: MusicView): number | string {
  if (view === 'explore') return catalogTracks.value.length
  if (view === 'tracks') return catalogTracks.value.length
  if (view === 'collections') return data.value?.collections.length ?? 0
  if (view === 'albums') return data.value?.releases.length ?? 0
  if (view === 'favorites') {
    return library.value?.authenticated ? library.value.favoriteTrackIds.length : '—'
  }
  return library.value?.authenticated ? library.value.playlists.length : '—'
}

function submitSearch() {
  void recordTelemetry('catalog_search', { value: currentResultCount.value })
}

function formatDuration(value: number | null) {
  if (!value) return '—'
  const totalSeconds = Math.round(value / 1000)
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function formatReleaseType(value: string) {
  return value === 'ep' ? 'EP' : value.charAt(0).toUpperCase() + value.slice(1)
}

useSeoMeta({ title: 'Music' })
</script>

<template>
  <div class="page-frame interior-page music-page">
    <header class="music-page-heading">
      <div>
        <p class="eyebrow">Library</p>
        <h1>Music</h1>
      </div>
      <p>{{ catalogTracks.length }} tracks</p>
    </header>

    <ServiceState
      v-if="status === 'pending'"
      eyebrow="Catalog"
      title="Loading the artist's music…"
      message="Published tracks, albums, and collections are being gathered."
    />
    <ServiceState
      v-else-if="error"
      eyebrow="Catalog unavailable"
      title="The music service is not responding."
      message="Nothing has been changed. Try the request again when the service is available."
      retryable
      @retry="refresh"
    />
    <ServiceState
      v-else-if="!data?.releases.length && !data?.collections.length"
      eyebrow="Catalog"
      title="No music has been published yet."
      message="Draft releases stay private until the artist publishes them."
    />

    <div v-else-if="data" class="music-browser">
      <aside class="music-browser__sidebar" aria-label="Browse music">
        <p class="music-sidebar-heading">Library</p>
        <nav class="music-view-navigation" aria-label="Music catalog views">
          <button
            v-for="view in views"
            :key="view"
            type="button"
            :aria-pressed="activeView === view"
            @click="activeView = view"
          >
            <span>{{ viewLabels[view] }}</span>
            <span aria-hidden="true">{{ viewCount(view) }}</span>
          </button>
        </nav>

        <form
          v-if="activeView !== 'playlists'"
          class="music-catalog-controls"
          role="search"
          @submit.prevent="submitSearch"
        >
          <p class="music-sidebar-heading">Filters</p>
          <button
            class="music-mobile-filter-toggle"
            type="button"
            aria-controls="music-filter-panel"
            :aria-expanded="filterPanelVisible"
            @click="mobileFiltersOpen = !mobileFiltersOpen"
          >
            {{ filterPanelVisible ? 'Hide filters' : 'Show filters' }}
          </button>
          <div v-show="filterPanelVisible" id="music-filter-panel" class="music-filter-panel">
            <label class="music-search-field">
              <span>Search {{ viewLabels[activeView].toLowerCase() }}</span>
              <input
                v-model="query"
                type="search"
                autocomplete="off"
                placeholder="Title or detail"
              />
            </label>

            <fieldset
              v-if="activeView === 'tracks' || activeView === 'favorites'"
              class="music-filter-fields"
            >
              <legend class="sr-only">Filter tracks</legend>
              <details>
                <summary>Meter</summary>
                <label>
                  <span class="sr-only">Meter</span>
                  <select v-model="meter">
                    <option value="">All meters</option>
                    <option v-for="value in meters" :key="value" :value="value">
                      {{ value }}
                    </option>
                  </select>
                </label>
              </details>
              <details>
                <summary>Tempo</summary>
                <label>
                  <span class="sr-only">Tempo</span>
                  <select v-model="tempo">
                    <option value="">All tempos</option>
                    <option value="slow">Under 75 BPM</option>
                    <option value="moderate">75–89 BPM</option>
                    <option value="fast">90 BPM and above</option>
                  </select>
                </label>
              </details>
              <details>
                <summary>Mood</summary>
                <label>
                  <span class="sr-only">Mood</span>
                  <select v-model="mood">
                    <option value="">All moods</option>
                    <option v-for="value in moods" :key="value" :value="value">
                      {{ value }}
                    </option>
                  </select>
                </label>
              </details>
              <details>
                <summary>Key</summary>
                <label>
                  <span class="sr-only">Key</span>
                  <select v-model="musicalKey">
                    <option value="">All keys</option>
                    <option v-for="value in musicalKeys" :key="value" :value="value">
                      {{ value }}
                    </option>
                  </select>
                </label>
              </details>
              <details>
                <summary>Instruments</summary>
                <label>
                  <span class="sr-only">Instruments</span>
                  <select v-model="instrument">
                    <option value="">All instruments</option>
                    <option v-for="value in instruments" :key="value" :value="value">
                      {{ value }}
                    </option>
                  </select>
                </label>
              </details>
              <details>
                <summary>Duration</summary>
                <label>
                  <span class="sr-only">Duration</span>
                  <select v-model="duration">
                    <option value="">Any duration</option>
                    <option value="short">Under 3 minutes</option>
                    <option value="medium">3–6 minutes</option>
                    <option value="long">6 minutes and above</option>
                  </select>
                </label>
              </details>
              <button class="music-clear-filters" type="button" @click="clearTrackFilters">
                Clear filters
              </button>
            </fieldset>
          </div>
        </form>
      </aside>

      <section class="music-browser__results" :aria-labelledby="`music-${activeView}-heading`">
        <header class="music-results-heading">
          <div>
            <p class="section-number">{{ currentResultCount }} results</p>
            <h2 :id="`music-${activeView}-heading`">
              {{ activeView === 'tracks' ? 'All Tracks' : viewLabels[activeView] }}
            </h2>
          </div>
          <label v-if="activeView === 'tracks' || activeView === 'favorites'">
            <span>Sort tracks</span>
            <select v-model="trackSort">
              <option value="authored">Artist order</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="a_z">A–Z</option>
              <option value="z_a">Z–A</option>
              <option value="tempo_asc">Slow to fast</option>
              <option value="tempo_desc">Fast to slow</option>
            </select>
          </label>
          <label v-else-if="activeView === 'albums'">
            <span>Sort albums</span>
            <select v-model="albumSort">
              <option value="authored">Artist order</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="a_z">A–Z</option>
              <option value="z_a">Z–A</option>
            </select>
          </label>
          <label v-else-if="activeView === 'collections'">
            <span>Sort collections</span>
            <select v-model="collectionSort">
              <option value="authored">Artist order</option>
              <option value="a_z">A–Z</option>
              <option value="z_a">Z–A</option>
            </select>
          </label>
          <label v-else-if="library?.authenticated">
            <span>Sort playlists</span>
            <select v-model="playlistSort">
              <option value="updated">Recently updated</option>
              <option value="a_z">A–Z</option>
              <option value="z_a">Z–A</option>
              <option value="most_tracks">Most tracks</option>
            </select>
          </label>
        </header>

        <p v-if="query" class="music-search-status" role="status">
          Showing {{ currentResultCount }} matching {{ viewLabels[activeView].toLowerCase() }}.
          Search words remain in this browser.
        </p>
        <p v-if="libraryMessage" class="music-library-message" role="status">
          {{ libraryMessage }}
        </p>

        <template v-if="activeView === 'tracks' || activeView === 'favorites'">
          <div class="music-track-columns" aria-hidden="true">
            <span>Track</span>
            <span>Waveform</span>
            <span>Actions</span>
          </div>
          <ol v-if="visibleTracks.length" class="music-track-list">
            <li v-for="track in visibleTracks" :key="track.id" class="music-track-row">
              <button
                class="music-track-row__play"
                type="button"
                :disabled="!track.preview"
                :aria-label="
                  track.preview
                    ? `Play ${displayTrackTitle(track)}`
                    : `Preview unavailable for ${displayTrackTitle(track)}`
                "
                @click="playTrack(track.id)"
              >
                {{
                  audioPlayer.currentTrack.value?.id === track.id && audioPlayer.isPlaying.value
                    ? 'Playing'
                    : track.preview
                      ? 'Play'
                      : 'Soon'
                }}
              </button>
              <span class="music-track-row__art" aria-hidden="true">{{ artworkLabel(track) }}</span>
              <div class="music-track-row__identity">
                <NuxtLink class="music-track-row__title" :to="`/music/tracks/${track.slug}`">
                  {{ displayTrackTitle(track) }}
                </NuxtLink>
                <span
                  >{{ formatDuration(track.duration_ms) }} · {{ displayAlbumTitle(track) }}</span
                >
                <span class="music-track-row__metadata">
                  {{ starterMode ? 'Tempo' : track.tempo_bpm ? `${track.tempo_bpm} BPM` : '—' }}
                  · {{ starterMode ? 'Meter' : track.meter || '—' }} ·
                  {{ starterMode ? 'Key' : track.musical_key || '—' }} ·
                  {{ starterMode ? 'Mood' : track.mood || '—' }}
                </span>
              </div>
              <span
                class="music-track-waveform"
                :class="{ 'music-track-waveform--empty': !waveformPoints(track).length }"
                aria-label="Track waveform"
              >
                <i
                  v-for="(point, index) in waveformPoints(track)"
                  :key="index"
                  :style="{ height: `${Math.max(8, point * 100)}%` }"
                />
                <span v-if="!waveformPoints(track).length">{{
                  starterMode ? 'Waveform' : '—'
                }}</span>
              </span>
              <div class="music-track-row__actions">
                <NuxtLink
                  v-if="commerceProduct(track)"
                  class="music-row-action"
                  :to="commerceHref(track)"
                >
                  {{ buyLabel(track) }}
                </NuxtLink>
                <NuxtLink class="music-row-action" :to="`/licensing?track=${track.slug}`">
                  License
                </NuxtLink>
                <button
                  class="music-icon-action"
                  type="button"
                  :aria-label="
                    isFavorite(track.id)
                      ? `Remove ${displayTrackTitle(track)} from favorites`
                      : `Add ${displayTrackTitle(track)} to favorites`
                  "
                  :title="isFavorite(track.id) ? 'Remove from favorites' : 'Add to favorites'"
                  @click="toggleFavorite(track)"
                >
                  {{ isFavorite(track.id) ? '♥' : '♡' }}
                </button>
                <details
                  v-if="library?.authenticated && library.playlists.length"
                  class="music-playlist-menu"
                >
                  <summary
                    :aria-label="`Add ${displayTrackTitle(track)} to playlist`"
                    title="Add to playlist"
                  >
                    +
                  </summary>
                  <div>
                    <button
                      v-for="playlist in library.playlists"
                      :key="playlist.id"
                      type="button"
                      @click="addToPlaylist(track, playlist)"
                    >
                      {{ playlist.title }}
                    </button>
                  </div>
                </details>
                <NuxtLink
                  v-else
                  class="music-icon-action"
                  :to="library?.authenticated ? '/account' : '/sign-in?redirect=/music'"
                  :aria-label="`Add ${displayTrackTitle(track)} to playlist`"
                  title="Add to playlist"
                >
                  +
                </NuxtLink>
              </div>
            </li>
          </ol>
          <div
            v-else-if="activeView === 'favorites' && !library?.authenticated"
            class="music-library-gate"
          >
            <h3>Sign in to reach your favorites.</h3>
            <NuxtLink class="text-action" to="/sign-in?redirect=/music">Sign in</NuxtLink>
          </div>
          <p v-else class="music-empty-result">No tracks match the current search and filters.</p>
        </template>

        <div v-else-if="activeView === 'explore'" class="music-explore">
          <section aria-labelledby="explore-albums-heading">
            <header>
              <h3 id="explore-albums-heading">Albums</h3>
              <button type="button" @click="activeView = 'albums'">View all</button>
            </header>
            <ol class="music-album-grid">
              <li v-for="release in filteredAlbums.slice(0, 4)" :key="release.id">
                <NuxtLink class="music-album" :to="`/music/${release.slug}`">
                  <span class="music-album__art" aria-hidden="true">
                    <span>Album Artwork</span>
                    <strong>{{ starterMode ? 'Album Title' : release.title }}</strong>
                    <span>{{ starterMode ? 'Artist Name' : artist.identity.name }}</span>
                  </span>
                </NuxtLink>
              </li>
            </ol>
          </section>
          <section aria-labelledby="explore-collections-heading">
            <header>
              <h3 id="explore-collections-heading">Collections</h3>
              <button type="button" @click="activeView = 'collections'">View all</button>
            </header>
            <ol class="music-collection-list">
              <li
                v-for="(collection, index) in filteredCollections.slice(0, 4)"
                :key="collection.id"
              >
                <span>{{ String(index + 1).padStart(2, '0') }}</span>
                <div>
                  <NuxtLink :to="`/music/collections/${collection.slug}`">
                    {{ starterMode ? 'Collection Title' : collection.title }}
                  </NuxtLink>
                </div>
                <span>{{ collection.trackCount }} tracks</span>
              </li>
            </ol>
          </section>
        </div>

        <ol v-else-if="activeView === 'albums' && filteredAlbums.length" class="music-album-grid">
          <li v-for="release in filteredAlbums" :key="release.id">
            <NuxtLink class="music-album" :to="`/music/${release.slug}`">
              <span class="music-album__art" aria-hidden="true">
                <span>
                  {{
                    starterMode ? 'Release Type · Year' : formatReleaseType(release.release_type)
                  }}
                </span>
                <strong>{{ starterMode ? 'Album Title' : release.title }}</strong>
                <span>{{ starterMode ? 'Artist Name' : artist.identity.name }}</span>
              </span>
              <span class="music-album__details">
                <strong>{{ starterMode ? 'Album Title' : release.title }}</strong>
                <span>
                  {{ formatReleaseType(release.release_type) }} · {{ release.tracks.length }}
                  {{ release.tracks.length === 1 ? 'track' : 'tracks' }}
                </span>
              </span>
            </NuxtLink>
          </li>
        </ol>

        <ol
          v-else-if="activeView === 'collections' && filteredCollections.length"
          class="music-collection-list"
        >
          <li v-for="(collection, index) in filteredCollections" :key="collection.id">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <NuxtLink :to="`/music/collections/${collection.slug}`">
                {{ starterMode ? 'Collection Title' : collection.title }}
              </NuxtLink>
              <p>{{ starterMode ? 'Collection Description' : collection.description }}</p>
            </div>
            <span>{{ collection.trackCount }} tracks</span>
          </li>
        </ol>

        <template v-else-if="activeView === 'playlists'">
          <ol v-if="library?.authenticated && sortedPlaylists.length" class="music-playlist-list">
            <li v-for="playlist in sortedPlaylists" :key="playlist.id">
              <header>
                <div>
                  <h3>{{ playlist.title }}</h3>
                  <p>{{ playlist.description || 'Private listening sequence.' }}</p>
                </div>
                <span>{{ playlist.tracks.length }} tracks</span>
              </header>
              <ol>
                <li v-for="track in playlist.tracks" :key="track.id">
                  <span>{{ String(track.position).padStart(2, '0') }}</span>
                  <NuxtLink :to="`/music/tracks/${track.slug}`">{{ track.title }}</NuxtLink>
                </li>
              </ol>
            </li>
          </ol>
          <div v-else-if="library?.authenticated" class="music-library-gate">
            <h3>No playlists yet.</h3>
            <p>Create and arrange private playlists from your account.</p>
            <NuxtLink class="text-action" to="/account">Open account</NuxtLink>
          </div>
          <div v-else class="music-library-gate">
            <p class="section-number">Private library</p>
            <h3>Sign in to reach your playlists.</h3>
            <p>Albums, tracks, and collections remain public. Playlists belong to each listener.</p>
            <div class="action-row">
              <NuxtLink class="text-action text-action--primary" to="/sign-in">Sign in</NuxtLink>
              <NuxtLink class="text-action" to="/sign-up">Create an account</NuxtLink>
            </div>
          </div>
        </template>

        <p v-else class="music-empty-result" role="status">
          No {{ viewLabels[activeView].toLowerCase() }} match this search.
        </p>
      </section>
    </div>
  </div>
</template>
