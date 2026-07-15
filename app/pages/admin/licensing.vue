<script setup lang="ts">
import type { PublishLicenseTemplateInput } from '#shared/schemas/licensing'

useSeoMeta({ title: 'Licensing administration' })

const { data, error, refresh } = await useFetch('/api/admin/licensing')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/licensing')

function blankOption(index: number) {
  return {
    key: index === 0 ? 'supported-use' : `supported-use-${index + 1}`,
    label: 'Supported use',
    description: 'Describe the exact project use this checkout permits.',
    usageCategory: 'Synchronization',
    allowedMedia: ['Dance film'],
    audienceLabel: 'Up to 1,000 viewers',
    maxAudience: 1000,
    distributionLabel: 'One independently released project',
    maxCopies: 1,
    termMonths: 12,
    territory: 'Worldwide',
    attributionRequired: true,
    attributionText: '',
    exclusive: false as const,
    currency: 'USD',
    amountMinor: 7500,
    sortOrder: index + 1,
  }
}

const editor = ref<PublishLicenseTemplateInput>({
  templateId: null,
  trackId: data.value?.tracks.find(({ state }) => state === 'published')?.id ?? '',
  slug: '',
  name: '',
  summary: '',
  title: 'Limited non-exclusive music license',
  introduction:
    'This license grants only the selected supported use. The artist keeps every right not expressly granted.',
  generalTerms: [
    {
      heading: 'Grant and ownership',
      body: 'The selected recording may be used only in the named project. Copyright and ownership remain with the artist.',
    },
  ],
  disclaimer:
    'This artist-configurable business document is not legal advice. Review production terms with qualified counsel before live use.',
  options: [blankOption(0)],
})
const saving = ref(false)
const retryingId = ref('')
const message = ref('')

function addTerm() {
  editor.value.generalTerms.push({
    heading: 'Additional term',
    body: 'Describe this term clearly.',
  })
}

function addOption() {
  editor.value.options.push(blankOption(editor.value.options.length))
}

