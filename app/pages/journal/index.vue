<script setup lang="ts">
import type { EditorialRecord } from '#shared/types/learning'

useSeoMeta({
  title: 'Journal',
  description: 'Essays, announcements, and learning notes from the artist.',
})
const { data, error, status, refresh } = await useFetch<{ posts: EditorialRecord[] }>(
  '/api/editorial',
)
onMounted(refresh)
</script>

<template>
  <div class="page-frame journal-index">
    <header class="page-heading">
      <p class="eyebrow">Journal</p>
      <h1>Notes that remain part of the work.</h1>
      <p>
        Essays, announcements, learning notes, and practical information use the same safe
        structured publishing system.
      </p>
    </header>
    <ServiceState
      v-if="status === 'pending'"
      eyebrow="Journal"
      title="Loading the artist's published notes…"
      message="Essays and announcements are being gathered in publication order."
    />
    <ServiceState
      v-else-if="error"
      eyebrow="Journal unavailable"
      title="The journal service is not responding."
      message="Published drafts remain unchanged. Try again when the service is available."
      retryable
      @retry="refresh"
    />
    <ServiceState
      v-else-if="!data?.posts.length"
      eyebrow="Journal"
      title="No journal entry has been published yet."
      message="Draft writing remains private until the artist publishes it."
    />
    <ol v-else class="journal-list">
      <li v-for="post in data?.posts ?? []" :key="post.id">
        <div>
          <p class="section-number">{{ post.kind.replace('_', ' ') }} · {{ post.publishedOn }}</p>
          <h2>{{ post.title }}</h2>
          <p>{{ post.summary }}</p>
        </div>
        <NuxtLink class="text-action" :to="`/journal/${post.slug}`"
          >Read the complete note</NuxtLink
        >
      </li>
    </ol>
  </div>
</template>
