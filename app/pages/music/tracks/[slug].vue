<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { LibraryResponse } from '#shared/types/library'

const route = useRoute()
const artist = useArtistConfig()
const starterMode = useStarterMode()
const { data, error } = await useFetch(() => `/api/tracks/${String(route.params.slug)}`)
const { data: library, refresh: refreshLibrary } = await useFetch<LibraryResponse>('/api/library')
const audioPlayer = useAudioPlayer()
const libraryMessage = ref('')
const selectedPlaylistId = ref('')
const libraryReady = ref(false)
onMounted(() => (libraryReady.value = true))

const playerTrack = computed(() => {
  if (!data.value?.preview) return null
  return {
    id: data.value.track.id,
    slug: data.value.track.slug,
    title: starterMode ? starterLayoutContent.trackDetail.title : data.value.track.title,
    artist: starterMode ? starterLayoutContent.featuredRelease.artist : artist.identity.name,
    releaseTitle: starterMode
      ? starterLayoutContent.featuredRelease.title
      : data.value.release?.title,
    href: `/music/tracks/${data.value.track.slug}`,
    src: data.value.preview.url,
  }
})

const isFavorite = computed(
  () =>
    Boolean(data.value?.track.id) &&
    library.value?.authenticated === true &&
    library.value.favoriteTrackIds.includes(data.value!.track.id),
)

async function toggleFavorite() {
  if (!data.value || library.value?.authenticated !== true) return
  await $fetch('/api/library/favorites', {
    method: 'POST',
    body: { trackId: data.value.track.id, favorite: !isFavorite.value },
  })
  await refreshLibrary()
  libraryMessage.value = isFavorite.value
    ? 'Track saved to favorites.'
    : 'Track removed from favorites.'
}

async function addToPlaylist() {
  if (!data.value || library.value?.authenticated !== true || !selectedPlaylistId.value) return
  const playlist = library.value.playlists.find(({ id }) => id === selectedPlaylistId.value)
  if (!playlist) return
  if (playlist.tracks.some(({ id }) => id === data.value!.track.id)) {
    libraryMessage.value = 'That track is already in this playlist.'
    return
  }
  await $fetch(`/api/library/playlists/${playlist.id}`, {
    method: 'PUT',
    body: {
      title: playlist.title,
      description: playlist.description,
      trackIds: [...playlist.tracks.map(({ id }) => id), data.value.track.id],
    },
  })
  await refreshLibrary()
  libraryMessage.value = `Track added to ${playlist.title}.`
}

useSeoMeta({
  title: () =>
    starterMode ? starterLayoutContent.trackDetail.title : (data.value?.track.title ?? 'Track'),
  description: () =>
    starterMode ? starterLayoutContent.trackDetail.description : data.value?.track.description,
})
</script>

<template>
  <article v-if="data" class="page-frame release-page track-page">
    <header class="release-page__heading">
      <h1>
        {{ starterMode ? starterLayoutContent.trackDetail.title : data.track.title }}
      </h1>
      <p>
        {{ starterMode ? starterLayoutContent.trackDetail.description : data.track.description }}
      </p>
    </header>
    <section class="track-details" aria-labelledby="details-heading">
      <div>
        <p class="section-number">
          {{ starterMode ? starterLayoutContent.trackDetail.detailsLabel : 'Listening details' }}
        </p>
        <h2 id="details-heading">
          {{ starterMode ? starterLayoutContent.trackDetail.detailsHeading : 'Track information' }}
        </h2>
      </div>
      <dl>
        <div v-if="data.track.tempo_bpm">
          <dt>Tempo</dt>
          <dd>{{ data.track.tempo_bpm }} BPM</dd>
        </div>
        <div v-if="data.track.meter">
          <dt>Meter</dt>
          <dd>{{ data.track.meter }}</dd>
        </div>
        <div v-if="data.track.musical_key">
          <dt>Key</dt>
          <dd>{{ data.track.musical_key }}</dd>
        </div>
        <div v-if="data.track.mood">
          <dt>Mood</dt>
          <dd>{{ data.track.mood }}</dd>
        </div>
      </dl>
    </section>
    <div class="action-row">
      <button
        v-if="playerTrack"
        class="text-action text-action--primary"
        type="button"
        @click="audioPlayer.playTrack(playerTrack)"
      >
        Play public preview
      </button>
      <NuxtLink v-if="data.release" class="text-action" :to="`/music/${data.release.slug}`">
        {{
          starterMode
            ? starterLayoutContent.trackDetail.returnAction
            : `Return to ${data.release.title}`
        }}
      </NuxtLink>
      <NuxtLink class="text-action" :to="`/licensing?track=${data.track.slug}`">
        License this track
      </NuxtLink>
    </div>
    <section class="track-library-actions" aria-labelledby="track-library-heading">
      <div>
        <p class="section-number">
          {{ starterMode ? starterLayoutContent.trackDetail.libraryLabel : 'Your library' }}
        </p>
        <h2 id="track-library-heading">
          {{
            starterMode
              ? starterLayoutContent.trackDetail.libraryHeading
              : 'Favorites and playlists'
          }}
        </h2>
      </div>
      <div v-if="library?.authenticated" class="library-track-controls">
        <button class="text-action" type="button" @click="toggleFavorite">
          {{ isFavorite ? 'Remove from favorites' : 'Save to favorites' }}
        </button>
        <div v-if="library.playlists.length" class="playlist-add-control">
          <label>
            <span>Playlist</span>
            <select v-model="selectedPlaylistId" :disabled="!libraryReady">
              <option value="">Choose a playlist</option>
              <option v-for="playlist in library.playlists" :key="playlist.id" :value="playlist.id">
                {{ playlist.title }}
              </option>
            </select>
          </label>
          <button
            class="text-action"
            type="button"
            :disabled="!libraryReady || !selectedPlaylistId"
            @click="addToPlaylist"
          >
            Add to playlist
          </button>
        </div>
        <NuxtLink v-else class="text-action" to="/account">Create a playlist</NuxtLink>
      </div>
      <NuxtLink v-else class="text-action" :to="`/sign-in?redirect=${route.fullPath}`">
        Sign in to save this track
      </NuxtLink>
      <p v-if="libraryMessage" class="form-message" role="status">{{ libraryMessage }}</p>
    </section>
  </article>
  <div v-else class="page-frame interior-page">
    <h1>{{ error ? 'Track not found.' : 'Loading track…' }}</h1>
  </div>
</template>
