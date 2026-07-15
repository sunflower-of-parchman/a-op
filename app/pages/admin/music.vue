<script setup lang="ts">
import type { ReleaseDraftInput } from '#shared/schemas/catalog'
import { uploadWithTus, type TusUploadTarget } from '~/utils/tusUpload'

useSeoMeta({ title: 'Music administration' })

type CatalogTrack = {
  id?: string
  slug: string
  title: string
  description: string
  durationMs: number | null
  musicalKey: string
  meter: string
  tempoBpm: number | null
  mood: string
  instruments: string[]
  explicit: boolean
  discNumber: number
  position: number
  media: {
    source: null | {
      id: string
      status: string
      job: null | { status: string; error_category: string | null }
    }
    preview: null | { id: string; url: string; metadata: unknown }
  }
}

type CatalogRelease = {
  id?: string
  slug: string
  title: string
  subtitle: string
  description: string
  releaseType: 'album' | 'ep' | 'single' | 'collection'
  releaseDate: string | null
  label: string
  catalogNumber: string
  genre: string
  mood: string
  artworkMediaId: string | null
  tracks: CatalogTrack[]
  credits: Array<{ role: string; name: string; position: number }>
  state: string
  publishedAt: string | null
  hasDraft: boolean
  draftUpdatedAt: string | null
}

type MusicAdminResponse = {
  releases: CatalogRelease[]
  collections: Array<{
    id: string
    slug: string
    title: string
    description: string
    state: string
    sort_order: number
  }>
}

const { data, error, refresh } = await useFetch<MusicAdminResponse>('/api/admin/music')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/music')

const draft = ref<CatalogRelease | null>(null)
const savedSnapshot = ref('')
const message = ref('')
const bulkTracks = ref('')
const saving = ref(false)
const progress = reactive<Record<string, number>>({})

type UploadTargetResponse =
  { reused: true; mediaId: string; status: string } | ({ reused: false } & TusUploadTarget)

type SourceMediaType = 'audio/wav' | 'audio/aiff' | 'audio/x-aiff' | 'audio/flac'

function serialize(value: unknown) {
  return JSON.stringify(value)
}

const dirty = computed(() => Boolean(draft.value) && serialize(draft.value) !== savedSnapshot.value)

function selectRelease(release: CatalogRelease) {
  draft.value = structuredClone(release)
  savedSnapshot.value = serialize(release)
  bulkTracks.value = release.tracks.map(({ title, slug }) => `${title} | ${slug}`).join('\n')
  message.value = ''
}

function newRelease() {
  const release: CatalogRelease = {
    slug: 'new-release',
    title: 'New release',
    subtitle: '',
    description: '',
    releaseType: 'album',
    releaseDate: new Date().toISOString().slice(0, 10),
    label: '',
    catalogNumber: '',
    genre: '',
    mood: '',
    artworkMediaId: null,
    credits: [],
    tracks: [
      {
        slug: 'first-track',
        title: 'First track',
        description: '',
        durationMs: null,
        musicalKey: '',
        meter: '',
        tempoBpm: null,
        mood: '',
        instruments: [],
        explicit: false,
        discNumber: 1,
        position: 1,
        media: { source: null, preview: null },
      },
    ],
    state: 'draft',
    publishedAt: null,
    hasDraft: false,
    draftUpdatedAt: null,
  }
  selectRelease(release)
  savedSnapshot.value = ''
}

function addTrack() {
  if (!draft.value) return
  const position = draft.value.tracks.length + 1
  draft.value.tracks.push({
    slug: `track-${position}`,
    title: `Track ${position}`,
    description: '',
    durationMs: null,
    musicalKey: '',
    meter: '',
    tempoBpm: null,
    mood: '',
    instruments: [],
    explicit: false,
    discNumber: 1,
    position,
    media: { source: null, preview: null },
  })
}

function removeTrack(index: number) {
  if (!draft.value || draft.value.tracks.length <= 1) return
  draft.value.tracks.splice(index, 1)
  draft.value.tracks.forEach((track, position) => (track.position = position + 1))
}

function moveTrack(index: number, direction: -1 | 1) {
  if (!draft.value) return
  const destination = index + direction
  if (destination < 0 || destination >= draft.value.tracks.length) return
  const [track] = draft.value.tracks.splice(index, 1)
  draft.value.tracks.splice(destination, 0, track!)
  draft.value.tracks.forEach((item, position) => (item.position = position + 1))
}

