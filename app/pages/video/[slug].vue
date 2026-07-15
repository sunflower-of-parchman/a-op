<script setup lang="ts">
import type { VideoRecord } from '#shared/types/learning'

const route = useRoute()
const { data, error } = await useFetch<{ video: VideoRecord }>(
  () => `/api/videos/${String(route.params.slug)}`,
)
useSeoMeta({
  title: () => data.value?.video.title ?? 'Video',
  description: () => data.value?.video.summary,
})
</script>

<template>
  <main v-if="data" class="page-frame video-page">
    <header class="page-heading">
      <p class="eyebrow">Video</p>
      <h1>{{ data.video.title }}</h1>
      <p>{{ data.video.summary }}</p>
    </header>
    <VideoExperience :video="data.video" />
  </main>
  <main v-else class="page-frame interior-page">
    <p class="eyebrow">Video</p>
    <h1>{{ error ? 'Video not found.' : 'Loading video…' }}</h1>
  </main>
</template>
