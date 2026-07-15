<script setup lang="ts">
import type { ArtistConfig } from '#shared/schemas/artistConfig'

useSeoMeta({ title: 'Identity and design' })

const { data, error } = await useFetch('/api/admin/config')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/identity')
if (!data.value?.published && !data.value?.draft) {
  throw createError({ statusCode: 503, statusMessage: 'Artist configuration is unavailable.' })
}

const startingConfig = structuredClone(
  (data.value?.draft?.config ?? data.value?.published?.config) as ArtistConfig,
)
const config = ref<ArtistConfig>(startingConfig)
const draftId = ref(data.value?.draft?.id ?? null)
const savedSnapshot = ref(JSON.stringify(startingConfig))
const message = ref('')
const saving = ref(false)
const publishing = ref(false)
const ready = ref(false)
const unsaved = computed(() => JSON.stringify(config.value) !== savedSnapshot.value)
const previewTheme = computed(() => artistThemeFromConfig(config.value))

function addNavigationItem() {
  config.value.navigation.push({ label: 'New page', to: '/new-page' })
}

function removeNavigationItem(index: number) {
  if (config.value.navigation.length > 1) config.value.navigation.splice(index, 1)
}

async function saveDraft() {
  saving.value = true
  message.value = ''
  try {
    const result = await $fetch('/api/admin/config/draft', {
      method: 'PUT',
      body: config.value,
    })
    draftId.value = result.draft.id
    savedSnapshot.value = JSON.stringify(config.value)
    message.value = 'Draft saved. The public site is unchanged.'
  } catch {
    message.value = 'The draft did not pass validation. Review each field and try again.'
  } finally {
    saving.value = false
  }
}

async function publishDraft() {
  if (unsaved.value || !draftId.value) {
    message.value = 'Save the current draft before publishing.'
    return
  }
  publishing.value = true
  try {
    await $fetch('/api/admin/config/publish', { method: 'POST', body: { id: draftId.value } })
    setArtistConfig(config.value)
    if (import.meta.client) window.location.assign('/')
  } catch {
    message.value = 'The draft could not be published.'
    publishing.value = false
  }
}

function confirmLeave() {
  return !unsaved.value || !import.meta.client || window.confirm('Leave without saving this draft?')
}

onBeforeRouteLeave(confirmLeave)
onMounted(() => {
  ready.value = true
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
})

function beforeUnload(event: BeforeUnloadEvent) {
  if (!unsaved.value) return
  event.preventDefault()
}
</script>

<template>
  <div class="page-frame admin-editor">
    <header class="page-heading">
      <p class="eyebrow">Artist administration / Identity</p>
      <h1>Make the site unmistakably yours.</h1>
      <p>Work in a validated draft, inspect the result here, then publish it explicitly.</p>
    </header>

    <form class="admin-edit-form" @submit.prevent="saveDraft">
      <section aria-labelledby="identity-heading">
        <div class="admin-section-heading">
          <p class="section-number">01 / Identity</p>
          <h2 id="identity-heading">Name and public voice</h2>
        </div>
        <div class="admin-fields">
          <label
            ><span>Artist name</span><input v-model="config.identity.name" required maxlength="80"
          /></label>
          <label
            ><span>Wordmark</span
            ><input v-model="config.design.logo.wordmark" required maxlength="80"
          /></label>
          <label
            ><span>About eyebrow</span
            ><input v-model="config.identity.eyebrow" required maxlength="100"
          /></label>
          <label
            ><span>Primary statement</span
            ><textarea v-model="config.identity.statement" rows="3" required maxlength="180" />
          </label>
          <label
            ><span>Biography</span
            ><textarea v-model="config.identity.biography" rows="8" required maxlength="1200" />
          </label>
          <label
            ><span>Location</span><input v-model="config.identity.location" maxlength="100"
          /></label>
        </div>
      </section>

      <section aria-labelledby="design-heading">
        <div class="admin-section-heading">
          <p class="section-number">02 / Design</p>
          <h2 id="design-heading">Semantic color system</h2>
        </div>
        <div class="color-fields">
          <label v-for="(_, key) in config.design.colors" :key="key">
            <span>{{ String(key).replace(/([A-Z])/g, ' $1') }}</span>
            <input v-model="config.design.colors[key]" type="color" />
            <code>{{ config.design.colors[key] }}</code>
          </label>
        </div>
      </section>

      <section aria-labelledby="navigation-heading">
        <div class="admin-section-heading">
          <p class="section-number">03 / Navigation</p>
          <h2 id="navigation-heading">Authored order</h2>
        </div>
        <ol class="navigation-editor">
          <li v-for="(item, index) in config.navigation" :key="index">
            <span class="navigation-position">0{{ index + 1 }}</span>
            <label><span>Label</span><input v-model="item.label" required maxlength="40" /></label>
            <label><span>Path</span><input v-model="item.to" required pattern="/.*" /></label>
            <button
              class="quiet-action"
              type="button"
              :disabled="config.navigation.length === 1"
              @click="removeNavigationItem(index)"
            >
              Remove
            </button>
          </li>
        </ol>
        <button
          class="text-action"
          type="button"
          :disabled="config.navigation.length >= 10"
          @click="addNavigationItem"
        >
          Add navigation item
        </button>
      </section>

      <section aria-labelledby="home-heading">
        <div class="admin-section-heading">
          <p class="section-number">04 / Home</p>
          <h2 id="home-heading">Opening invitation</h2>
        </div>
        <div class="admin-fields">
          <label
            ><span>Kicker</span><input v-model="config.homepage.kicker" required maxlength="80"
          /></label>
          <label
            ><span>Introduction</span
            ><textarea v-model="config.homepage.introduction" rows="5" required maxlength="320" />
          </label>
          <label
            ><span>Featured release title</span
            ><input v-model="config.homepage.release.title" required maxlength="120"
          /></label>
          <label
            ><span>Featured release description</span
            ><textarea
              v-model="config.homepage.release.description"
              rows="5"
              required
              maxlength="500"
            />
          </label>
        </div>
      </section>

      <section class="admin-preview" :style="previewTheme" aria-labelledby="preview-heading">
        <p class="section-number">05 / Preview</p>
        <div>
          <p class="preview-artist-name">{{ config.identity.name }}</p>
          <p class="eyebrow">{{ config.homepage.kicker }}</p>
          <h2 id="preview-heading">{{ config.identity.statement }}</h2>
          <p>{{ config.homepage.introduction }}</p>
          <span class="preview-wordmark">{{ config.design.logo.wordmark }}</span>
        </div>
      </section>

      <div class="admin-publish-bar">
        <p>
          <strong>{{
            unsaved ? 'Unsaved changes' : draftId ? 'Draft saved' : 'Published version loaded'
          }}</strong
          ><br />
          Saving preserves a private draft. Publishing replaces the public version.
        </p>
        <div>
          <button class="text-action" type="submit" :disabled="!ready || saving">
            {{ saving ? 'Saving…' : 'Save draft' }}
          </button>
          <button
            class="text-action text-action--primary"
            type="button"
            :disabled="!ready || publishing || unsaved || !draftId"
            @click="publishDraft"
          >
            {{ publishing ? 'Publishing…' : 'Publish site' }}
          </button>
        </div>
      </div>
      <p v-if="message" class="form-message" role="status">{{ message }}</p>
    </form>
  </div>
</template>
