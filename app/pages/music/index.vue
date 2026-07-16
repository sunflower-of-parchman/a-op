<script setup lang="ts">
import type { LibraryResponse } from '#shared/types/library'
import type {
  PublicCatalogRelease,
  PublicCatalogResponse,
  PublicCatalogTrack,
} from '#shared/types/catalog'

type MusicView = 'tracks' | 'albums' | 'collections' | 'playlists'
type TrackSort = 'authored' | 'newest' | 'oldest' | 'a_z' | 'z_a' | 'tempo_asc' | 'tempo_desc'
type AlbumSort = 'authored' | 'newest' | 'oldest' | 'a_z' | 'z_a'
type CollectionSort = 'authored' | 'a_z' | 'z_a'
type PlaylistSort = 'updated' | 'a_z' | 'z_a' | 'most_tracks'
type TempoFilter = '' | 'slow' | 'moderate' | 'fast'

type BrowserTrack = PublicCatalogTrack & {
  album: Pick<PublicCatalogRelease, 'id' | 'slug' | 'title' | 'release_date' | 'release_type'>
  catalogOrder: number
}

const artist = useArtistConfig()
const starterMode = useStarterMode()
const { data, error, status, refresh } = await useFetch<PublicCatalogResponse>('/api/catalog')
const { data: library } = await useFetch<LibraryResponse>('/api/library')
const { track: recordTelemetry } = useTelemetry()
const audioPlayer = useAudioPlayer()

const activeView = ref<MusicView>('tracks')
const query = ref('')
const meter = ref('')
const mood = ref('')
const instrument = ref('')
const tempo = ref<TempoFilter>('')
const trackSort = ref<TrackSort>('authored')
const albumSort = ref<AlbumSort>('authored')
const collectionSort = ref<CollectionSort>('authored')
const playlistSort = ref<PlaylistSort>('updated')

const viewLabels: Record<MusicView, string> = {
  tracks: 'Tracks',
  albums: 'Albums',
  collections: 'Collections',
  playlists: 'Playlists',
}

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
      (!instrument.value || track.instruments.includes(instrument.value)) &&
      matchesTempo(track),
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
  if (activeView.value === 'tracks') return filteredTracks.value.length
  if (activeView.value === 'albums') return filteredAlbums.value.length
  if (activeView.value === 'collections') return filteredCollections.value.length
  return sortedPlaylists.value.length
})

const playableTracks = computed(() =>
  filteredTracks.value.flatMap((track) =>
    track.preview
      ? [
          {
            id: track.id,
            slug: track.slug,
            title: track.title,
            artist: artist.identity.name,
            releaseTitle: track.album.title,
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
  instrument.value = ''
  tempo.value = ''
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
      <p class="eyebrow">Catalog</p>
      <h1>Music</h1>
      <p>Browse tracks, albums, collections, and your saved playlists.</p>
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
        <nav class="music-view-navigation" aria-label="Music catalog views">
          <button
            v-for="view in ['tracks', 'albums', 'collections', 'playlists'] as MusicView[]"
            :key="view"
            type="button"
            :aria-pressed="activeView === view"
            @click="activeView = view"
          >
            <span>{{ viewLabels[view] }}</span>
            <span aria-hidden="true">
              {{
                view === 'tracks'
                  ? catalogTracks.length
                  : view === 'albums'
                    ? data.releases.length
                    : view === 'collections'
                      ? data.collections.length
                      : library?.authenticated
                        ? library.playlists.length
                        : '—'
              }}
            </span>
          </button>
        </nav>

        <form class="music-catalog-controls" role="search" @submit.prevent="submitSearch">
          <label class="music-search-field">
            <span>Search {{ viewLabels[activeView].toLowerCase() }}</span>
            <input v-model="query" type="search" autocomplete="off" placeholder="Title or detail" />
          </label>
          <button class="text-action" type="submit">Search</button>

          <fieldset v-if="activeView === 'tracks'" class="music-filter-fields">
            <legend>Filter tracks</legend>
            <label>
              <span>Meter</span>
              <select v-model="meter">
                <option value="">All meters</option>
                <option v-for="value in meters" :key="value" :value="value">{{ value }}</option>
              </select>
            </label>
            <label>
              <span>Tempo</span>
              <select v-model="tempo">
                <option value="">All tempos</option>
                <option value="slow">Under 75 BPM</option>
                <option value="moderate">75–89 BPM</option>
                <option value="fast">90 BPM and above</option>
              </select>
            </label>
            <label>
              <span>Mood</span>
              <select v-model="mood">
                <option value="">All moods</option>
                <option v-for="value in moods" :key="value" :value="value">{{ value }}</option>
              </select>
            </label>
            <label>
              <span>Instrument</span>
              <select v-model="instrument">
                <option value="">All instruments</option>
                <option v-for="value in instruments" :key="value" :value="value">
                  {{ value }}
                </option>
              </select>
            </label>
            <button class="music-clear-filters" type="button" @click="clearTrackFilters">
              Clear filters
            </button>
          </fieldset>
        </form>
      </aside>

      <section class="music-browser__results" :aria-labelledby="`music-${activeView}-heading`">
        <header class="music-results-heading">
          <div>
            <p class="section-number">{{ currentResultCount }} results</p>
            <h2 :id="`music-${activeView}-heading`">{{ viewLabels[activeView] }}</h2>
          </div>
          <label v-if="activeView === 'tracks'">
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

        <template v-if="activeView === 'tracks'">
          <div class="music-track-columns" aria-hidden="true">
            <span>Track</span>
            <span>Tempo</span>
            <span>Meter</span>
            <span>Mood</span>
            <span>Time</span>
          </div>
          <ol v-if="filteredTracks.length" class="music-track-list">
            <li v-for="track in filteredTracks" :key="track.id" class="music-track-row">
              <button
                class="music-track-row__play"
                type="button"
                :disabled="!track.preview"
                :aria-label="
                  track.preview ? `Play ${track.title}` : `Preview unavailable for ${track.title}`
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
              <div class="music-track-row__identity">
                <NuxtLink class="music-track-row__title" :to="`/music/tracks/${track.slug}`">
                  {{ track.title }}
                </NuxtLink>
                <NuxtLink :to="`/music/${track.album.slug}`">{{ track.album.title }}</NuxtLink>
                <span>{{ track.musical_key || 'Key not listed' }}</span>
              </div>
              <span>{{ track.tempo_bpm ? `${track.tempo_bpm} BPM` : '—' }}</span>
              <span>{{ track.meter || '—' }}</span>
              <span>{{ track.mood || '—' }}</span>
              <span>{{ formatDuration(track.duration_ms) }}</span>
            </li>
          </ol>
          <p v-else class="music-empty-result">No tracks match the current search and filters.</p>
        </template>

        <ol v-else-if="activeView === 'albums' && filteredAlbums.length" class="music-album-grid">
          <li v-for="release in filteredAlbums" :key="release.id">
            <NuxtLink class="music-album" :to="`/music/${release.slug}`">
              <span class="music-album__art" aria-hidden="true">
                <span>
                  {{ formatReleaseType(release.release_type) }} ·
                  {{ release.release_date?.slice(0, 4) ?? 'Unscheduled' }}
                </span>
                <strong>{{ release.title }}</strong>
                <span>{{ starterMode ? 'Artist Name' : artist.identity.name }}</span>
              </span>
              <span class="music-album__details">
                <strong>{{ release.title }}</strong>
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
                {{ collection.title }}
              </NuxtLink>
              <p>{{ collection.description }}</p>
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
