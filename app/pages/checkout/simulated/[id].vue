<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { CheckoutIntentResponse } from '#shared/types/commerce'

const route = useRoute()
const starterMode = useStarterMode()
const id = String(route.params.id)
const { data, error, refresh } = await useFetch<CheckoutIntentResponse>(
  () => `/api/commerce/checkout/${id}`,
)
const hydrated = ref(false)
const confirming = ref(false)
const message = ref('')
const { track } = useTelemetry()

onMounted(() => {
  hydrated.value = true
})

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
    void track('checkout_complete', {
      resourceType: 'product',
      resourceKey: data.value?.product.product_type.replaceAll('_', '-') ?? 'artist-offering',
    })
    if (data.value?.product.product_type === 'license') {
      void track('license_complete', {
        resourceType: 'license_offer',
        resourceKey: 'issued-license',
      })
    }
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
  <div class="page-frame simulated-checkout">
    <header class="page-heading">
      <h1>
        {{
          starterMode
            ? starterLayoutContent.checkout.simulationTitle
            : (data?.product.name ?? 'Checkout simulation')
        }}
      </h1>
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
      :disabled="!hydrated || confirming"
      @click="confirm"
    >
      {{
        !hydrated
          ? 'Preparing checkout…'
          : confirming
            ? 'Completing…'
            : 'Complete simulated payment'
      }}
    </button>
    <NuxtLink v-else-if="data?.intent.status === 'complete'" class="text-action" to="/account">
      Continue to your account
    </NuxtLink>
    <p v-if="message" class="form-message" role="status">{{ message }}</p>
    <p v-if="error && error.statusCode !== 401" class="form-message" role="alert">
      This checkout could not be found for the current account.
    </p>
  </div>
</template>
