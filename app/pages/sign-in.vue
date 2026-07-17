<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { SignInInput } from '#shared/schemas/auth'

useSeoMeta({ title: 'Sign in' })

const route = useRoute()
const starterMode = useStarterMode()
const credentials = reactive<SignInInput>({ email: '', password: '' })
const pending = ref(false)
const message = ref(route.query.oauth === 'failed' ? 'Provider sign-in was not completed.' : '')
const ready = ref(false)

onMounted(() => {
  ready.value = true
})

async function signIn() {
  pending.value = true
  message.value = ''

  try {
    await $fetch('/api/auth/sign-in', { method: 'POST', body: credentials })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/account'
    await navigateTo(resolveSafeInternalPath(redirect, '/account'))
  } catch {
    message.value = 'That email and password were not accepted.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="page-frame account-frame">
    <header class="page-heading">
      <h1>
        {{ starterMode ? starterLayoutContent.auth.signInTitle : 'Sign in to your place here.' }}
      </h1>
      <p>
        {{
          starterMode
            ? starterLayoutContent.auth.signInIntroduction
            : 'Purchases, licenses, memberships, learning, and artist administration use one account.'
        }}
      </p>
    </header>

    <form class="account-form" @submit.prevent="signIn">
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
          autocomplete="current-password"
          minlength="8"
          required
        />
      </label>
      <p v-if="message" class="form-message" role="alert">{{ message }}</p>
      <button class="text-action text-action--primary" type="submit" :disabled="!ready || pending">
        {{ pending ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <OAuthOptions
      :redirect="typeof route.query.redirect === 'string' ? route.query.redirect : '/account'"
    />

    <p class="account-alternative">
      New here? <NuxtLink to="/sign-up">Create an account</NuxtLink>.
    </p>
  </div>
</template>
