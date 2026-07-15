<script setup lang="ts">
import type { PageInput, PageSection } from '#shared/schemas/page'

const route = useRoute()
const slug = String(route.params.slug)
const { data, error } = await useFetch(`/api/admin/pages/${slug}`)
if (error.value?.statusCode === 401) await navigateTo(`/sign-in?redirect=/admin/pages/${slug}`)
const source = data.value?.draft ?? data.value?.published
if (!source) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

useSeoMeta({ title: `Edit ${source.title}` })

const page = ref<PageInput>(structuredClone(source))
const draftId = ref(data.value?.draft?.id ?? null)
const savedSnapshot = ref(JSON.stringify(page.value))
const unsaved = computed(() => JSON.stringify(page.value) !== savedSnapshot.value)
const message = ref('')
const saving = ref(false)
const publishing = ref(false)
const ready = ref(false)

onMounted(() => {
  ready.value = true
})

function addSection(type: 'prose' | 'call_to_action' | 'contact') {
  const id = crypto.randomUUID()
  const section: PageSection =
    type === 'prose'
      ? { id, type, heading: 'New section', body: 'Write this section in your own words.' }
      : type === 'call_to_action'
        ? { id, type, heading: 'A clear next step', body: '', label: 'Continue', href: '/' }
        : {
            id,
            type,
            heading: 'Begin with a clear note.',
            introduction: 'Explain what kinds of messages belong here.',
            consentLabel: 'I understand this message will be stored so the artist can respond.',
          }
  page.value.sections.push(section)
}

function moveSection(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= page.value.sections.length) return
  const [section] = page.value.sections.splice(index, 1)
  if (!section) return
  page.value.sections.splice(target, 0, section)
}

function removeSection(index: number) {
  page.value.sections.splice(index, 1)
}

async function saveDraft() {
  saving.value = true
  message.value = ''
  try {
    const result = await $fetch(`/api/admin/pages/${slug}`, { method: 'PUT', body: page.value })
    draftId.value = result.draft.id
    savedSnapshot.value = JSON.stringify(page.value)
    message.value = 'Page draft saved. The published page is unchanged.'
  } catch {
    message.value = 'The page did not pass validation. Review each section and try again.'
  } finally {
    saving.value = false
  }
}

async function publishDraft() {
  if (unsaved.value || !draftId.value) {
    message.value = 'Save the current page draft before publishing.'
    return
  }
  publishing.value = true
  try {
    await $fetch(`/api/admin/pages/${slug}/publish`, {
      method: 'POST',
      body: { id: draftId.value },
    })
    if (import.meta.client) window.location.assign(`/${slug}`)
  } catch {
    message.value = 'The page could not be published.'
    publishing.value = false
  }
}

function confirmLeave() {
  return !unsaved.value || !import.meta.client || window.confirm('Leave without saving this page?')
}
onBeforeRouteLeave(confirmLeave)

