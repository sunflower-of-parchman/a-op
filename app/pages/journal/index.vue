<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { EditorialRecord } from '#shared/types/learning'

const starterMode = useStarterMode()
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
      <h1>
        {{
          starterMode ? starterLayoutContent.journal.title : 'Notes that remain part of the work.'
        }}
      </h1>
      <p v-if="starterMode">{{ starterLayoutContent.journal.introduction }}</p>
      <p v-else>
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
          <p class="section-number">
            {{
              starterMode
                ? starterLayoutContent.journal.metadata
                : `${post.kind.replace('_', ' ')} · ${post.publishedOn}`
            }}
          </p>
          <h2>{{ starterMode ? starterLayoutContent.journal.itemTitle : post.title }}</h2>
          <p>{{ starterMode ? starterLayoutContent.journal.itemSummary : post.summary }}</p>
        </div>
        <NuxtLink class="text-action" :to="`/journal/${post.slug}`">
          {{ starterMode ? starterLayoutContent.journal.openAction : 'Read the complete note' }}
        </NuxtLink>
      </li>
    </ol>
  </div>
</template>
