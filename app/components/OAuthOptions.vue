<script setup lang="ts">
import type { OAuthProvider } from '#shared/schemas/auth'
import { oauthProviderLabels } from '#shared/utils/oauth'

const props = withDefaults(defineProps<{ redirect?: string }>(), { redirect: '/account' })
const { data } = await useFetch('/api/auth/options', { key: 'public-auth-options' })
const pendingProvider = ref<OAuthProvider | null>(null)
const message = ref('')

const providers = computed(() => data.value?.oauthProviders ?? [])

async function begin(provider: OAuthProvider) {
  pendingProvider.value = provider
  message.value = ''
  try {
    const result = await $fetch('/api/auth/oauth', {
      method: 'POST',
      body: { provider, redirect: props.redirect },
    })
    assignSafeDestination(result.url, 'https-or-local')
  } catch {
    message.value = 'Provider sign-in could not be started. Email sign-in remains available.'
    pendingProvider.value = null
  }
}
</script>

<template>
  <section v-if="providers.length" class="oauth-options" aria-labelledby="oauth-options-heading">
    <div class="oauth-options__heading">
      <span aria-hidden="true"></span>
      <p id="oauth-options-heading">Or continue with</p>
      <span aria-hidden="true"></span>
    </div>
    <div class="oauth-options__actions">
      <button
        v-for="provider in providers"
        :key="provider"
        class="text-action"
        type="button"
        :disabled="Boolean(pendingProvider)"
        @click="begin(provider)"
      >
        {{ pendingProvider === provider ? 'Opening…' : oauthProviderLabels[provider] }}
      </button>
    </div>
    <p class="field-help">
      Provider sign-in creates the same customer account. Artist roles are still granted by an
      owner.
    </p>
    <p v-if="message" class="form-message" role="alert">{{ message }}</p>
  </section>
</template>
