<script setup lang="ts">
import type { LibraryPlaylist, LibraryResponse } from '#shared/types/library'
import type { AccountCommerceResponse } from '#shared/types/commerce'
import type { LearningAccountResponse } from '#shared/types/learning'

useSeoMeta({ title: 'Account' })

const { data: session, refresh } = await useFetch('/api/auth/session')
const { data: library, refresh: refreshLibrary } = await useFetch<LibraryResponse>('/api/library')
const { data: commerce, refresh: refreshCommerce } =
  await useFetch<AccountCommerceResponse>('/api/commerce/account')
const { data: learning, refresh: refreshLearning } =
  await useFetch<LearningAccountResponse>('/api/learning/account')
const signingOut = ref(false)
const playlistTitle = ref('')
const message = ref('')

async function signOut() {
  signingOut.value = true
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  await Promise.all([refresh(), refreshLibrary(), refreshCommerce(), refreshLearning()])
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

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100)
}

async function openPortal() {
  const result = await $fetch('/api/commerce/portal', { method: 'POST' })
  window.location.assign(result.url)
}

async function download(mediaId: string) {
  const result = await $fetch(`/api/downloads/${mediaId}`)
  window.location.assign(result.url)
}

async function downloadLicense(licenseId: string) {
  const result = await $fetch(`/api/licenses/${licenseId}/document`)
  window.location.assign(result.url)
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

    <div v-if="commerce?.authenticated" class="commerce-account">
      <section aria-labelledby="orders-heading">
        <div class="library-section-heading">
          <p class="section-number">Purchases</p>
          <h2 id="orders-heading">Orders and protected delivery.</h2>
        </div>
        <div v-if="commerce.orders.length" class="order-history">
          <article v-for="order in commerce.orders" :key="order.id">
            <header>
              <div>
                <h3>{{ order.items[0]?.name ?? 'Artist offering' }}</h3>
                <p>{{ formatListeningDate(order.createdAt) }}</p>
              </div>
              <p>{{ formatMoney(order.totalMinor, order.currency) }} · {{ order.status }}</p>
            </header>
            <p v-if="order.refundedMinor">
              Refunded: {{ formatMoney(order.refundedMinor, order.currency) }}
            </p>
            <button
              v-for="item in order.items.filter(({ downloadMediaId }) => downloadMediaId)"
              :key="item.resourceId"
              class="text-action"
              type="button"
              @click="download(item.downloadMediaId!)"
            >
              Request protected download
            </button>
          </article>
        </div>
        <p v-else>
          Completed purchases will appear here after a verified event.
          <NuxtLink to="/support">View artist offerings.</NuxtLink>
        </p>
      </section>

      <section aria-labelledby="membership-heading">
        <div class="library-section-heading">
          <p class="section-number">Membership</p>
          <h2 id="membership-heading">Time-bound access with a visible state.</h2>
        </div>
        <dl v-if="commerce.subscriptions.length" class="membership-history">
          <div v-for="subscription in commerce.subscriptions" :key="subscription.id">
            <dt>{{ subscription.productName }}</dt>
            <dd>
              {{ subscription.status }} · through
              {{ formatListeningDate(subscription.currentPeriodEnd) }}
              <span v-if="subscription.cancelAtPeriodEnd"> · ends at period close</span>
            </dd>
          </div>
        </dl>
        <p v-else>No membership is attached to this account.</p>
        <button
          v-if="commerce.portalAvailable"
          class="text-action"
          type="button"
          @click="openPortal"
        >
          Manage billing in Stripe
        </button>
      </section>

      <section aria-labelledby="licenses-heading">
        <div class="library-section-heading">
          <p class="section-number">Licenses</p>
          <h2 id="licenses-heading">The exact terms issued for your project.</h2>
        </div>
        <div v-if="commerce.licenses.length" class="license-history">
          <article v-for="license in commerce.licenses" :key="license.id">
            <div>
              <h3>{{ license.trackTitle }} · {{ license.optionLabel }}</h3>
              <p>{{ license.licenseeName }} · {{ license.projectTitle }}</p>
              <p>
                {{ formatMoney(license.amountMinor, license.currency) }} · {{ license.status }} ·
                document {{ license.documentStatus }}
              </p>
            </div>
            <button
              v-if="license.documentStatus === 'ready' && license.status === 'active'"
              class="text-action"
              type="button"
              @click="downloadLicense(license.id)"
            >
              Download protected license
            </button>
          </article>
        </div>
        <p v-else>
          Issued music licenses will appear here.
          <NuxtLink to="/licensing">View supported uses.</NuxtLink>
        </p>
      </section>

      <section aria-labelledby="access-heading">
        <div class="library-section-heading">
          <p class="section-number">Access ledger</p>
          <h2 id="access-heading">Why this account can enter.</h2>
        </div>
        <ol v-if="commerce.entitlements.length" class="entitlement-history">
          <li v-for="entry in commerce.entitlements" :key="entry.id">
            <span>{{ entry.resourceType.replaceAll('_', ' ') }}</span>
            <span>{{ entry.sourceType }} · {{ entry.status }}</span>
            <time v-if="entry.expiresAt" :datetime="entry.expiresAt">
              through {{ formatListeningDate(entry.expiresAt) }}
            </time>
            <span v-else>Permanent</span>
          </li>
        </ol>
        <p v-else>No purchase or membership access has been granted yet.</p>
      </section>
    </div>

    <section
      v-if="learning?.authenticated"
      class="account-learning"
      aria-labelledby="account-learning-heading"
    >
      <div class="library-section-heading">
        <p class="section-number">Learning</p>
        <h2 id="account-learning-heading">Resume the next meaningful lesson.</h2>
      </div>
      <ol v-if="learning.paths?.length" class="learning-account-list">
        <li v-for="path in learning.paths" :key="path.id">
          <div>
            <h3>{{ path.title }}</h3>
            <p>{{ path.completedLessons }} of {{ path.totalLessons }} lessons completed</p>
          </div>
          <NuxtLink
            v-if="path.nextLesson"
            class="text-action"
            :to="`/learn/${path.slug}/${path.nextLesson.slug}`"
          >
            {{ path.nextLesson.accessible ? 'Continue' : 'Review access for' }}
            {{ path.nextLesson.title }}
          </NuxtLink>
          <span v-else>Path complete</span>
        </li>
      </ol>
      <p v-else>Published learning paths will appear here.</p>
    </section>

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
