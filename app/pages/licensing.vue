<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { LicensingResponse, PublishedLicenseOption } from '#shared/types/licensing'

const starterMode = useStarterMode()
useSeoMeta({
  title: 'Music licensing',
  description: 'Artist-approved music uses with visible terms, prices, and protected documents.',
})

const route = useRoute()
const { data, error, status, refresh } = await useFetch<LicensingResponse>('/api/licensing')
const { data: session } = await useFetch('/api/auth/session')
const busyId = ref('')
const message = ref('')
const { track } = useTelemetry()
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
  void track('license_interest', {
    resourceType: 'license_offer',
    resourceKey: option.offerId.startsWith('10000000-')
      ? 'demonstration-license'
      : 'artist-license',
  })
  if (!session.value?.authenticated) {
    await navigateTo(`/sign-in?redirect=${encodeURIComponent(route.fullPath)}`)
    return
  }
  busyId.value = option.offerId
  message.value = ''
  try {
    void track('checkout_start', {
      resourceType: 'license_offer',
      resourceKey: option.offerId.startsWith('10000000-')
        ? 'demonstration-license'
        : 'artist-license',
    })
    const result = await $fetch('/api/licensing/checkout', {
      method: 'POST',
      body: { offerId: option.offerId, ...formFor(option.offerId), returnPath: '/account' },
    })
    if (result.provider === 'simulation') assignSafeDestination(result.url, 'same-origin')
    else assignSafeDestination(result.url, 'stripe-checkout')
  } catch {
    message.value = 'This license could not be prepared. Review the project details and try again.'
  } finally {
    busyId.value = ''
  }
}
</script>

