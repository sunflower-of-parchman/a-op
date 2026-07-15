<script setup lang="ts">
import type { EditorialRecord } from '#shared/types/learning'

useSeoMeta({
  title: 'Journal',
  description: 'Essays, announcements, and learning notes from the artist.',
})
const { data, refresh } = await useFetch<{ posts: EditorialRecord[] }>('/api/editorial')
onMounted(refresh)
</script>

<template>
  <main class="page-frame journal-index">
    <header class="page-heading">
      <p class="eyebrow">Journal</p>
      <h1>Notes that remain part of the work.</h1>
      <p>
        Essays, announcements, learning notes, and practical information use the same safe
        structured publishing system.
      </p>
    </header>
    <ol class="journal-list">
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
  </main>
</template>
