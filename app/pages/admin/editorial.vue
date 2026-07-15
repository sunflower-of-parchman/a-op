<script setup lang="ts">
import type { EditorialInput } from '#shared/schemas/learning'
import type { PageSection } from '#shared/schemas/page'

useSeoMeta({ title: 'Editorial administration' })
const { data, error, refresh } = await useFetch('/api/admin/editorial')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/editorial')
const draft = ref<EditorialInput | null>(null)
const snapshot = ref('')
const message = ref('')
const busy = ref(false)
const unsaved = computed(
  () => Boolean(draft.value) && JSON.stringify(draft.value) !== snapshot.value,
)
function selectDraft(value: EditorialInput) {
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
    kind: 'essay',
    slug: 'new-editorial-note',
    title: 'New editorial note',
    summary: 'Describe why this note belongs in the artist-owned archive.',
    publishedOn: new Date().toISOString().slice(0, 10),
    sections: [
      {
        id: crypto.randomUUID(),
        type: 'prose',
        heading: 'Begin here',
        body: 'Write in plain text.',
      },
    ],
  }
  snapshot.value = ''
}
function addSection(type: 'prose' | 'call_to_action' | 'credits' | 'links') {
  if (!draft.value) return
  const id = crypto.randomUUID()
  const section: PageSection =
    type === 'prose'
      ? { id, type, heading: 'New section', body: 'Write in plain text.' }
      : type === 'call_to_action'
        ? { id, type, heading: 'Continue', body: '', label: 'Open', href: '/' }
        : type === 'credits'
          ? { id, type, heading: 'Credits', items: [{ role: 'Created by', name: 'Artist name' }] }
          : {
              id,
              type,
              heading: 'Related links',
              items: [{ label: 'Resource', href: 'https://example.com' }],
            }
  draft.value.sections.push(section)
}
function move(index: number, direction: -1 | 1) {
  if (!draft.value) return
  const destination = index + direction
  if (destination < 0 || destination >= draft.value.sections.length) return
  const [section] = draft.value.sections.splice(index, 1)
  if (section) draft.value.sections.splice(destination, 0, section)
}
async function saveDraft() {
  if (!draft.value) return false
  busy.value = true
  try {
    const savedId = draft.value.id
    await $fetch('/api/admin/editorial', { method: 'PUT', body: draft.value })
    await refresh()
    const savedDraft = data.value?.drafts.find((item) => item.id === savedId)
    if (savedDraft) selectDraft(savedDraft)
    else snapshot.value = JSON.stringify(draft.value)
    message.value = 'Editorial draft saved. Raw HTML and scripts are excluded.'
    return true
  } catch {
    message.value = 'Editorial draft did not pass structured-content validation.'
    return false
  } finally {
    busy.value = false
  }
}
async function publishDraft() {
  if (!draft.value) return
  if (unsaved.value && !(await saveDraft())) return
  if (!window.confirm('Publish this exact editorial order and text?')) return
  busy.value = true
  try {
    await $fetch('/api/admin/editorial/publish', { method: 'POST', body: { id: draft.value.id } })
    await refresh()
    message.value = 'Editorial work published from the approved draft.'
  } catch {
    message.value = 'Editorial work could not be published.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page-frame admin-editor editorial-admin">
    <header class="page-heading">
      <p class="eyebrow">Artist administration / Editorial</p>
      <h1>Keep notes and announcements inside the work.</h1>
      <p>
        Ordered structured sections provide useful emphasis without accepting raw HTML, scripts, or
        unapproved embeds.
      </p>
    </header>
    <div class="admin-record-selector">
      <button class="text-action" type="button" @click="createDraft">Create editorial work</button
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
      <section aria-labelledby="editorial-details-heading">
        <div class="admin-section-heading">
          <p class="section-number">01 / Publication</p>
          <h2 id="editorial-details-heading">Identity and date</h2>
        </div>
        <div class="admin-fields">
          <label
            ><span>Kind</span
            ><select v-model="draft.kind">
              <option value="essay">Essay</option>
              <option value="announcement">Announcement</option>
              <option value="learning_note">Learning note</option>
              <option value="information">Information</option>
            </select></label
          ><label><span>Title</span><input v-model="draft.title" required /></label
          ><label
            ><span>Slug</span
            ><input v-model="draft.slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label
          ><label
            ><span>Publication date</span
            ><input v-model="draft.publishedOn" type="date" required /></label
          ><label><span>Summary</span><textarea v-model="draft.summary" required rows="4" /></label>
        </div>
      </section>
      <section aria-labelledby="editorial-sections-heading">
        <div class="admin-section-heading">
          <p class="section-number">02 / Sections</p>
          <h2 id="editorial-sections-heading">Safe authored order</h2>
        </div>
        <ol class="section-editor-list">
          <li v-for="(section, index) in draft.sections" :key="section.id">
            <div class="section-editor-controls">
              <strong>{{ index + 1 }} · {{ section.type.replaceAll('_', ' ') }}</strong>
              <div>
                <button
                  class="quiet-action"
                  type="button"
                  :disabled="index === 0"
                  @click="move(index, -1)"
                >
                  Up</button
                ><button
                  class="quiet-action"
                  type="button"
                  :disabled="index === draft.sections.length - 1"
                  @click="move(index, 1)"
                >
                  Down</button
                ><button
                  class="quiet-action"
                  type="button"
                  :disabled="draft.sections.length === 1"
                  @click="draft.sections.splice(index, 1)"
                >
                  Remove
                </button>
              </div>
            </div>
            <div v-if="section.type === 'prose'" class="admin-fields">
              <label><span>Eyebrow</span><input v-model="section.eyebrow" /></label
              ><label><span>Heading</span><input v-model="section.heading" required /></label
              ><label><span>Body</span><textarea v-model="section.body" required rows="8" /></label>
            </div>
            <div v-else-if="section.type === 'call_to_action'" class="admin-fields">
              <label><span>Heading</span><input v-model="section.heading" required /></label
              ><label><span>Body</span><textarea v-model="section.body" rows="3" /></label
              ><label><span>Label</span><input v-model="section.label" required /></label
              ><label
                ><span>Internal path</span><input v-model="section.href" required pattern="/.*"
              /></label>
            </div>
            <div v-else-if="section.type === 'credits'" class="admin-fields">
              <label><span>Heading</span><input v-model="section.heading" required /></label>
              <div v-for="(item, itemIndex) in section.items" :key="itemIndex" class="nested-row">
                <label><span>Role</span><input v-model="item.role" required /></label
                ><label><span>Name</span><input v-model="item.name" required /></label
                ><button
                  class="quiet-action"
                  type="button"
                  :disabled="section.items.length === 1"
                  @click="section.items.splice(itemIndex, 1)"
                >
                  Remove
                </button>
              </div>
              <button
                class="text-action"
                type="button"
                @click="section.items.push({ role: 'Role', name: 'Name' })"
              >
                Add credit
              </button>
            </div>
            <div v-else-if="section.type === 'links'" class="admin-fields">
              <label><span>Heading</span><input v-model="section.heading" required /></label>
              <div v-for="(item, itemIndex) in section.items" :key="itemIndex" class="nested-row">
                <label><span>Label</span><input v-model="item.label" required /></label
                ><label
                  ><span>HTTPS URL</span><input v-model="item.href" type="url" required /></label
                ><button
                  class="quiet-action"
                  type="button"
                  :disabled="section.items.length === 1"
                  @click="section.items.splice(itemIndex, 1)"
                >
                  Remove
                </button>
              </div>
              <button
                class="text-action"
                type="button"
                @click="section.items.push({ label: 'Resource', href: 'https://example.com' })"
              >
                Add link
              </button>
            </div>
          </li>
        </ol>
        <div class="section-add-actions">
          <button class="quiet-action" type="button" @click="addSection('prose')">Add prose</button
          ><button class="quiet-action" type="button" @click="addSection('call_to_action')">
            Add action</button
          ><button class="quiet-action" type="button" @click="addSection('credits')">
            Add credits</button
          ><button class="quiet-action" type="button" @click="addSection('links')">
            Add links
          </button>
        </div>
      </section>
      <section class="editorial-draft-preview" aria-labelledby="editorial-preview-heading">
        <div class="admin-section-heading">
          <p class="section-number">03 / Preview</p>
          <h2 id="editorial-preview-heading">Current structured draft</h2>
        </div>
        <StructuredSections :sections="draft.sections" />
      </section>
      <div class="admin-submit-row">
        <button class="text-action" type="submit" :disabled="busy">Save private draft</button
        ><button
          class="text-action text-action--primary"
          type="button"
          :disabled="busy"
          @click="publishDraft"
        >
          Publish approved work
        </button>
      </div>
      <p v-if="message" class="form-message" role="status">{{ message }}</p>
    </form>
  </div>
</template>