<template>
  <div class="page-frame licensing-page">
    <header class="page-heading licensing-heading">
      <p class="eyebrow">
        {{ starterMode ? starterLayoutContent.licensing.eyebrow : 'Music licensing' }}
      </p>
      <h1>
        {{
          starterMode
            ? starterLayoutContent.licensing.title
            : 'Choose a use whose boundaries are already clear.'
        }}
      </h1>
      <p v-if="starterMode">{{ starterLayoutContent.licensing.introduction }}</p>
      <p v-else>
        Every option below was written and priced by the artist. The selected language is frozen
        before checkout and becomes the issued document after verified payment.
      </p>
    </header>

    <ServiceState
      v-if="status === 'pending'"
      eyebrow="Music licensing"
      title="Loading artist-approved uses…"
      message="Published terms and prices are being gathered before any project form is shown."
    />
    <ServiceState
      v-else-if="error"
      eyebrow="Licensing unavailable"
      title="The licensing service is not responding."
      message="No terms have been frozen and no checkout has started. Try again when the service is available."
      retryable
      @retry="refresh"
    />

    <section
      v-for="template in visibleTemplates"
      :key="template.id"
      class="license-template"
      :aria-labelledby="`license-${template.id}`"
    >
      <header>
        <p class="section-number">
          {{ starterMode ? starterLayoutContent.licensing.trackTitle : template.track.title }}
        </p>
        <h2 :id="`license-${template.id}`">
          {{ starterMode ? starterLayoutContent.licensing.templateTitle : template.name }}
        </h2>
        <p>
          {{ starterMode ? starterLayoutContent.licensing.templateSummary : template.summary }}
        </p>
        <p>
          {{
            starterMode
              ? starterLayoutContent.licensing.templateIntroduction
              : template.version.introduction
          }}
        </p>
      </header>

      <article v-for="option in template.options" :key="option.offerId" class="license-option">
        <div class="license-option__terms">
          <header>
            <div>
              <p class="section-number">
                {{ starterMode ? starterLayoutContent.licensing.category : option.usageCategory }}
              </p>
              <h3>
                {{ starterMode ? starterLayoutContent.licensing.optionTitle : option.label }}
              </h3>
            </div>
            <p class="license-price">
              {{ starterMode ? starterLayoutContent.licensing.price : price(option) }}
            </p>
          </header>
          <p>
            {{
              starterMode ? starterLayoutContent.licensing.optionDescription : option.description
            }}
          </p>
          <dl>
            <div>
              <dt>Allowed media</dt>
              <dd>
                {{
                  starterMode
                    ? starterLayoutContent.licensing.termValue
                    : option.allowedMedia.join(', ')
                }}
              </dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>
                {{ starterMode ? starterLayoutContent.licensing.termValue : option.audienceLabel }}
              </dd>
            </div>
            <div>
              <dt>Distribution</dt>
              <dd>
                {{
                  starterMode ? starterLayoutContent.licensing.termValue : option.distributionLabel
                }}
              </dd>
            </div>
            <div>
              <dt>Term</dt>
              <dd>
                {{
                  starterMode
                    ? starterLayoutContent.licensing.termValue
                    : `${option.termMonths} months`
                }}
              </dd>
            </div>
            <div>
              <dt>Territory</dt>
              <dd>
                {{ starterMode ? starterLayoutContent.licensing.termValue : option.territory }}
              </dd>
            </div>
            <div>
              <dt>Exclusivity</dt>
              <dd>
                {{ starterMode ? starterLayoutContent.licensing.termValue : 'Non-exclusive' }}
              </dd>
            </div>
            <div>
              <dt>Attribution</dt>
              <dd>
                {{
                  starterMode
                    ? starterLayoutContent.licensing.termValue
                    : option.attributionRequired
                      ? option.attributionText
                      : 'Not required'
                }}
              </dd>
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
            {{
              busyId === option.offerId
                ? 'Freezing terms…'
                : starterMode
                  ? starterLayoutContent.licensing.checkoutAction
                  : `License for ${price(option)}`
            }}
          </button>
        </form>
      </article>

      <details class="license-general-terms">
        <summary>
          {{
            starterMode
              ? starterLayoutContent.licensing.generalTerms
              : 'Read the general terms and document notice'
          }}
        </summary>
        <section v-for="term in template.version.generalTerms" :key="term.heading">
          <h3>{{ starterMode ? starterLayoutContent.licensing.termHeading : term.heading }}</h3>
          <p>{{ starterMode ? starterLayoutContent.licensing.termBody : term.body }}</p>
        </section>
        <p>
          {{
            starterMode ? starterLayoutContent.licensing.disclaimer : template.version.disclaimer
          }}
        </p>
      </details>
    </section>

    <section v-if="!visibleTemplates.length" class="plain-section" aria-labelledby="custom-use">
      <p class="section-number">
        {{ starterMode ? starterLayoutContent.licensing.inquiryLabel : 'Artist authority' }}
      </p>
      <h2 id="custom-use">
        {{
          starterMode
            ? starterLayoutContent.licensing.inquiryTitle
            : 'This track does not have a self-service license yet.'
        }}
      </h2>
      <p>
        {{
          starterMode
            ? starterLayoutContent.licensing.inquiryText
            : 'The artist can still review the intended project directly.'
        }}
      </p>
    </section>

    <section class="licensing-inquiry" aria-labelledby="licensing-inquiry-heading">
      <p class="section-number">
        {{ starterMode ? starterLayoutContent.licensing.inquiryLabel : 'Outside these boundaries' }}
      </p>
      <h2 id="licensing-inquiry-heading">
        {{
          starterMode
            ? starterLayoutContent.licensing.inquiryTitle
            : 'Unusual, broadcast, commercial, or exclusive uses begin with an inquiry.'
        }}
      </h2>
      <p>
        {{
          starterMode
            ? starterLayoutContent.licensing.inquiryText
            : 'No price or legal term is invented for a use the artist has not published.'
        }}
      </p>
      <NuxtLink class="text-action" :to="data?.inquiryPath ?? '/contact'">
        {{ starterMode ? starterLayoutContent.licensing.inquiryAction : 'Describe the project' }}
      </NuxtLink>
    </section>

    <p v-if="message" class="form-message" role="alert">{{ message }}</p>
  </div>
</template>