function applyBulkTracks() {
  if (!draft.value) return
  const lines = bulkTracks.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) {
    message.value = 'Enter at least one line as Title | slug.'
    return
  }
  const existing = new Map(draft.value.tracks.map((track) => [track.slug, track]))
  const tracks: CatalogTrack[] = []
  for (const [index, line] of lines.entries()) {
    const [title, slug] = line.split('|').map((value) => value?.trim())
    if (!title || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      message.value = `Line ${index + 1} needs a title and a lowercase hyphenated slug.`
      return
    }
    tracks.push({
      ...(existing.get(slug) ?? {
        description: '',
        durationMs: null,
        musicalKey: '',
        meter: '',
        tempoBpm: null,
        mood: '',
        instruments: [],
        explicit: false,
        discNumber: 1,
        media: { source: null, preview: null },
      }),
      title,
      slug,
      position: index + 1,
    })
  }
  draft.value.tracks = tracks
  message.value = `${tracks.length} proposed tracks applied to the draft.`
}

async function saveDraft() {
  if (!draft.value) return null
  saving.value = true
  message.value = ''
  try {
    const response = draft.value.id
      ? await $fetch(`/api/admin/music/releases/${draft.value.id}`, {
          method: 'PUT',
          body: draft.value as ReleaseDraftInput,
        })
      : await $fetch('/api/admin/music/releases', {
          method: 'POST',
          body: draft.value as ReleaseDraftInput,
        })
    const id = response.release.id
    await refresh()
    const updated = data.value?.releases.find((release) => release.id === id)
    if (updated) selectRelease(updated)
    message.value = 'Release draft saved privately.'
    return id
  } catch (caught) {
    message.value = caught instanceof Error ? caught.message : 'Release draft could not be saved.'
    return null
  } finally {
    saving.value = false
  }
}

async function publishRelease() {
  const id = await saveDraft()
  if (!id) return
  if (!window.confirm('Publish this release, its current order, tracks, and credits?')) return
  try {
    await $fetch(`/api/admin/music/releases/${id}/publish`, { method: 'POST' })
    await refresh()
    const updated = data.value?.releases.find((release) => release.id === id)
    if (updated) selectRelease(updated)
    message.value = 'Release published from the approved draft.'
  } catch (caught) {
    message.value = caught instanceof Error ? caught.message : 'Release could not be published.'
  }
}

async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function uploadSource(track: CatalogTrack, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !track.id) {
    message.value = 'Save the release draft before uploading source audio.'
    return
  }
  const mediaType = sourceMediaType(file)
  if (!mediaType) {
    message.value = 'Source audio must be WAV, AIFF, or FLAC.'
    return
  }
  try {
    progress[track.id] = 0
    const target = await $fetch<UploadTargetResponse>('/api/admin/media/upload-target', {
      method: 'POST',
      body: {
        kind: 'source_audio',
        trackId: track.id,
        filename: file.name,
        mediaType,
        byteSize: file.size,
        sha256: await hashBlob(file),
      },
    })
    if (!target.reused) {
      await uploadWithTus(file, target, (fraction) => (progress[track.id!] = fraction))
      await $fetch('/api/admin/media/upload-complete', {
        method: 'POST',
        body: { intentId: target.intentId },
      })
    }
    await refresh()
    const updated = data.value?.releases.find((release) => release.id === draft.value?.id)
    if (updated) selectRelease(updated)
    message.value = target.reused
      ? 'The existing immutable source is already attached.'
      : 'Source uploaded directly and queued for processing.'
  } catch (caught) {
    message.value = caught instanceof Error ? caught.message : 'Source upload failed.'
  } finally {
    Reflect.deleteProperty(progress, track.id)
    input.value = ''
  }
}

async function optimizeArtwork(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 50 * 1024 * 1024
  ) {
    throw new Error('Artwork must be JPEG, PNG, or WebP under 50 MiB.')
  }
  const image = await createImageBitmap(file)
  if (Math.min(image.width, image.height) < 600) {
    image.close()
    throw new Error('Artwork must be at least 600 pixels on its shortest side.')
  }
  const scale = Math.min(1, 2400 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  image.close()
  const blob = await new Promise<Blob>((resolveBlob, reject) =>
    canvas.toBlob(
      (value) => (value ? resolveBlob(value) : reject(new Error('Artwork optimization failed.'))),
      'image/webp',
      0.9,
    ),
  )
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' })
}

async function uploadArtwork(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0]
  if (!selected || !draft.value?.id) {
    message.value = 'Save the release draft before uploading artwork.'
    return
  }
  try {
    const file = await optimizeArtwork(selected)
    const target = await $fetch<UploadTargetResponse>('/api/admin/media/upload-target', {
      method: 'POST',
      body: {
        kind: 'artwork',
        releaseId: draft.value.id,
        filename: file.name,
        mediaType: 'image/webp',
        byteSize: file.size,
        sha256: await hashBlob(file),
      },
    })
    if (!target.reused) {
      progress.artwork = 0
      await uploadWithTus(file, target, (fraction) => (progress.artwork = fraction))
      const completed = await $fetch('/api/admin/media/upload-complete', {
        method: 'POST',
        body: { intentId: target.intentId },
      })
      draft.value.artworkMediaId = completed.mediaId
    } else {
      draft.value.artworkMediaId = target.mediaId
    }
    await saveDraft()
    message.value = 'Artwork validated, optimized to WebP, and attached to the private draft.'
  } catch (caught) {
    message.value = caught instanceof Error ? caught.message : 'Artwork upload failed.'
  } finally {
    delete progress.artwork
    input.value = ''
  }
}

