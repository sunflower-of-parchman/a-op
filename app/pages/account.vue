<script setup lang="ts">
useSeoMeta({ title: 'Account' })

const { data: session, refresh } = await useFetch('/api/auth/session')
const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  await refresh()
  signingOut.value = false
}
</script>

<template>
  <div class="page-frame account-frame">
    <header class="page-heading">
      <p class="eyebrow">Account</p>
      <h1 v-if="session?.authenticated">Your relationship with the artist.</h1>
      <h1 v-else>Keep what belongs to you.</h1>
      <p v-if="session?.authenticated">
        Signed in as {{ session.user.email }}. Orders, licenses, memberships, downloads, and
        learning progress will gather here.
      </p>
      <p v-else>
        Sign in to reach protected downloads and the customer history attached to your account.
      </p>
    </header>

    <div v-if="session?.authenticated" class="account-actions">
      <NuxtLink
        v-if="session.roles.includes('owner') || session.roles.includes('editor')"
        class="text-action"
        to="/admin"
      >
        Open artist administration
      </NuxtLink>
      <button class="text-action" type="button" :disabled="signingOut" @click="signOut">
        {{ signingOut ? 'Signing out…' : 'Sign out' }}
      </button>
    </div>
    <div v-else class="account-actions">
      <NuxtLink class="text-action text-action--primary" to="/sign-in">Sign in</NuxtLink>
      <NuxtLink class="text-action" to="/sign-up">Create an account</NuxtLink>
    </div>
  </div>
</template>
