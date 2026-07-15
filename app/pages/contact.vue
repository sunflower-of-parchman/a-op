<script setup lang="ts">
import type { ContactMessageInput } from '#shared/schemas/contact'

const artist = useArtistConfig()
const { data: page } = await useFetch('/api/pages/contact')
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Contact page not found' })

const section = computed(() => page.value?.sections.find((item) => item.type === 'contact'))
useSeoMeta({
  title: page.value.seo.title,
  description: page.value.seo.description,
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

onMounted(() => {
  ready.value = true
})

async function submit() {
  pending.value = true
  result.value = ''
  try {
    await $fetch('/api/contact', { method: 'POST', body: form })
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
      <p class="eyebrow">Contact</p>
      <h1>{{ section?.heading ?? page?.title }}</h1>
      <p>{{ section?.introduction }}</p>
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
        <span>{{ section?.consentLabel }}</span>
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
      <p>{{ artist.identity.contact.bookingNote }}</p>
      <a
        v-if="artist.identity.contact.publicEmail"
        :href="`mailto:${artist.identity.contact.publicEmail}`"
      >
        {{ artist.identity.contact.publicEmail }}
      </a>
      <p v-if="artist.identity.contact.mailingAddress" class="preserve-lines">
        {{ artist.identity.contact.mailingAddress }}
      </p>
      <p class="release-note">
        The local demonstration stores this message and sends no external email.
      </p>
    </div>
  </article>
</template>
