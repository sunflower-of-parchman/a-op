<script setup lang="ts">
import type { LearningCatalogResponse } from '#shared/types/learning'

const route = useRoute()
const { data, error } = await useFetch<{ path: LearningCatalogResponse['paths'][number] }>(
  () => `/api/learning/${String(route.params.pathSlug)}`,
)
useSeoMeta({
  title: () => data.value?.path.title ?? 'Learning path',
  description: () => data.value?.path.summary,
})
</script>

<template>
  <div v-if="data" class="page-frame learning-path-page">
    <header class="page-heading">
      <p class="eyebrow">{{ data.path.area.name }}</p>
      <h1>{{ data.path.title }}</h1>
      <p>{{ data.path.introduction }}</p>
    </header>
    <section
      v-for="course in data.path.courses"
      :key="course.id"
      class="learning-course"
      :aria-labelledby="`course-${course.id}`"
    >
      <header>
        <p class="section-number">Course {{ course.position }}</p>
        <h2 :id="`course-${course.id}`">{{ course.title }}</h2>
        <p>{{ course.summary }}</p>
      </header>
      <ol class="lesson-order">
        <li v-for="lesson in course.lessons" :key="lesson.id">
          <div>
            <p class="lesson-position">{{ String(lesson.position).padStart(2, '0') }}</p>
            <div>
              <h3>{{ lesson.title }}</h3>
              <p>{{ lesson.summary }}</p>
              <p class="lesson-access-state">
                {{ lesson.estimatedMinutes }} minutes ·
                {{ lesson.completed ? 'completed' : lesson.accessMode.replace('_', ' ') }}
              </p>
            </div>
          </div>
          <NuxtLink class="text-action" :to="`/learn/${data.path.slug}/${lesson.slug}`">
            {{ lesson.accessible ? 'Open lesson' : 'View access' }}
          </NuxtLink>
        </li>
      </ol>
    </section>
  </div>
  <div v-else class="page-frame interior-page">
    <p class="eyebrow">Learn</p>
    <h1>{{ error ? 'Learning path not found.' : 'Loading path…' }}</h1>
  </div>
</template>
