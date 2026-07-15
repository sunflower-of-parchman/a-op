<script setup lang="ts">
import type { CollectionDraftInput } from '#shared/schemas/catalog'

useSeoMeta({ title: 'Collection administration' })

type TrackOption = { id: string; slug: string; title: string; state: string }
type CollectionDraft = {
  id?: string
  slug: string
  title: string
  description: string
  tracks: Array<{ trackId: string; position: number; note: string }>
  state: string
  publishedAt: string | null
  hasDraft: boolean
  draftUpdatedAt: string | null
}
type CollectionAdminResponse = { collections: CollectionDraft[]; tracks: TrackOption[] }

const { data, error, refresh } = await useFetch<CollectionAdminResponse>('/api/admin/collections')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/collections')

const draft = ref<CollectionDraft | null>(null)
const savedSnapshot = ref('')
const message = ref('')
const saving = ref(false)
const trackById = computed(
  () => new Map((data.value?.tracks ?? []).map((track) => [track.id, track])),
)

function serialize(value: unknown) {
  return JSON.stringify(value)
}

const dirty = computed(() => Boolean(draft.value) && serialize(draft.value) !== savedSnapshot.value)

function selectCollection(collection: CollectionDraft) {
  draft.value = structuredClone(collection)
  savedSnapshot.value = serialize(collection)
  message.value = ''
}

function newCollection() {
  const collection: CollectionDraft = {
    slug: 'new-collection',
    title: 'New collection',
    description: '',
    tracks: [],
    state: 'draft',
    publishedAt: null,
    hasDraft: false,
    draftUpdatedAt: null,
  }
  selectCollection(collection)
  savedSnapshot.value = ''
}

function addTrack(track: TrackOption) {
  if (!draft.value || track.state !== 'published') return
  if (draft.value.tracks.some(({ trackId }) => trackId === track.id)) {
    message.value = 'That track is already in this collection.'
    return
  }
  draft.value.tracks.push({ trackId: track.id, position: draft.value.tracks.length + 1, note: '' })
}

function removeTrack(index: number) {
  if (!draft.value) return
  draft.value.tracks.splice(index, 1)
  normalizePositions()
}

function moveTrack(index: number, direction: -1 | 1) {
  if (!draft.value) return
  const destination = index + direction
  if (destination < 0 || destination >= draft.value.tracks.length) return
  const [track] = draft.value.tracks.splice(index, 1)
  draft.value.tracks.splice(destination, 0, track!)
  normalizePositions()
}

function normalizePositions() {
  draft.value?.tracks.forEach((track, index) => (track.position = index + 1))
}

async function saveDraft() {
  if (!draft.value) return null
  if (!draft.value.tracks.length) {
    message.value = 'Add at least one published track before saving the collection.'
    return null
  }
  saving.value = true
  message.value = ''
  try {
    const response = draft.value.id
      ? await $fetch(`/api/admin/collections/${draft.value.id}`, {
          method: 'PUT',
          body: draft.value as CollectionDraftInput,
        })
      : await $fetch('/api/admin/collections', {
          method: 'POST',
          body: draft.value as CollectionDraftInput,
        })
    const id = response.collection.id
    await refresh()
    const updated = data.value?.collections.find((collection) => collection.id === id)
    if (updated) selectCollection(updated)
    message.value = 'Collection draft saved privately.'
    return id
  } catch (caught) {
    message.value =
      caught instanceof Error ? caught.message : 'Collection draft could not be saved.'
    return null
  } finally {
    saving.value = false
  }
}

async function publishCollection() {
  const id = await saveDraft()
  if (!id) return
  if (!window.confirm('Publish this collection and its current track order?')) return
  try {
    await $fetch(`/api/admin/collections/${id}/publish`, { method: 'POST' })
    await refresh()
    const updated = data.value?.collections.find((collection) => collection.id === id)
    if (updated) selectCollection(updated)
    message.value = 'Collection published from the approved draft.'
  } catch (caught) {
    message.value = caught instanceof Error ? caught.message : 'Collection could not be published.'
  }
}

