<script setup lang="ts">
import type { LibraryPlaylist, LibraryResponse } from '#shared/types/library'

useSeoMeta({ title: 'Account' })

const { data: session, refresh } = await useFetch('/api/auth/session')
const { data: library, refresh: refreshLibrary } = await useFetch<LibraryResponse>('/api/library')
const signingOut = ref(false)
const playlistTitle = ref('')
const message = ref('')

async function signOut() {
  signingOut.value = true
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  await refresh()
  signingOut.value = false
}

async function createPlaylist() {
  if (!playlistTitle.value.trim()) return
  await $fetch('/api/library/playlists', {
    method: 'POST',
    body: { title: playlistTitle.value, description: '' },
  })
  playlistTitle.value = ''
  await refreshLibrary()
  message.value = 'Playlist created.'
}

async function savePlaylist(playlist: LibraryPlaylist, trackIds: string[]) {
  await $fetch(`/api/library/playlists/${playlist.id}`, {
    method: 'PUT',
    body: { title: playlist.title, description: playlist.description, trackIds },
  })
  await refreshLibrary()
  message.value = 'Playlist order updated.'
}

async function movePlaylistTrack(playlist: LibraryPlaylist, index: number, direction: -1 | 1) {
  const trackIds = playlist.tracks.map(({ id }) => id)
  const destination = index + direction
  if (destination < 0 || destination >= trackIds.length) return
  const [trackId] = trackIds.splice(index, 1)
  trackIds.splice(destination, 0, trackId!)
  await savePlaylist(playlist, trackIds)
}

async function removePlaylistTrack(playlist: LibraryPlaylist, trackId: string) {
  await savePlaylist(
    playlist,
    playlist.tracks.filter(({ id }) => id !== trackId).map(({ id }) => id),
  )
}

async function deletePlaylist(playlist: LibraryPlaylist) {
  if (!window.confirm(`Delete the private playlist “${playlist.title}”?`)) return
  await $fetch(`/api/library/playlists/${playlist.id}`, { method: 'DELETE' })
  await refreshLibrary()
  message.value = 'Playlist deleted.'
}

function formatListeningDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}
</script>

<template>
  <div class="page-frame account-frame">
    <header class="page-heading">
      <p class="eyebrow">Account</p>
      <h1 v-if="session?.authenticated">Your relationship with the artist.</h1>
      <h1 v-else>Keep what belongs to you.</h1>
      <p v-if="session?.authenticated">
        Signed in as {{ session.user.email }}. Your saved music and listening paths stay attached to
        this account.
      </p>
      <p v-else>
        Sign in to reach protected downloads and the customer history attached to your account.
      </p>
    </header>

    <div v-if="session?.authenticated" class="account-actions">
      <NuxtLink
        v-if="session.roles.includes('owner') || session.roles.includes('editor')"
        class="text-action"
        to="/admin"
      >
        Open artist administration
      </NuxtLink>
      <button class="text-action" type="button" :disabled="signingOut" @click="signOut">
        {{ signingOut ? 'Signing out…' : 'Sign out' }}
      </button>
    </div>
    <div v-else class="account-actions">
      <NuxtLink class="text-action text-action--primary" to="/sign-in">Sign in</NuxtLink>
      <NuxtLink class="text-action" to="/sign-up">Create an account</NuxtLink>
    </div>

    <div v-if="library?.authenticated" class="customer-library">
      <section aria-labelledby="favorites-heading">
        <div class="library-section-heading">
          <p class="section-number">Favorites</p>
          <h2 id="favorites-heading">Music you chose to keep close.</h2>
        </div>
        <ul v-if="library.favorites.length" class="library-link-list">
          <li v-for="track in library.favorites" :key="track.id">
            <NuxtLink :to="`/music/tracks/${track.slug}`">{{ track.title }}</NuxtLink>
          </li>
        </ul>
        <p v-else>Tracks saved from their catalog pages will gather here.</p>
      </section>

      <section aria-labelledby="playlists-heading">
        <div class="library-section-heading">
          <p class="section-number">Playlists</p>
          <h2 id="playlists-heading">Your own authored order.</h2>
        </div>
        <form class="playlist-create" @submit.prevent="createPlaylist">
          <label><span>New playlist title</span><input v-model="playlistTitle" required /></label>
          <button class="text-action" type="submit" :disabled="!playlistTitle.trim()">
            Create playlist
          </button>
        </form>
        <div v-if="library.playlists.length" class="playlist-library">
          <article v-for="playlist in library.playlists" :key="playlist.id">
            <header>
              <h3>{{ playlist.title }}</h3>
              <button class="quiet-action" type="button" @click="deletePlaylist(playlist)">
                Delete
              </button>
            </header>
            <ol v-if="playlist.tracks.length">
              <li v-for="(track, index) in playlist.tracks" :key="track.id">
                <span>{{ String(index + 1).padStart(2, '0') }}</span>
                <NuxtLink :to="`/music/tracks/${track.slug}`">{{ track.title }}</NuxtLink>
                <div>
                  <button
                    class="quiet-action"
                    type="button"
                    :disabled="index === 0"
                    @click="movePlaylistTrack(playlist, index, -1)"
                  >
                    Up
                  </button>
                  <button
                    class="quiet-action"
                    type="button"
                    :disabled="index === playlist.tracks.length - 1"
                    @click="movePlaylistTrack(playlist, index, 1)"
                  >
                    Down
                  </button>
                  <button
                    class="quiet-action"
                    type="button"
                    @click="removePlaylistTrack(playlist, track.id)"
                  >
                    Remove
                  </button>
                </div>
              </li>
            </ol>
            <p v-else>Add tracks from any public track page.</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="history-heading">
        <div class="library-section-heading">
          <p class="section-number">Listening history</p>
          <h2 id="history-heading">Recent points of return.</h2>
        </div>
        <ol v-if="library.history.length" class="listening-history">
          <li v-for="entry in library.history" :key="entry.id">
            <NuxtLink :to="`/music/tracks/${entry.track.slug}`">{{ entry.track.title }}</NuxtLink>
            <span>{{
              entry.completed ? 'Completed' : `${Math.round(entry.progress_ms / 1000)}s`
            }}</span>
            <time :datetime="entry.listened_at">{{ formatListeningDate(entry.listened_at) }}</time>
          </li>
        </ol>
        <p v-else>Signed-in preview listening will appear here after a pause or completion.</p>
      </section>
    </div>
    <p v-if="message" class="form-message account-message" role="status">{{ message }}</p>
  </div>
</template>
