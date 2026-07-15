<script setup lang="ts">
import type { LicensingResponse, PublishedLicenseOption } from '#shared/types/licensing'

useSeoMeta({
  title: 'Music licensing',
  description: 'Artist-approved music uses with visible terms, prices, and protected documents.',
})

const route = useRoute()
const { data } = await useFetch<LicensingResponse>('/api/licensing')
const { data: session } = await useFetch('/api/auth/session')
const busyId = ref('')
const message = ref('')
const details = reactive<
  Record<string, { licenseeName: string; projectTitle: string; projectDescription: string }>
>({})

const visibleTemplates = computed(() => {
  const track = typeof route.query.track === 'string' ? route.query.track : ''
  if (!track) return data.value?.templates ?? []
  return data.value?.templates.filter((template) => template.track.slug === track) ?? []
})

function formFor(offerId: string) {
  details[offerId] ??= { licenseeName: '', projectTitle: '', projectDescription: '' }
  return details[offerId]
}

function price(option: PublishedLicenseOption) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: option.currency,
  }).format(option.amountMinor / 100)
}

async function beginCheckout(option: PublishedLicenseOption) {
  if (!session.value?.authenticated) {
    await navigateTo(`/sign-in?redirect=${encodeURIComponent(route.fullPath)}`)
    return
  }
  busyId.value = option.offerId
  message.value = ''
  try {
    const result = await $fetch('/api/licensing/checkout', {
      method: 'POST',
      body: { offerId: option.offerId, ...formFor(option.offerId), returnPath: '/account' },
    })
    if (result.url.startsWith('http')) window.location.assign(result.url)
    else await navigateTo(result.url)
  } catch {
    message.value = 'This license could not be prepared. Review the project details and try again.'
  } finally {
    busyId.value = ''
  }
}
</script>

<template>
  <main class="page-frame licensing-page">
    <header class="page-heading licensing-heading">
      <p class="eyebrow">Music licensing</p>
      <h1>Choose a use whose boundaries are already clear.</h1>
      <p>
        Every option below was written and priced by the artist. The selected language is frozen
        before checkout and becomes the issued document after verified payment.
      </p>
    </header>

    <section
      v-for="template in visibleTemplates"
      :key="template.id"
      class="license-template"
      :aria-labelledby="`license-${template.id}`"
    >
      <header>
        <p class="section-number">{{ template.track.title }}</p>
        <h2 :id="`license-${template.id}`">{{ template.name }}</h2>
        <p>{{ template.summary }}</p>
        <p>{{ template.version.introduction }}</p>
      </header>

      <article v-for="option in template.options" :key="option.offerId" class="license-option">
        <div class="license-option__terms">
          <header>
            <div>
              <p class="section-number">{{ option.usageCategory }}</p>
              <h3>{{ option.label }}</h3>
            </div>
            <p class="license-price">{{ price(option) }}</p>
          </header>
          <p>{{ option.description }}</p>
          <dl>
            <div>
              <dt>Allowed media</dt>
              <dd>{{ option.allowedMedia.join(', ') }}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{{ option.audienceLabel }}</dd>
            </div>
            <div>
              <dt>Distribution</dt>
              <dd>{{ option.distributionLabel }}</dd>
            </div>
            <div>
              <dt>Term</dt>
              <dd>{{ option.termMonths }} months</dd>
            </div>
            <div>
              <dt>Territory</dt>
              <dd>{{ option.territory }}</dd>
            </div>
            <div>
              <dt>Exclusivity</dt>
              <dd>Non-exclusive</dd>
            </div>
            <div>
              <dt>Attribution</dt>
              <dd>{{ option.attributionRequired ? option.attributionText : 'Not required' }}</dd>
            </div>
          </dl>
        </div>
        <form class="license-project-form" @submit.prevent="beginCheckout(option)">
          <label>
            <span>Licensee or organization name</span>
            <input v-model="formFor(option.offerId).licenseeName" required maxlength="200" />
          </label>
          <label>
            <span>Project title</span>
            <input v-model="formFor(option.offerId).projectTitle" required maxlength="240" />
          </label>
          <label>
            <span>Describe this exact project</span>
            <textarea
              v-model="formFor(option.offerId).projectDescription"
              required
              minlength="10"
              maxlength="3000"
              rows="4"
            />
          </label>
          <button class="text-action" type="submit" :disabled="busyId === option.offerId">
            {{ busyId === option.offerId ? 'Freezing terms…' : `License for ${price(option)}` }}
          </button>
        </form>
      </article>

      <details class="license-general-terms">
        <summary>Read the general terms and document notice</summary>
        <section v-for="term in template.version.generalTerms" :key="term.heading">
          <h3>{{ term.heading }}</h3>
          <p>{{ term.body }}</p>
        </section>
        <p>{{ template.version.disclaimer }}</p>
      </details>
    </section>

    <section v-if="!visibleTemplates.length" class="plain-section" aria-labelledby="custom-use">
      <p class="section-number">Artist authority</p>
      <h2 id="custom-use">This track does not have a self-service license yet.</h2>
      <p>The artist can still review the intended project directly.</p>
    </section>

    <section class="licensing-inquiry" aria-labelledby="licensing-inquiry-heading">
      <p class="section-number">Outside these boundaries</p>
      <h2 id="licensing-inquiry-heading">
        Unusual, broadcast, commercial, or exclusive uses begin with an inquiry.
      </h2>
      <p>No price or legal term is invented for a use the artist has not published.</p>
      <NuxtLink class="text-action" :to="data?.inquiryPath ?? '/contact'"
        >Describe the project</NuxtLink
      >
    </section>

    <p v-if="message" class="form-message" role="alert">{{ message }}</p>
  </main>
</template>
