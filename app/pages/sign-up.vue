<script setup lang="ts">
import type { SignUpInput } from '#shared/schemas/auth'

useSeoMeta({ title: 'Create an account' })

const credentials = reactive<SignUpInput>({ displayName: '', email: '', password: '' })
const pending = ref(false)
const message = ref('')
const ready = ref(false)

onMounted(() => {
  ready.value = true
})

async function signUp() {
  pending.value = true
  message.value = ''

  try {
    const result = await $fetch('/api/auth/sign-up', { method: 'POST', body: credentials })
    if (result.confirmationRequired) {
      message.value = 'Check your email to confirm the account, then sign in.'
    } else {
      await navigateTo('/account')
    }
  } catch {
    message.value = 'The account could not be created. Check each field and try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="page-frame account-frame">
    <header class="page-heading">
      <p class="eyebrow">A direct relationship</p>
      <h1>Create your listener account.</h1>
      <p>Your account begins as a customer. Artist roles are granted separately by an owner.</p>
    </header>

    <form class="account-form" @submit.prevent="signUp">
      <label>
        <span>Name</span>
        <input v-model="credentials.displayName" name="name" autocomplete="name" required />
      </label>
      <label>
        <span>Email</span>
        <input
          v-model="credentials.email"
          name="email"
          type="email"
          autocomplete="email"
          required
        />
      </label>
      <label>
        <span>Password</span>
        <input
          v-model="credentials.password"
          name="password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          required
        />
      </label>
      <p class="field-help">Use at least eight characters.</p>
      <p v-if="message" class="form-message" role="status">{{ message }}</p>
      <button class="text-action text-action--primary" type="submit" :disabled="!ready || pending">
        {{ pending ? 'Creating account…' : 'Create account' }}
      </button>
    </form>

    <OAuthOptions />

    <p class="account-alternative">
      Already registered? <NuxtLink to="/sign-in">Sign in</NuxtLink>.
    </p>
  </div>
</template>
