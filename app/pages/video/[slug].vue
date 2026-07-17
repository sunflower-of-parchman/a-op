<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { VideoRecord } from '#shared/types/learning'

const route = useRoute()
const starterMode = useStarterMode()
const { data, error } = await useFetch<{ video: VideoRecord }>(
  () => `/api/videos/${String(route.params.slug)}`,
)
useSeoMeta({
  title: () =>
    starterMode ? starterLayoutContent.video.itemTitle : (data.value?.video.title ?? 'Video'),
  description: () =>
    starterMode ? starterLayoutContent.video.itemSummary : data.value?.video.summary,
})
</script>

<template>
  <div v-if="data" class="page-frame video-page">
    <header class="page-heading">
      <h1>{{ starterMode ? starterLayoutContent.video.itemTitle : data.video.title }}</h1>
      <p>{{ starterMode ? starterLayoutContent.video.itemSummary : data.video.summary }}</p>
    </header>
    <VideoExperience :video="data.video" :starter="starterMode" />
  </div>
  <div v-else class="page-frame interior-page">
    <h1>{{ error ? 'Video not found.' : 'Loading video…' }}</h1>
  </div>
</template>
