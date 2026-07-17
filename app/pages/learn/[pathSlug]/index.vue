<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { LearningCatalogResponse } from '#shared/types/learning'

const route = useRoute()
const starterMode = useStarterMode()
const { data, error } = await useFetch<{ path: LearningCatalogResponse['paths'][number] }>(
  () => `/api/learning/${String(route.params.pathSlug)}`,
)
useSeoMeta({
  title: () =>
    starterMode
      ? starterLayoutContent.learning.pathTitle
      : (data.value?.path.title ?? 'Learning path'),
  description: () =>
    starterMode ? starterLayoutContent.learning.pathSummary : data.value?.path.summary,
})
</script>

<template>
  <div v-if="data" class="page-frame learning-path-page">
    <header class="page-heading">
      <h1>{{ starterMode ? starterLayoutContent.learning.pathTitle : data.path.title }}</h1>
      <p>
        {{ starterMode ? starterLayoutContent.learning.pathIntroduction : data.path.introduction }}
      </p>
    </header>
    <section
      v-for="course in data.path.courses"
      :key="course.id"
      class="learning-course"
      :aria-labelledby="`course-${course.id}`"
    >
      <header>
        <p class="section-number">
          {{
            starterMode
              ? `${starterLayoutContent.learning.courseLabel} ${course.position}`
              : `Course ${course.position}`
          }}
        </p>
        <h2 :id="`course-${course.id}`">
          {{ starterMode ? starterLayoutContent.learning.courseTitle : course.title }}
        </h2>
        <p>{{ starterMode ? starterLayoutContent.learning.courseSummary : course.summary }}</p>
      </header>
      <ol class="lesson-order">
        <li v-for="lesson in course.lessons" :key="lesson.id">
          <div>
            <p class="lesson-position">{{ String(lesson.position).padStart(2, '0') }}</p>
            <div>
              <h3>
                {{
                  starterMode
                    ? `${starterLayoutContent.learning.lessonTitle} ${String(lesson.position).padStart(2, '0')}`
                    : lesson.title
                }}
              </h3>
              <p>
                {{ starterMode ? starterLayoutContent.learning.lessonSummary : lesson.summary }}
              </p>
              <p class="lesson-access-state">
                {{
                  starterMode
                    ? `${starterLayoutContent.learning.lessonDuration} · ${starterLayoutContent.learning.lessonAccess}`
                    : `${lesson.estimatedMinutes} minutes · ${lesson.completed ? 'completed' : lesson.accessMode.replace('_', ' ')}`
                }}
              </p>
            </div>
          </div>
          <NuxtLink class="text-action" :to="`/learn/${data.path.slug}/${lesson.slug}`">
            {{
              starterMode
                ? starterLayoutContent.learning.lessonAction
                : lesson.accessible
                  ? 'Open lesson'
                  : 'View access'
            }}
          </NuxtLink>
        </li>
      </ol>
    </section>
  </div>
  <div v-else class="page-frame interior-page">
    <h1>{{ error ? 'Learning path not found.' : 'Loading path…' }}</h1>
  </div>
</template>
