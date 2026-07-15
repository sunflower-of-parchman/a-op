<script setup lang="ts">
import type { VideoRecord } from '#shared/types/learning'

useSeoMeta({ title: 'Video', description: 'Artist-published video with context and transcripts.' })
const { data } = await useFetch<{ videos: VideoRecord[] }>('/api/videos')
</script>

<template>
  <main class="page-frame video-index">
    <header class="page-heading">
      <p class="eyebrow">Video</p>
      <h1>Watch with the context still attached.</h1>
      <p>
        Every entry carries a description, source credit, and transcript before an external player
        loads.
      </p>
    </header>
    <ol class="video-list">
      <li v-for="video in data?.videos ?? []" :key="video.id">
        <div>
          <p class="section-number">{{ video.provider }}</p>
          <h2>{{ video.title }}</h2>
          <p>{{ video.summary }}</p>
        </div>
        <NuxtLink class="text-action" :to="`/video/${video.slug}`"
          >Open video and transcript</NuxtLink
        >
      </li>
    </ol>
  </main>
</template>
