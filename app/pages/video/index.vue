<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { VideoRecord } from '#shared/types/learning'

const starterMode = useStarterMode()
useSeoMeta({ title: 'Video', description: 'Artist-published video with context and transcripts.' })
const { data, error, status, refresh } = await useFetch<{ videos: VideoRecord[] }>('/api/videos')
</script>

<template>
  <div class="page-frame video-index">
    <header class="page-heading">
      <h1>
        {{
          starterMode ? starterLayoutContent.video.title : 'Watch with the context still attached.'
        }}
      </h1>
      <p v-if="starterMode">{{ starterLayoutContent.video.introduction }}</p>
      <p v-else>
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
          <p class="section-number">
            {{ starterMode ? starterLayoutContent.video.provider : video.provider }}
          </p>
          <h2>{{ starterMode ? starterLayoutContent.video.itemTitle : video.title }}</h2>
          <p>{{ starterMode ? starterLayoutContent.video.itemSummary : video.summary }}</p>
        </div>
        <NuxtLink class="text-action" :to="`/video/${video.slug}`">
          {{ starterMode ? starterLayoutContent.video.openAction : 'Open video and transcript' }}
        </NuxtLink>
      </li>
    </ol>
  </div>
</template>
