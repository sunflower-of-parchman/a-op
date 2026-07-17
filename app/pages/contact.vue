<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { ContactMessageInput } from '#shared/schemas/contact'

const artist = useArtistConfig()
const starterMode = useStarterMode()
const { data: page } = await useFetch('/api/pages/contact')
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Contact page not found' })

const section = computed(() => page.value?.sections.find((item) => item.type === 'contact'))
useSeoMeta({
  title: starterMode ? 'Contact' : page.value.seo.title,
  description: starterMode ? starterLayoutContent.seo.description : page.value.seo.description,
})

const form = reactive<ContactMessageInput>({
  name: '',
  email: '',
  message: '',
  consent: false,
  company: '',
})
const ready = ref(false)
const pending = ref(false)
const result = ref('')
const { track } = useTelemetry()

onMounted(() => {
  ready.value = true
})

async function submit() {
  pending.value = true
  result.value = ''
  try {
    await $fetch('/api/contact', { method: 'POST', body: form })
    void track('contact_conversion', { resourceType: 'contact', resourceKey: 'contact-form' })
    result.value = 'Your message is stored for the artist.'
    form.name = ''
    form.email = ''
    form.message = ''
    form.consent = false
  } catch {
    result.value = 'The message could not be stored. Please wait and try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <article class="page-frame interior-page contact-page">
    <header class="page-heading">
      <h1>
        {{ starterMode ? starterLayoutContent.contact.title : (section?.heading ?? page?.title) }}
      </h1>
      <p>
        {{ starterMode ? starterLayoutContent.contact.introduction : section?.introduction }}
      </p>
    </header>

    <form class="account-form contact-form" @submit.prevent="submit">
      <label>
        <span>Name</span>
        <input v-model="form.name" name="name" autocomplete="name" required />
      </label>
      <label>
        <span>Email</span>
        <input v-model="form.email" name="email" type="email" autocomplete="email" required />
      </label>
      <label>
        <span>Message</span>
        <textarea v-model="form.message" name="message" rows="8" minlength="10" required />
      </label>
      <label class="consent-control">
        <input v-model="form.consent" name="consent" type="checkbox" required />
        <span>{{
          starterMode ? starterLayoutContent.contact.consent : section?.consentLabel
        }}</span>
      </label>
      <label class="honeypot" aria-hidden="true">
        <span>Company</span>
        <input v-model="form.company" name="company" tabindex="-1" autocomplete="off" />
      </label>
      <button class="text-action text-action--primary" type="submit" :disabled="!ready || pending">
        {{ pending ? 'Storing message…' : 'Send message' }}
      </button>
      <p v-if="result" class="form-message" role="status">{{ result }}</p>
    </form>

    <div class="contact-details">
      <p>
        {{
          starterMode
            ? starterLayoutContent.contact.bookingNote
            : artist.identity.contact.bookingNote
        }}
      </p>
      <span v-if="starterMode">{{ starterLayoutContent.contact.email }}</span>
      <a
        v-else-if="artist.identity.contact.publicEmail"
        :href="`mailto:${artist.identity.contact.publicEmail}`"
      >
        {{ artist.identity.contact.publicEmail }}
      </a>
      <p v-if="starterMode" class="preserve-lines">
        {{ starterLayoutContent.contact.address }}
      </p>
      <p v-else-if="artist.identity.contact.mailingAddress" class="preserve-lines">
        {{ artist.identity.contact.mailingAddress }}
      </p>
      <p class="release-note">
        {{
          starterMode
            ? starterLayoutContent.contact.localNote
            : 'The local demonstration stores this message and sends no external email.'
        }}
      </p>
    </div>
  </article>
</template>
