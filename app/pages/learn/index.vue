<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { LearningCatalogResponse } from '#shared/types/learning'

const starterMode = useStarterMode()
useSeoMeta({
  title: 'Learn',
  description: 'Artist-authored paths with public, account, purchase, and membership access.',
})
const { data, error, status, refresh } = await useFetch<LearningCatalogResponse>('/api/learning')
</script>

<template>
  <div class="page-frame learning-index">
    <header class="page-heading">
      <p class="eyebrow">
        {{ starterMode ? starterLayoutContent.learning.eyebrow : 'Learn' }}
      </p>
      <h1>
        {{
          starterMode
            ? starterLayoutContent.learning.title
            : 'Teaching that stays close to the music.'
        }}
      </h1>
      <p v-if="starterMode">{{ starterLayoutContent.learning.introduction }}</p>
      <p v-else>
        Each path preserves the artist's order while public, account, purchase, and membership
        access resolve through one visible authority.
      </p>
    </header>

    <ServiceState
      v-if="status === 'pending'"
      eyebrow="Learning"
      title="Loading the artist's learning paths…"
      message="Lesson order and account access are being checked."
    />
    <ServiceState
      v-else-if="error"
      eyebrow="Learning unavailable"
      title="The learning service is not responding."
      message="Published work remains unchanged. Try again when the service is available."
      retryable
      @retry="refresh"
    />
    <ServiceState
      v-else-if="!data?.paths.length"
      eyebrow="Learning"
      title="No learning path has been published yet."
      message="Private lessons remain in the artist workspace until publication."
    />

    <section
      v-for="(path, index) in data?.paths ?? []"
      :key="path.id"
      class="learning-path-introduction"
      :aria-labelledby="`path-${path.id}`"
    >
      <p class="section-number">
        {{ String(index + 1).padStart(2, '0') }} /
        {{ starterMode ? starterLayoutContent.learning.area : path.area.name }}
      </p>
      <div>
        <h2 :id="`path-${path.id}`">
          {{ starterMode ? starterLayoutContent.learning.pathTitle : path.title }}
        </h2>
        <p>{{ starterMode ? starterLayoutContent.learning.pathSummary : path.summary }}</p>
        <p class="learning-progress-summary">
          {{ path.completedLessons }} of {{ path.totalLessons }} lessons completed
        </p>
      </div>
      <div class="learning-path-actions">
        <NuxtLink class="text-action text-action--primary" :to="`/learn/${path.slug}`">
          {{ starterMode ? starterLayoutContent.learning.pathAction : 'Open the path' }}
        </NuxtLink>
        <NuxtLink
          v-if="path.nextLesson"
          class="text-action"
          :to="`/learn/${path.slug}/${path.nextLesson.slug}`"
        >
          {{
            starterMode
              ? starterLayoutContent.learning.nextAction
              : `${path.nextLesson.accessible ? 'Continue' : 'Review next access'}: ${path.nextLesson.title}`
          }}
        </NuxtLink>
      </div>
    </section>

    <nav class="learning-related" aria-label="Related publishing">
      <NuxtLink to="/video">Video and transcripts</NuxtLink>
      <NuxtLink to="/journal">Editorial notes</NuxtLink>
    </nav>
  </div>
</template>
