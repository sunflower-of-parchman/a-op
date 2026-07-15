<script setup lang="ts">
import type { CheckoutIntentResponse } from '#shared/types/commerce'

const route = useRoute()
const id = String(route.params.id)
const { data, error, refresh } = await useFetch<CheckoutIntentResponse>(
  () => `/api/commerce/checkout/${id}`,
)
const confirming = ref(false)
const message = ref('')

if (error.value?.statusCode === 401) {
  await navigateTo(`/sign-in?redirect=${encodeURIComponent(route.fullPath)}`)
}

async function confirm() {
  confirming.value = true
  message.value = ''
  try {
    await $fetch('/api/commerce/checkout/simulate', {
      method: 'POST',
      body: { intentId: id },
    })
    await refresh()
    message.value = 'Simulation complete. Your account access is ready.'
  } catch {
    message.value = 'The local payment simulation could not complete.'
  } finally {
    confirming.value = false
  }
}

useSeoMeta({ title: 'Local checkout simulation' })
</script>

<template>
  <main class="page-frame simulated-checkout">
    <header class="page-heading">
      <p class="eyebrow">Local demonstration</p>
      <h1>{{ data?.product.name ?? 'Checkout simulation' }}</h1>
      <p>
        This screen never charges a card. It exercises the same durable event, order, subscription,
        and entitlement path that verified Stripe webhooks use.
      </p>
    </header>
    <dl v-if="data" class="checkout-facts">
      <div>
        <dt>Provider</dt>
        <dd>Local simulation</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{{ data.intent.status }}</dd>
      </div>
      <div>
        <dt>Offering</dt>
        <dd>{{ data.product.product_type.replaceAll('_', ' ') }}</dd>
      </div>
    </dl>
    <button
      v-if="data?.intent.status === 'open'"
      class="text-action text-action--primary"
      type="button"
      :disabled="confirming"
      @click="confirm"
    >
      {{ confirming ? 'Completing…' : 'Complete simulated payment' }}
    </button>
    <NuxtLink v-else-if="data?.intent.status === 'complete'" class="text-action" to="/account">
      Continue to your account
    </NuxtLink>
    <p v-if="message" class="form-message" role="status">{{ message }}</p>
    <p v-if="error && error.statusCode !== 401" class="form-message" role="alert">
      This checkout could not be found for the current account.
    </p>
  </main>
</template>
