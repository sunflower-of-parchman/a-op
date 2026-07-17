<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { EditorialRecord } from '#shared/types/learning'

const route = useRoute()
const starterMode = useStarterMode()
const { data, error, refresh } = await useFetch<{ post: EditorialRecord }>(
  () => `/api/editorial/${String(route.params.slug)}`,
)
onMounted(refresh)
useSeoMeta({
  title: () =>
    starterMode ? starterLayoutContent.journal.itemTitle : (data.value?.post.title ?? 'Journal'),
  description: () =>
    starterMode ? starterLayoutContent.journal.itemSummary : data.value?.post.summary,
})
</script>

<template>
  <div v-if="data" class="page-frame journal-page">
    <header class="page-heading">
      <h1>{{ starterMode ? starterLayoutContent.journal.itemTitle : data.post.title }}</h1>
      <p>{{ starterMode ? starterLayoutContent.journal.itemSummary : data.post.summary }}</p>
    </header>
    <StructuredSections :sections="data.post.sections" :starter="starterMode" />
  </div>
  <div v-else class="page-frame interior-page">
    <h1>{{ error ? 'Editorial note not found.' : 'Loading note…' }}</h1>
  </div>
</template>
