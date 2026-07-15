<script setup lang="ts">
useSeoMeta({ title: 'Commerce administration' })

const { data, error, refresh } = await useFetch('/api/admin/commerce')
const savingId = ref('')
const replayingId = ref('')
const message = ref('')

if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/commerce')

async function save(product: NonNullable<typeof data.value>['products'][number]) {
  savingId.value = product.id
  message.value = ''
  try {
    await $fetch(`/api/admin/commerce/products/${product.id}`, {
      method: 'PUT',
      body: {
        name: product.name,
        description: product.description,
        state: product.state,
        purchaseMode: product.purchase_mode,
        externalUrl: product.external_url ?? '',
        currency: product.price?.currency ?? 'USD',
        amountMinor: product.price?.amount_minor ?? 0,
        billingInterval: product.price?.billing_interval ?? 'one_time',
        externalProductId: product.price?.external_product_id ?? '',
        externalPriceId: product.price?.external_price_id ?? '',
      },
    })
    await refresh()
    message.value = `${product.name} saved.`
  } catch {
    message.value = 'The offering could not be saved. Check its mode, interval, URL, and mapping.'
  } finally {
    savingId.value = ''
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

async function replayWebhook(eventId: string) {
  replayingId.value = eventId
  message.value = ''
  try {
    await $fetch(`/api/admin/commerce/webhooks/${eventId}/replay`, { method: 'POST' })
    await refresh()
    message.value = 'The verified Stripe event was replayed successfully.'
  } catch {
    message.value = 'The event is still unresolved. Its retry count has been updated.'
    await refresh()
  } finally {
    replayingId.value = ''
  }
}
</script>

<template>
  <main class="page-frame admin-frame commerce-admin">
    <header class="page-heading">
      <p class="eyebrow">Commerce and memberships</p>
      <h1>The artist defines the offer. Providers move the money.</h1>
      <p>
        Product names, access targets, prices, and publication remain in this database. Stripe IDs
        map an approved offering to Checkout and never replace that editorial record.
      </p>
    </header>

    <div v-if="data" class="commerce-editor-list">
      <form v-for="product in data.products" :key="product.id" @submit.prevent="save(product)">
        <header>
          <div>
            <p class="section-number">{{ product.product_type.replaceAll('_', ' ') }}</p>
            <h2>{{ product.name }}</h2>
          </div>
          <p>
            {{ product.price?.external_price_id ? 'Stripe mapped' : 'No Stripe price mapping' }}
          </p>
        </header>
        <div class="admin-form-grid">
          <label><span>Name</span><input v-model="product.name" required maxlength="200" /></label>
          <label>
            <span>Publication</span>
            <select v-model="product.state">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            <span>Purchase mode</span>
            <select v-model="product.purchase_mode">
              <option value="stripe">Stripe checkout</option>
              <option value="free">Free claim</option>
              <option value="external">External artist link</option>
            </select>
          </label>
          <label v-if="product.purchase_mode === 'external'">
            <span>External HTTPS URL</span>
            <input v-model="product.external_url" type="url" required />
          </label>
          <template v-if="product.price && product.purchase_mode !== 'external'">
            <label>
              <span>Currency</span>
              <input v-model="product.price.currency" maxlength="3" required />
            </label>
            <label>
              <span>Amount in minor units</span>
              <input v-model.number="product.price.amount_minor" type="number" min="0" required />
            </label>
            <label>
              <span>Billing interval</span>
              <select v-model="product.price.billing_interval">
                <option value="one_time">One time</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </label>
          </template>
        </div>
        <label>
          <span>Description</span>
          <textarea v-model="product.description" rows="3" maxlength="2000" />
        </label>
        <div
          v-if="product.price && product.purchase_mode === 'stripe'"
          class="stripe-mapping-fields"
        >
          <label>
            <span>Stripe product ID</span>
            <input v-model="product.price.external_product_id" autocomplete="off" />
          </label>
          <label>
            <span>Stripe price ID</span>
            <input v-model="product.price.external_price_id" autocomplete="off" />
          </label>
        </div>
        <button class="text-action" type="submit" :disabled="savingId === product.id">
          {{ savingId === product.id ? 'Saving…' : 'Save offering' }}
        </button>
      </form>
    </div>

    <section v-if="data" class="commerce-operations" aria-labelledby="operations-heading">
      <div>
        <p class="section-number">Operational record</p>
        <h2 id="operations-heading">Fulfillment remains inspectable.</h2>
      </div>
      <dl>
        <div>
          <dt>Recent verified or simulated events</dt>
          <dd>{{ data.events.length }}</dd>
        </div>
        <div>
          <dt>Recent orders</dt>
          <dd>{{ data.orders.length }}</dd>
        </div>
        <div>
          <dt>Recent subscriptions</dt>
          <dd>{{ data.subscriptions.length }}</dd>
        </div>
        <div>
          <dt>Unresolved webhook failures</dt>
          <dd>{{ data.failures.filter(({ status }) => status === 'unresolved').length }}</dd>
        </div>
      </dl>
      <ol v-if="data.events.length" class="commerce-event-list">
        <li v-for="eventRow in data.events.slice(0, 8)" :key="eventRow.id">
          <span>{{ eventRow.provider }} · {{ eventRow.status }}</span>
          <span>{{ eventRow.currency }} {{ (eventRow.amount_minor / 100).toFixed(2) }}</span>
          <time :datetime="eventRow.received_at">{{ formatDate(eventRow.received_at) }}</time>
        </li>
      </ol>
      <ol
        v-if="data.failures.some(({ status }) => status === 'unresolved')"
        class="webhook-failure-list"
      >
        <li
          v-for="failure in data.failures.filter(({ status }) => status === 'unresolved')"
          :key="failure.id"
        >
          <div>
            <strong>{{ failure.event_type }}</strong>
            <span>{{ failure.error_code }} · {{ failure.attempts }} attempt(s)</span>
          </div>
          <time :datetime="failure.last_failed_at">{{ formatDate(failure.last_failed_at) }}</time>
          <button
            class="quiet-action"
            type="button"
            :disabled="replayingId === failure.provider_event_id"
            @click="replayWebhook(failure.provider_event_id)"
          >
            {{ replayingId === failure.provider_event_id ? 'Replaying…' : 'Replay from Stripe' }}
          </button>
        </li>
      </ol>
    </section>

    <p v-if="message" class="form-message" role="status">{{ message }}</p>
    <p v-if="error && error.statusCode !== 401" class="form-message" role="alert">
      Commerce administration is available only to the installation owner.
    </p>
  </main>
</template>