function sourceMediaType(file: File): SourceMediaType | null {
  const supported = ['audio/wav', 'audio/aiff', 'audio/x-aiff', 'audio/flac'] as const
  if (supported.includes(file.type as SourceMediaType)) return file.type as SourceMediaType
  const extension = file.name.split('.').pop()?.toLowerCase()
  return (
    (
      {
        wav: 'audio/wav',
        wave: 'audio/wav',
        aif: 'audio/aiff',
        aiff: 'audio/aiff',
        flac: 'audio/flac',
      } as const
    )[extension ?? ''] ?? null
  )
}

async function retrySource(mediaId: string) {
  await $fetch(`/api/admin/media/${mediaId}/retry`, { method: 'POST' })
  await refresh()
  const updated = data.value?.releases.find((release) => release.id === draft.value?.id)
  if (updated) selectRelease(updated)
  message.value = 'The failed source is queued for another worker attempt.'
}

function addCredit() {
  if (!draft.value) return
  draft.value.credits.push({ role: 'Music', name: '', position: draft.value.credits.length + 1 })
}

if (data.value?.releases[0]) selectRelease(data.value.releases[0])

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(() => !dirty.value || window.confirm('Leave without saving this release draft?'))
</script>

<template>
  <div class="page-frame admin-editor catalog-admin">
    <header class="page-heading">
      <p class="eyebrow">Music administration</p>
      <h1>Shape the catalog, then publish it.</h1>
      <p>
        Metadata, source audio, artwork, credits, order, and processing state remain together. A
        draft does not replace the published release until approval.
      </p>
      <NuxtLink class="text-action" to="/admin/collections">Organize collections</NuxtLink>
    </header>

    <div v-if="data" class="catalog-workspace">
      <aside class="catalog-release-index">
        <div class="section-editor-controls">
          <p class="section-number">Releases</p>
          <button class="quiet-action" type="button" @click="newRelease">New release</button>
        </div>
        <button
          v-for="release in data.releases"
          :key="release.id"
          type="button"
          :aria-current="draft?.id === release.id ? 'true' : undefined"
          @click="selectRelease(release)"
        >
          <span>{{ release.title }}</span>
          <small>{{ release.state }}{{ release.hasDraft ? ' · private changes' : '' }}</small>
        </button>
      </aside>

      <form v-if="draft" class="admin-edit-form catalog-edit-form" @submit.prevent="saveDraft">
        <section>
          <div class="admin-section-heading">
            <p class="section-number">01 / Release</p>
            <h2>Identity and publication metadata</h2>
          </div>
          <div class="admin-fields">
            <label><span>Title</span><input v-model="draft.title" required /></label>
            <label
              ><span>Slug</span
              ><input v-model="draft.slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            /></label>
            <label><span>Subtitle</span><input v-model="draft.subtitle" /></label>
            <label><span>Description</span><textarea v-model="draft.description" rows="5" /></label>
            <div class="nested-row">
              <label>
                <span>Release type</span>
                <select v-model="draft.releaseType">
                  <option value="album">Album</option>
                  <option value="ep">EP</option>
                  <option value="single">Single</option>
                  <option value="collection">Collection</option>
                </select>
              </label>
              <label
                ><span>Release date</span><input v-model="draft.releaseDate" type="date"
              /></label>
            </div>
            <div class="nested-row">
              <label><span>Label</span><input v-model="draft.label" /></label>
              <label><span>Catalog number</span><input v-model="draft.catalogNumber" /></label>
            </div>
            <div class="nested-row">
              <label><span>Genre</span><input v-model="draft.genre" /></label>
              <label><span>Mood</span><input v-model="draft.mood" /></label>
            </div>
          </div>
        </section>

        <section>
          <div class="admin-section-heading">
            <p class="section-number">02 / Artwork</p>
            <h2>One durable visual source</h2>
          </div>
          <div class="admin-fields">
            <p>
              JPEG, PNG, or WebP is validated in the browser, resized to a 2400-pixel maximum, and
              converted to WebP before direct upload.
            </p>
            <label>
              <span>Release artwork</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                :disabled="!draft.id"
                @change="uploadArtwork"
              />
            </label>
            <p v-if="progress.artwork" class="form-message" role="status">
              Artwork upload {{ Math.round(progress.artwork * 100) }}%
            </p>
            <p v-if="draft.artworkMediaId" class="field-help">
              Artwork attached · {{ draft.artworkMediaId }}
            </p>
          </div>
        </section>

        <section>
          <div class="admin-section-heading">
            <p class="section-number">03 / Tracks</p>
            <h2>Order, metadata, and source state</h2>
          </div>
          <div>
            <div class="bulk-track-entry">
              <label>
                <span>Bulk entry · one Title | slug per line</span>
                <textarea v-model="bulkTracks" rows="5" />
              </label>
              <button class="quiet-action" type="button" @click="applyBulkTracks">
                Apply bulk list
              </button>
            </div>
            <ol class="catalog-track-editor">
              <li
                v-for="(track, index) in draft.tracks"
                :key="track.id ?? `${track.slug}-${index}`"
              >
                <div class="track-editor-heading">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <h3>{{ track.title || 'Untitled track' }}</h3>
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
                    <button
                      class="quiet-action"
                      type="button"
                      :disabled="draft.tracks.length === 1"
                      @click="removeTrack(index)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div class="admin-fields">
                  <div class="nested-row">
                    <label><span>Title</span><input v-model="track.title" required /></label>
                    <label><span>Slug</span><input v-model="track.slug" required /></label>
                  </div>
                  <label
                    ><span>Description</span><textarea v-model="track.description" rows="3" />
                  </label>
                  <div class="catalog-musical-fields">
                    <label
                      ><span>Tempo</span
                      ><input v-model.number="track.tempoBpm" type="number" min="1" step="0.01"
                    /></label>
                    <label><span>Meter</span><input v-model="track.meter" /></label>
                    <label><span>Key</span><input v-model="track.musicalKey" /></label>
                    <label><span>Mood</span><input v-model="track.mood" /></label>
                  </div>
                  <label>
                    <span>Instruments · comma separated</span>
                    <input
                      :value="track.instruments.join(', ')"
                      @input="
                        track.instruments = ($event.target as HTMLInputElement).value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean)
                      "
                    />
                  </label>
                  <div class="source-upload-row">
                    <div>
                      <span class="field-help">Source and derivative</span>
                      <p v-if="track.media.source">
                        Source {{ track.media.source.status }} · job
                        {{ track.media.source.job?.status ?? 'not created' }}
                        <template v-if="track.media.source.job?.error_category">
                          · {{ track.media.source.job.error_category }}</template
                        >
                      </p>
                      <p v-else>No source attached.</p>
                      <p v-if="track.media.preview">Public preview ready.</p>
                    </div>
                    <label>
                      <span>Immutable source WAV, AIFF, or FLAC</span>
                      <input
                        type="file"
                        accept="audio/wav,audio/aiff,audio/x-aiff,audio/flac"
                        :disabled="!track.id"
                        @change="uploadSource(track, $event)"
                      />
                    </label>
                    <p v-if="track.id && progress[track.id]" class="form-message" role="status">
                      Upload {{ Math.round((progress[track.id] ?? 0) * 100) }}%
                    </p>
                    <button
                      v-if="track.media.source?.job?.status === 'failed'"
                      class="quiet-action"
                      type="button"
                      @click="retrySource(track.media.source.id)"
                    >
                      Retry processing
                    </button>
                  </div>
                </div>
              </li>
            </ol>
            <button class="text-action" type="button" @click="addTrack">Add track</button>
          </div>
        </section>

        <section>
          <div class="admin-section-heading">
            <p class="section-number">04 / Credits</p>
            <h2>Authorship stays attached</h2>
          </div>
          <div>
            <ol class="credit-editor">
              <li v-for="(credit, index) in draft.credits" :key="index" class="nested-row">
                <label><span>Role</span><input v-model="credit.role" required /></label>
                <label><span>Name</span><input v-model="credit.name" required /></label>
                <button class="quiet-action" type="button" @click="draft.credits.splice(index, 1)">
                  Remove
                </button>
              </li>
            </ol>
            <button class="text-action" type="button" @click="addCredit">Add credit</button>
          </div>
        </section>

        <div class="admin-publish-bar">
          <p>
            {{
              dirty
                ? 'Unsaved private changes.'
                : draft.hasDraft
                  ? 'Private draft saved.'
                  : 'Published state loaded.'
            }}
            Run <code>npm run media:work</code> locally to process queued sources.
          </p>
          <div>
            <button class="text-action" type="submit" :disabled="saving">Save draft</button>
            <button
              class="text-action text-action--primary"
              type="button"
              :disabled="saving"
              @click="publishRelease"
            >
              Publish release
            </button>
          </div>
        </div>
      </form>
    </div>

    <p v-if="message" class="form-message catalog-message" role="status">{{ message }}</p>
    <p v-else-if="error" class="form-message" role="alert">
      The music workspace could not be loaded.
    </p>
  </div>
</template>
