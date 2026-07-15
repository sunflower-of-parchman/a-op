<script setup lang="ts">
import type { VideoRecord } from '#shared/types/learning'

useSeoMeta({ title: 'Video', description: 'Artist-published video with context and transcripts.' })
const { data, error, status, refresh } = await useFetch<{ videos: VideoRecord[] }>('/api/videos')
</script>

<template>
  <div class="page-frame video-index">
    <header class="page-heading">
      <p class="eyebrow">Video</p>
      <h1>Watch with the context still attached.</h1>
      <p>
        Every entry carries a description, source credit, and transcript before an external player
        loads.
      </p>
    </header>
    <ServiceState
      v-if="status === 'pending'"
      eyebrow="Video"
      title="Loading published video…"
      message="Descriptions, credits, and transcripts are being gathered before any player loads."
    />
    <ServiceState
      v-else-if="error"
      eyebrow="Video unavailable"
      title="The video index is not responding."
      message="No external player has been loaded. Try again when the service is available."
      retryable
      @retry="refresh"
    />
    <ServiceState
      v-else-if="!data?.videos.length"
      eyebrow="Video"
      title="No video has been published yet."
      message="Draft video and transcripts remain private until the artist publishes them."
    />
    <ol v-else class="video-list">
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
  </div>
</template>
