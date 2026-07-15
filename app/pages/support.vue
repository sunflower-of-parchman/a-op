<script setup lang="ts">
import type { CommerceCatalogResponse, CommerceProduct } from '#shared/types/commerce'

useSeoMeta({
  title: 'Support the work',
  description: 'Downloads, memberships, free resources, and artist-directed ways to participate.',
})

const { data: catalog } = await useFetch<CommerceCatalogResponse>('/api/commerce/products')
const { data: session } = await useFetch('/api/auth/session')
const busyId = ref('')
const message = ref('')
const { track } = useTelemetry()

function priceLabel(product: CommerceProduct) {
  if (product.purchaseMode === 'external') return 'Continue with the artist'
  if (!product.price) return 'Unavailable'
  if (product.price.amountMinor === 0) return 'Free'
  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: product.price.currency,
  }).format(product.price.amountMinor / 100)
  if (product.price.billingInterval === 'month') return `${amount} / month`
  if (product.price.billingInterval === 'year') return `${amount} / year`
  return `${amount} one time`
}

function actionLabel(product: CommerceProduct) {
  if (product.purchaseMode === 'free') return 'Claim free access'
  if (product.productType === 'membership') return 'Join the membership'
  return 'Purchase securely'
}

async function beginCheckout(product: CommerceProduct) {
  void track('product_interest', { resourceType: 'product', resourceKey: product.slug })
  if (!session.value?.authenticated) {
    await navigateTo('/sign-in?redirect=/support')
    return
  }
  busyId.value = product.id
  message.value = ''
  try {
    void track('checkout_start', { resourceType: 'product', resourceKey: product.slug })
    const result = await $fetch('/api/commerce/checkout', {
      method: 'POST',
      body: { productId: product.id, returnPath: '/account' },
    })
    if (!result.url) throw new Error('Checkout did not return a destination.')
    if (result.url.startsWith('http')) window.location.assign(result.url)
    else await navigateTo(result.url)
  } catch {
    message.value = 'Checkout is not available for this offering yet.'
  } finally {
    busyId.value = ''
  }
}

function recordExternalInterest(product: CommerceProduct) {
  void track('product_interest', { resourceType: 'product', resourceKey: product.slug })
}
</script>

<template>
  <main class="page-frame support-page">
    <header class="page-heading support-heading">
      <p class="eyebrow">Direct support</p>
      <h1>Choose what the relationship makes possible.</h1>
      <p>
        The artist defines every offering here. Purchases, free access, and membership all resolve
        through the same account-owned access record.
      </p>
    </header>

    <div v-if="catalog" class="offering-list">
      <article v-for="(product, index) in catalog.products" :key="product.id">
        <p class="section-number">{{ String(index + 1).padStart(2, '0') }}</p>
        <div class="offering-copy">
          <h2>{{ product.name }}</h2>
          <p>{{ product.description }}</p>
        </div>
        <p class="offering-price">{{ priceLabel(product) }}</p>
        <a
          v-if="product.purchaseMode === 'external' && product.externalUrl"
          class="text-action"
          :href="product.externalUrl"
          rel="noopener noreferrer"
          @click="recordExternalInterest(product)"
        >
          Visit artist offering
        </a>
        <button
          v-else
          class="text-action"
          type="button"
          :disabled="busyId === product.id || !product.price"
          @click="beginCheckout(product)"
        >
          {{ busyId === product.id ? 'Preparing…' : actionLabel(product) }}
        </button>
      </article>
    </div>

    <p v-if="catalog?.simulationAvailable && !catalog.stripeConfigured" class="support-note">
      This local demonstration uses a clearly labeled payment simulation. A connected installation
      redirects mapped products to Stripe Checkout in the artist's own account.
    </p>
    <p v-if="message" class="form-message" role="alert">{{ message }}</p>
  </main>
</template>
