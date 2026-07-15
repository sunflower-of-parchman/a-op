<script setup lang="ts">
import type { EditorialRecord } from '#shared/types/learning'

const route = useRoute()
const { data, error, refresh } = await useFetch<{ post: EditorialRecord }>(
  () => `/api/editorial/${String(route.params.slug)}`,
)
onMounted(refresh)
useSeoMeta({
  title: () => data.value?.post.title ?? 'Journal',
  description: () => data.value?.post.summary,
})
</script>

<template>
  <main v-if="data" class="page-frame journal-page">
    <header class="page-heading">
      <p class="eyebrow">{{ data.post.kind.replace('_', ' ') }} · {{ data.post.publishedOn }}</p>
      <h1>{{ data.post.title }}</h1>
      <p>{{ data.post.summary }}</p>
    </header>
    <StructuredSections :sections="data.post.sections" />
  </main>
  <main v-else class="page-frame interior-page">
    <p class="eyebrow">Journal</p>
    <h1>{{ error ? 'Editorial note not found.' : 'Loading note…' }}</h1>
  </main>
</template>