function revise(template: NonNullable<typeof data.value>['templates'][number]) {
  if (!template.currentVersion) return
  editor.value = {
    templateId: template.id,
    trackId: template.track_id,
    slug: template.slug,
    name: template.name,
    summary: template.summary,
    title: template.currentVersion.title,
    introduction: template.currentVersion.introduction,
    generalTerms: template.currentVersion
      .general_terms as PublishLicenseTemplateInput['generalTerms'],
    disclaimer: template.currentVersion.disclaimer,
    options: template.options.map((option, index) => ({
      key: option.option_key,
      label: option.label,
      description: option.description,
      usageCategory: option.usage_category,
      allowedMedia: [...option.allowed_media],
      audienceLabel: option.audience_label,
      maxAudience: option.max_audience,
      distributionLabel: option.distribution_label,
      maxCopies: option.max_copies,
      termMonths: option.term_months,
      territory: option.territory,
      attributionRequired: option.attribution_required,
      attributionText: option.attribution_text,
      exclusive: false,
      currency: option.currency,
      amountMinor: option.amount_minor,
      sortOrder: index + 1,
    })),
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function publish() {
  saving.value = true
  message.value = ''
  try {
    const body = {
      ...editor.value,
      options: editor.value.options.map((option, index) => ({
        ...option,
        allowedMedia: option.allowedMedia.map((entry) => entry.trim()).filter(Boolean),
        maxAudience: Number(option.maxAudience) || null,
        maxCopies: Number(option.maxCopies) || null,
        sortOrder: index + 1,
      })),
    }
    await $fetch('/api/admin/licensing', { method: 'POST', body })
    await refresh()
    message.value = editor.value.templateId
      ? 'A new immutable licensing version was published.'
      : 'The licensing template and its first immutable version were published.'
  } catch {
    message.value = 'The licensing version could not be published. Check every term and option.'
  } finally {
    saving.value = false
  }
}

async function retryDocument(licenseId: string) {
  retryingId.value = licenseId
  await $fetch(`/api/admin/licensing/documents/${licenseId}/retry`, { method: 'POST' })
  await refresh()
  retryingId.value = ''
  message.value = 'The document job is queued for the licensing worker.'
}
</script>

<template>
  <div class="page-frame admin-frame licensing-admin">
    <header class="page-heading">
      <p class="eyebrow">Licensing administration</p>
      <h1>The artist publishes the supported use before a buyer can choose it.</h1>
      <p>
        Saving creates a new immutable version. Existing selections and issued documents keep the
        language and price that were visible at their checkout.
      </p>
    </header>

    <form v-if="data" class="license-template-editor" @submit.prevent="publish">
      <div class="admin-form-grid">
        <label>
          <span>Published track</span>
          <select v-model="editor.trackId" required :disabled="Boolean(editor.templateId)">
            <option
              v-for="track in data.tracks.filter(({ state }) => state === 'published')"
              :key="track.id"
              :value="track.id"
            >
              {{ track.title }}
            </option>
          </select>
        </label>
        <label><span>Template slug</span><input v-model="editor.slug" required /></label>
        <label
          ><span>Public name</span><input v-model="editor.name" required maxlength="160"
        /></label>
        <label
          ><span>Document title</span><input v-model="editor.title" required maxlength="200"
        /></label>
      </div>
      <label
        ><span>Public summary</span><textarea v-model="editor.summary" rows="3" maxlength="2000" />
      </label>
      <label
        ><span>License introduction</span
        ><textarea v-model="editor.introduction" rows="4" required maxlength="4000" />
      </label>

      <section class="license-term-editor" aria-labelledby="general-terms-editor">
        <header>
          <div>
            <p class="section-number">Immutable language</p>
            <h2 id="general-terms-editor">General terms</h2>
          </div>
          <button class="quiet-action" type="button" @click="addTerm">Add term</button>
        </header>
        <div v-for="(term, index) in editor.generalTerms" :key="index" class="license-term-row">
          <label><span>Heading</span><input v-model="term.heading" required /></label>
          <label
            ><span>Plain-language term</span><textarea v-model="term.body" rows="3" required />
          </label>
          <button
            v-if="editor.generalTerms.length > 1"
            class="quiet-action"
            type="button"
            @click="editor.generalTerms.splice(index, 1)"
          >
            Remove
          </button>
        </div>
      </section>

      <section class="license-option-editor" aria-labelledby="supported-options-editor">
        <header>
          <div>
            <p class="section-number">Published pricing rules</p>
            <h2 id="supported-options-editor">Supported uses</h2>
          </div>
          <button class="quiet-action" type="button" @click="addOption">Add option</button>
        </header>
        <article v-for="(option, index) in editor.options" :key="index">
          <div class="admin-form-grid">
            <label><span>Stable key</span><input v-model="option.key" required /></label>
            <label><span>Buyer-facing label</span><input v-model="option.label" required /></label>
            <label
              ><span>Usage category</span><input v-model="option.usageCategory" required
            /></label>
            <label
              ><span>Allowed media, comma separated</span
              ><input
                :value="option.allowedMedia.join(', ')"
                required
                @input="option.allowedMedia = ($event.target as HTMLInputElement).value.split(',')"
            /></label>
            <label
              ><span>Audience description</span><input v-model="option.audienceLabel" required
            /></label>
            <label
              ><span>Maximum audience</span
              ><input v-model.number="option.maxAudience" type="number" min="1" required
            /></label>
            <label
              ><span>Distribution description</span
              ><input v-model="option.distributionLabel" required
            /></label>
            <label
              ><span>Maximum projects or copies</span
              ><input v-model.number="option.maxCopies" type="number" min="1" required
            /></label>
            <label
              ><span>Term in months</span
              ><input v-model.number="option.termMonths" type="number" min="1" required
            /></label>
            <label><span>Territory</span><input v-model="option.territory" required /></label>
            <label
              ><span>Currency</span><input v-model="option.currency" maxlength="3" required
            /></label>
            <label
              ><span>Amount in minor units</span
              ><input v-model.number="option.amountMinor" type="number" min="1" required
            /></label>
          </div>
          <label
            ><span>Description</span><textarea v-model="option.description" rows="3" required />
          </label>
          <label class="inline-check"
            ><input v-model="option.attributionRequired" type="checkbox" /><span
              >Attribution is required</span
            ></label
          >
          <label
            ><span>Required credit</span
            ><input v-model="option.attributionText" :required="option.attributionRequired"
          /></label>
          <p>Exclusivity: non-exclusive. Exclusive uses always route to inquiry.</p>
          <button
            v-if="editor.options.length > 1"
            class="quiet-action"
            type="button"
            @click="editor.options.splice(index, 1)"
          >
            Remove option
          </button>
        </article>
      </section>

      <label
        ><span>Document notice</span><textarea v-model="editor.disclaimer" rows="3" required />
      </label>
      <button class="text-action" type="submit" :disabled="saving">
        {{
          saving
            ? 'Publishing…'
            : editor.templateId
              ? 'Publish revised version'
              : 'Publish first version'
        }}
      </button>
    </form>

    <section
      v-if="data"
      class="license-template-history"
      aria-labelledby="template-history-heading"
    >
      <div>
        <p class="section-number">Current artist terms</p>
        <h2 id="template-history-heading">Published templates</h2>
      </div>
      <ol>
        <li v-for="template in data.templates" :key="template.id">
          <div>
            <strong>{{ template.name }}</strong>
            <span
              >Version {{ template.currentVersion?.version_number }} ·
              {{ template.options.length }} option(s)</span
            >
            <span
              >{{ template.options.filter(({ stripeMapped }) => stripeMapped).length }} Stripe
              mapping(s)</span
            >
          </div>
          <button class="quiet-action" type="button" @click="revise(template)">
            Create revised version
          </button>
        </li>
      </ol>
    </section>

    <section v-if="data" class="issued-license-admin" aria-labelledby="issued-license-heading">
      <div>
        <p class="section-number">Fulfillment and recovery</p>
        <h2 id="issued-license-heading">Issued licenses</h2>
      </div>
      <ol v-if="data.issued.length">
        <li v-for="license in data.issued" :key="license.id">
          <div>
            <strong>{{ license.trackTitle }} · {{ license.optionLabel }}</strong>
            <span>{{ license.licenseeName }} · {{ license.projectTitle }}</span>
            <span>{{ license.status }} · document {{ license.document_status }}</span>
          </div>
          <button
            v-if="license.document_status === 'failed'"
            class="quiet-action"
            type="button"
            :disabled="retryingId === license.id"
            @click="retryDocument(license.id)"
          >
            {{ retryingId === license.id ? 'Queueing…' : 'Retry document' }}
          </button>
        </li>
      </ol>
      <p v-else>No license has been issued yet.</p>
    </section>

    <p v-if="message" class="form-message" role="status">{{ message }}</p>
    <p v-if="error && error.statusCode !== 401" class="form-message" role="alert">
      Licensing administration is available only to the installation owner.
    </p>
  </div>
</template>
