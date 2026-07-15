<script setup lang="ts">
import type { CheckoutIntentResponse } from '#shared/types/commerce'

const route = useRoute()
const intentId = computed(() => String(route.query.intent ?? ''))
const { data, refresh } = await useFetch<CheckoutIntentResponse>(
  () => `/api/commerce/checkout/${intentId.value}`,
)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  if (!intentId.value || route.query.canceled) return
  timer = setInterval(async () => {
    await refresh()
    if (data.value?.intent.status !== 'open' && timer) {
      clearInterval(timer)
    }
  }, 1000)
})
onBeforeUnmount(() => timer && clearInterval(timer))

useSeoMeta({ title: 'Checkout status' })
</script>

<template>
  <main class="page-frame interior-page">
    <p class="eyebrow">Checkout status</p>
    <h1 v-if="route.query.canceled">Checkout stopped before completion.</h1>
    <h1 v-else-if="data?.intent.status === 'complete'">Your access is ready.</h1>
    <h1 v-else>Waiting for verified payment confirmation.</h1>
    <p>
      This page reports server state only. Access is granted by a verified event, never by arriving
      at this return URL.
    </p>
    <NuxtLink class="text-action" to="/account">Open your account</NuxtLink>
  </main>
</template>
