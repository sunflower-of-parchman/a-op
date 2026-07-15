<script setup lang="ts">
import type { LearningCatalogResponse } from '#shared/types/learning'

useSeoMeta({
  title: 'Learn',
  description: 'Artist-authored paths with public, account, purchase, and membership access.',
})
const { data } = await useFetch<LearningCatalogResponse>('/api/learning')
</script>

<template>
  <main class="page-frame learning-index">
    <header class="page-heading">
      <p class="eyebrow">Learn</p>
      <h1>Teaching that stays close to the music.</h1>
      <p>
        Each path preserves the artist's order while public, account, purchase, and membership
        access resolve through one visible authority.
      </p>
    </header>

    <section
      v-for="(path, index) in data?.paths ?? []"
      :key="path.id"
      class="learning-path-introduction"
      :aria-labelledby="`path-${path.id}`"
    >
      <p class="section-number">{{ String(index + 1).padStart(2, '0') }} / {{ path.area.name }}</p>
      <div>
        <h2 :id="`path-${path.id}`">{{ path.title }}</h2>
        <p>{{ path.summary }}</p>
        <p class="learning-progress-summary">
          {{ path.completedLessons }} of {{ path.totalLessons }} lessons completed
        </p>
      </div>
      <div class="learning-path-actions">
        <NuxtLink class="text-action text-action--primary" :to="`/learn/${path.slug}`">
          Open the path
        </NuxtLink>
        <NuxtLink
          v-if="path.nextLesson"
          class="text-action"
          :to="`/learn/${path.slug}/${path.nextLesson.slug}`"
        >
          {{ path.nextLesson.accessible ? 'Continue' : 'Review next access' }}:
          {{ path.nextLesson.title }}
        </NuxtLink>
      </div>
    </section>

    <nav class="learning-related" aria-label="Related publishing">
      <NuxtLink to="/video">Video and transcripts</NuxtLink>
      <NuxtLink to="/journal">Editorial notes</NuxtLink>
    </nav>
  </main>
</template>