function beforeUnload(event: BeforeUnloadEvent) {
  if (!unsaved.value) return
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <div class="page-frame admin-editor">
    <header class="page-heading">
      <p class="eyebrow">Artist administration / Pages / {{ slug }}</p>
      <h1>{{ page.title }}</h1>
      <p>Arrange a deliberate page from validated content sections.</p>
    </header>

    <form class="admin-edit-form" @submit.prevent="saveDraft">
      <section aria-labelledby="page-settings-heading">
        <div class="admin-section-heading">
          <p class="section-number">01 / Page</p>
          <h2 id="page-settings-heading">Title and search description</h2>
        </div>
        <div class="admin-fields">
          <label
            ><span>Page title</span><input v-model="page.title" required maxlength="200"
          /></label>
          <label
            ><span>Navigation label</span><input v-model="page.navigationLabel" maxlength="60"
          /></label>
          <label
            ><span>Search title</span><input v-model="page.seo.title" required maxlength="80"
          /></label>
          <label
            ><span>Search description</span
            ><textarea v-model="page.seo.description" rows="4" required maxlength="320" />
          </label>
        </div>
      </section>

      <section aria-labelledby="sections-heading">
        <div class="admin-section-heading">
          <p class="section-number">02 / Sections</p>
          <h2 id="sections-heading">Authored order</h2>
        </div>

        <ol class="section-editor-list">
          <li v-for="(section, index) in page.sections" :key="section.id">
            <div class="section-editor-controls">
              <strong>0{{ index + 1 }} · {{ section.type.replaceAll('_', ' ') }}</strong>
              <div>
                <button
                  class="quiet-action"
                  type="button"
                  :disabled="index === 0"
                  @click="moveSection(index, -1)"
                >
                  Move up
                </button>
                <button
                  class="quiet-action"
                  type="button"
                  :disabled="index === page.sections.length - 1"
                  @click="moveSection(index, 1)"
                >
                  Move down
                </button>
                <button class="quiet-action" type="button" @click="removeSection(index)">
                  Remove
                </button>
              </div>
            </div>

            <div v-if="section.type === 'prose'" class="admin-fields">
              <label><span>Eyebrow</span><input v-model="section.eyebrow" maxlength="80" /></label>
              <label
                ><span>Heading</span><input v-model="section.heading" required maxlength="180"
              /></label>
              <label
                ><span>Body</span
                ><textarea v-model="section.body" rows="8" required maxlength="5000" />
              </label>
            </div>
            <div v-else-if="section.type === 'call_to_action'" class="admin-fields">
              <label
                ><span>Heading</span><input v-model="section.heading" required maxlength="180"
              /></label>
              <label
                ><span>Body</span><textarea v-model="section.body" rows="4" maxlength="1000" />
              </label>
              <label
                ><span>Action label</span><input v-model="section.label" required maxlength="80"
              /></label>
              <label
                ><span>Internal path</span><input v-model="section.href" required pattern="/.*"
              /></label>
            </div>
            <div v-else-if="section.type === 'contact'" class="admin-fields">
              <label
                ><span>Heading</span><input v-model="section.heading" required maxlength="180"
              /></label>
              <label
                ><span>Introduction</span
                ><textarea v-model="section.introduction" rows="5" required maxlength="1000" />
              </label>
              <label
                ><span>Consent label</span
                ><textarea v-model="section.consentLabel" rows="3" required maxlength="240" />
              </label>
            </div>
            <p v-else class="field-help">
              This section type is preserved and previewed. Its dedicated editor arrives with its
              product module.
            </p>
          </li>
        </ol>

        <div class="section-add-actions">
          <button class="text-action" type="button" @click="addSection('prose')">Add prose</button>
          <button class="text-action" type="button" @click="addSection('call_to_action')">
            Add call to action
          </button>
          <button class="text-action" type="button" @click="addSection('contact')">
            Add contact form
          </button>
        </div>
      </section>

      <section class="structured-preview" aria-labelledby="page-preview-heading">
        <p class="section-number">03 / Preview</p>
        <h2 id="page-preview-heading">{{ page.title }}</h2>
        <StructuredSections :sections="page.sections" />
      </section>

      <div class="admin-publish-bar">
        <p>
          <strong>{{
            unsaved ? 'Unsaved changes' : draftId ? 'Draft saved' : 'Published version loaded'
          }}</strong
          ><br />
          The ordered sections become public only after publication.
        </p>
        <div>
          <button class="text-action" type="submit" :disabled="!ready || saving">
            {{ saving ? 'Saving…' : 'Save page draft' }}
          </button>
          <button
            class="text-action text-action--primary"
            type="button"
            :disabled="!ready || publishing || unsaved || !draftId"
            @click="publishDraft"
          >
            {{ publishing ? 'Publishing…' : 'Publish page' }}
          </button>
        </div>
      </div>
      <p v-if="message" class="form-message" role="status">{{ message }}</p>
    </form>
  </div>
</template>