if (data.value?.collections[0]) selectCollection(data.value.collections[0])

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(
  () => !dirty.value || window.confirm('Leave without saving this collection draft?'),
)
</script>

<template>
  <div class="page-frame admin-editor catalog-admin">
    <header class="page-heading">
      <p class="eyebrow">Collection administration</p>
      <h1>Make another authored way through the music.</h1>
      <p>
        Collections arrange already-published tracks without changing their albums. Notes and order
        stay private until the collection is approved.
      </p>
      <NuxtLink class="text-action" to="/admin/music">Return to releases</NuxtLink>
    </header>

    <div v-if="data" class="catalog-workspace">
      <aside class="catalog-release-index">
        <div class="section-editor-controls">
          <p class="section-number">Collections</p>
          <button class="quiet-action" type="button" @click="newCollection">New collection</button>
        </div>
        <button
          v-for="collection in data.collections"
          :key="collection.id"
          type="button"
          :aria-current="draft?.id === collection.id ? 'true' : undefined"
          @click="selectCollection(collection)"
        >
          <span>{{ collection.title }}</span>
          <small>{{ collection.state }}{{ collection.hasDraft ? ' · private changes' : '' }}</small>
        </button>
      </aside>

      <form v-if="draft" class="admin-edit-form catalog-edit-form" @submit.prevent="saveDraft">
        <section>
          <div class="admin-section-heading">
            <p class="section-number">01 / Collection</p>
            <h2>Name the path</h2>
          </div>
          <div class="admin-fields">
            <label><span>Title</span><input v-model="draft.title" required /></label>
            <label
              ><span>Slug</span
              ><input v-model="draft.slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            /></label>
            <label><span>Description</span><textarea v-model="draft.description" rows="5" /></label>
          </div>
        </section>

        <section>
          <div class="admin-section-heading">
            <p class="section-number">02 / Order</p>
            <h2>Choose and arrange published tracks</h2>
          </div>
          <div class="collection-composer">
            <ol class="catalog-track-editor collection-order">
              <li v-for="(entry, index) in draft.tracks" :key="entry.trackId">
                <div class="track-editor-heading">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <h3>{{ trackById.get(entry.trackId)?.title ?? 'Unavailable track' }}</h3>
                  <div>
                    <button
                      class="quiet-action"
                      type="button"
                      :disabled="index === 0"
                      @click="moveTrack(index, -1)"
                    >
                      Up
                    </button>
                    <button
                      class="quiet-action"
                      type="button"
                      :disabled="index === draft.tracks.length - 1"
                      @click="moveTrack(index, 1)"
                    >
                      Down
                    </button>
                    <button class="quiet-action" type="button" @click="removeTrack(index)">
                      Remove
                    </button>
                  </div>
                </div>
                <label>
                  <span>Optional collection note</span>
                  <input v-model="entry.note" />
                </label>
              </li>
            </ol>

            <div class="collection-track-pool">
              <p class="section-number">Available tracks</p>
              <ul>
                <li v-for="track in data.tracks" :key="track.id">
                  <div>
                    <strong>{{ track.title }}</strong>
                    <small>{{ track.state }}</small>
                  </div>
                  <button
                    class="quiet-action"
                    type="button"
                    :disabled="
                      track.state !== 'published' ||
                      draft.tracks.some(({ trackId }) => trackId === track.id)
                    "
                    @click="addTrack(track)"
                  >
                    Add
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <div class="admin-publish-bar">
          <p>
            {{
              dirty
                ? 'Unsaved private changes.'
                : draft.hasDraft
                  ? 'Private collection draft saved.'
                  : 'Published collection loaded.'
            }}
          </p>
          <div>
            <button class="text-action" type="submit" :disabled="saving">Save draft</button>
            <button
              class="text-action text-action--primary"
              type="button"
              :disabled="saving"
              @click="publishCollection"
            >
              Publish collection
            </button>
          </div>
        </div>
      </form>
    </div>

    <p v-if="message" class="form-message catalog-message" role="status">{{ message }}</p>
    <p v-else-if="error" class="form-message" role="alert">
      The collection workspace could not be loaded.
    </p>
  </div>
</template>
