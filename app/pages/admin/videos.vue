<script setup lang="ts">
import type { VideoInput } from '#shared/schemas/learning'

useSeoMeta({ title: 'Video administration' })
const { data, error, refresh } = await useFetch('/api/admin/videos')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/videos')
const draft = ref<VideoInput | null>(null)
const snapshot = ref('')
const message = ref('')
const busy = ref(false)
const unsaved = computed(
  () => Boolean(draft.value) && JSON.stringify(draft.value) !== snapshot.value,
)

function selectDraft(value: VideoInput) {
  draft.value = structuredClone(value)
  snapshot.value = JSON.stringify(draft.value)
  message.value = ''
}
watchEffect(() => {
  if (!draft.value && data.value?.drafts[0]) selectDraft(data.value.drafts[0])
})
function createDraft() {
  draft.value = {
    id: crypto.randomUUID(),
    slug: 'new-video',
    title: 'New video',
    summary: 'Describe what the visitor will see and why it belongs here.',
    provider: 'youtube',
    externalId: 'M7lc1UVf-VE',
    hostedMediaId: null,
    posterUrl: null,
    transcript: 'Add the complete transcript in plain text.',
    credits: [{ role: 'Created by', name: 'Artist name' }],
  }
  snapshot.value = ''
}
function normalizeProvider() {
  if (!draft.value) return
  if (draft.value.provider === 'hosted') {
    draft.value.externalId = null
    draft.value.hostedMediaId = data.value?.media[0]?.id ?? null
  } else {
    draft.value.externalId ||= 'M7lc1UVf-VE'
    draft.value.hostedMediaId = null
  }
}
async function saveDraft() {
  if (!draft.value) return false
  busy.value = true
  try {
    await $fetch('/api/admin/videos', { method: 'PUT', body: draft.value })
    snapshot.value = JSON.stringify(draft.value)
    await refresh()
    message.value = 'Video draft saved. The published entry is unchanged.'
    return true
  } catch {
    message.value = 'Video draft did not pass source, transcript, or credit validation.'
    return false
  } finally {
    busy.value = false
  }
}
async function publishDraft() {
  if (!draft.value) return
  if (unsaved.value && !(await saveDraft())) return
  if (!window.confirm('Publish this approved video source, transcript, and credits?')) return
  busy.value = true
  try {
    await $fetch('/api/admin/videos/publish', { method: 'POST', body: { id: draft.value.id } })
    await refresh()
    message.value = 'Video published with its transcript and credits.'
  } catch {
    message.value = 'Video could not be published.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page-frame admin-editor video-admin">
    <header class="page-heading">
      <p class="eyebrow">Artist administration / Video</p>
      <h1>Publish the source, context, and transcript together.</h1>
      <p>
        External players remain unloaded until a visitor chooses to contact the approved provider.
      </p>
    </header>
    <div class="admin-record-selector">
      <button class="text-action" type="button" @click="createDraft">Create video</button
      ><button
        v-for="item in data?.drafts ?? []"
        :key="item.id"
        class="quiet-action"
        type="button"
        @click="selectDraft(item)"
      >
        {{ item.title }} · {{ item.publishedAt ? 'published' : 'draft only' }}
      </button>
    </div>
    <form v-if="draft" class="admin-edit-form" @submit.prevent="saveDraft">
      <section aria-labelledby="video-details-heading">
        <div class="admin-section-heading">
          <p class="section-number">01 / Entry</p>
          <h2 id="video-details-heading">Source and public context</h2>
        </div>
        <div class="admin-fields">
          <label><span>Title</span><input v-model="draft.title" required /></label
          ><label
            ><span>Slug</span
            ><input v-model="draft.slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label
          ><label><span>Summary</span><textarea v-model="draft.summary" required rows="4" /></label>
          <label
            ><span>Provider</span
            ><select v-model="draft.provider" @change="normalizeProvider">
              <option value="youtube">YouTube privacy-enhanced</option>
              <option value="vimeo">Vimeo do-not-track</option>
              <option value="hosted">Artist-hosted media</option>
            </select></label
          >
          <label v-if="draft.provider !== 'hosted'"
            ><span>Approved provider video ID</span
            ><input v-model="draft.externalId" required /></label
          ><label v-else
            ><span>Hosted video media</span
            ><select v-model="draft.hostedMediaId" required>
              <option :value="null">Choose uploaded video</option>
              <option v-for="media in data?.media ?? []" :key="media.id" :value="media.id">
                {{ media.object_path }}
              </option>
            </select></label
          >
          <label
            ><span>Optional poster path or HTTPS URL</span
            ><input v-model="draft.posterUrl" /></label
          ><label
            ><span>Complete transcript</span
            ><textarea v-model="draft.transcript" required rows="12" />
          </label>
        </div>
      </section>
      <section aria-labelledby="video-credits-heading">
        <div class="admin-section-heading">
          <p class="section-number">02 / Credits</p>
          <h2 id="video-credits-heading">Visible source authority</h2>
        </div>
        <div class="admin-fields">
          <div v-for="(credit, index) in draft.credits" :key="index" class="nested-row">
            <label><span>Role</span><input v-model="credit.role" required /></label
            ><label><span>Name</span><input v-model="credit.name" required /></label
            ><button
              class="quiet-action"
              type="button"
              :disabled="draft.credits.length === 1"
              @click="draft.credits.splice(index, 1)"
            >
              Remove
            </button>
          </div>
          <button
            class="text-action"
            type="button"
            @click="draft.credits.push({ role: 'Role', name: 'Name' })"
          >
            Add credit
          </button>
        </div>
      </section>
      <section class="video-draft-preview" aria-labelledby="video-preview-heading">
        <div class="admin-section-heading">
          <p class="section-number">03 / Preview</p>
          <h2 id="video-preview-heading">Consent boundary</h2>
        </div>
        <div class="video-draft-experience">
          <img v-if="draft.posterUrl" :src="draft.posterUrl" alt="" />
          <h3>{{ draft.title }}</h3>
          <p>{{ draft.summary }}</p>
          <p>
            The {{ draft.provider }} player remains unloaded until the visitor explicitly chooses
            it.
          </p>
          <details open>
            <summary>Complete transcript</summary>
            <p class="preserve-lines">{{ draft.transcript }}</p>
          </details>
          <dl class="video-credits">
            <div v-for="credit in draft.credits" :key="`${credit.role}-${credit.name}`">
              <dt>{{ credit.role }}</dt>
              <dd>{{ credit.name }}</dd>
            </div>
          </dl>
        </div>
      </section>
      <div class="admin-submit-row">
        <button class="text-action" type="submit" :disabled="busy">Save private draft</button
        ><button
          class="text-action text-action--primary"
          type="button"
          :disabled="busy"
          @click="publishDraft"
        >
          Publish approved video
        </button>
      </div>
      <p v-if="message" class="form-message" role="status">{{ message }}</p>
    </form>
  </div>
</template>
