<script setup lang="ts">
import { starterLayoutContent } from '#shared/content/starterLayout'
import type { LearningLessonResponse } from '#shared/types/learning'

const route = useRoute()
const starterMode = useStarterMode()
const endpoint = computed(
  () => `/api/learning/${String(route.params.pathSlug)}/${String(route.params.lessonSlug)}`,
)
const { data, error, refresh } = await useFetch<LearningLessonResponse>(endpoint)
const { data: session } = await useFetch('/api/auth/session')
const savingPosition = ref<number | null>(null)
const progressMessage = ref('')
const { track } = useTelemetry()

useSeoMeta({
  title: () =>
    starterMode
      ? starterLayoutContent.learning.lessonTitle
      : (data.value?.lesson.title ?? 'Lesson'),
  description: () =>
    starterMode ? starterLayoutContent.learning.lessonSummary : data.value?.lesson.summary,
})

async function recordProgress(sectionPosition: number, completed: boolean) {
  if (!data.value) return
  savingPosition.value = sectionPosition
  progressMessage.value = ''
  try {
    await $fetch('/api/learning/progress', {
      method: 'POST',
      body: { lessonId: data.value.lesson.id, sectionPosition, completed },
    })
    void track('course_progress', {
      resourceType: 'lesson',
      resourceKey: data.value.lesson.slug,
      value: completed ? 100 : sectionPosition,
    })
    await refresh()
    progressMessage.value = completed
      ? 'Lesson completed. Your next lesson is ready.'
      : 'Progress saved to this account.'
  } catch {
    progressMessage.value = 'Progress could not be saved.'
  } finally {
    savingPosition.value = null
  }
}
</script>

<template>
  <div v-if="data" class="page-frame lesson-page">
    <header class="page-heading lesson-heading">
      <h1>{{ starterMode ? starterLayoutContent.learning.lessonTitle : data.lesson.title }}</h1>
      <p>{{ starterMode ? starterLayoutContent.learning.lessonSummary : data.lesson.summary }}</p>
      <p class="lesson-access-state">
        {{
          starterMode
            ? `${starterLayoutContent.learning.lessonDuration} · ${starterLayoutContent.learning.lessonAccess}`
            : `${data.lesson.estimatedMinutes} minutes · ${data.lesson.accessMode.replace('_', ' ')}`
        }}
      </p>
    </header>

    <section
      v-if="!data.access.allowed"
      class="lesson-access-boundary"
      aria-labelledby="access-heading"
    >
      <p class="section-number">
        {{ starterMode ? starterLayoutContent.learning.lessonAccess : 'Access' }}
      </p>
      <div>
        <h2 id="access-heading">
          {{
            starterMode
              ? starterLayoutContent.learning.lessonAccessExplanation
              : 'This lesson keeps its promise to the artist and learner.'
          }}
        </h2>
        <p>
          {{
            starterMode
              ? starterLayoutContent.learning.lessonAccessExplanation
              : data.lesson.accessExplanation
          }}
        </p>
        <NuxtLink
          v-if="data.access.reason === 'sign_in'"
          class="text-action text-action--primary"
          :to="`/sign-in?redirect=${route.fullPath}`"
        >
          Sign in to continue
        </NuxtLink>
        <NuxtLink v-else class="text-action text-action--primary" to="/support">
          View access options
        </NuxtLink>
      </div>
    </section>

    <div v-else class="lesson-sections">
      <section
        v-for="section in data.sections"
        :key="section.id"
        class="lesson-section"
        :class="`lesson-section--${section.type}`"
      >
        <template v-if="section.type === 'prose'">
          <p v-if="starterMode || section.eyebrow" class="section-number">
            {{ starterMode ? starterLayoutContent.learning.sectionLabel : section.eyebrow }}
          </p>
          <div>
            <h2>
              {{ starterMode ? starterLayoutContent.learning.sectionHeading : section.heading }}
            </h2>
            <SafeRichText
              :body="starterMode ? starterLayoutContent.learning.sectionBody : section.body"
            />
          </div>
        </template>
        <figure v-else-if="section.type === 'image'">
          <div
            v-if="starterMode"
            class="lesson-image-placeholder"
            role="img"
            :aria-label="starterLayoutContent.learning.imageAlt"
          >
            <span>{{ starterLayoutContent.learning.imageAlt }}</span>
          </div>
          <img v-else :src="section.mediaUrl" :alt="section.alt" loading="lazy" />
          <figcaption>
            <strong>
              {{ starterMode ? starterLayoutContent.learning.sectionHeading : section.heading }}
            </strong>
            <span v-if="starterMode || section.caption">
              {{ starterMode ? starterLayoutContent.learning.imageCaption : section.caption }}
            </span>
          </figcaption>
        </figure>
        <template v-else-if="section.type === 'audio'">
          <div>
            <h2>
              {{ starterMode ? starterLayoutContent.learning.sectionHeading : section.heading }}
            </h2>
            <p>{{ starterMode ? starterLayoutContent.learning.audioPrompt : section.prompt }}</p>
          </div>
          <audio :src="section.mediaUrl" controls preload="metadata">
            Audio playback is unavailable.
            {{ starterMode ? starterLayoutContent.learning.audioTranscript : section.transcript }}
          </audio>
          <details v-if="starterMode || section.transcript">
            <summary>Audio transcript</summary>
            <p>
              {{ starterMode ? starterLayoutContent.learning.audioTranscript : section.transcript }}
            </p>
          </details>
        </template>
        <template v-else-if="section.type === 'video' && section.video">
          <h2>
            {{ starterMode ? starterLayoutContent.learning.sectionHeading : section.heading }}
          </h2>
          <VideoExperience :video="section.video" :starter="starterMode" />
        </template>
        <template v-else-if="section.type === 'download'">
          <div>
            <h2>
              {{ starterMode ? starterLayoutContent.learning.sectionHeading : section.heading }}
            </h2>
            <p>
              {{
                starterMode
                  ? starterLayoutContent.learning.downloadDescription
                  : section.description
              }}
            </p>
          </div>
          <a class="text-action" :href="section.mediaUrl">
            {{ starterMode ? starterLayoutContent.learning.downloadAction : section.label }}
          </a>
        </template>
        <template v-else-if="section.type === 'prompt'">
          <p class="section-number">
            {{ starterMode ? starterLayoutContent.learning.practiceLabel : 'Practice' }}
          </p>
          <div>
            <h2>
              {{ starterMode ? starterLayoutContent.learning.sectionHeading : section.heading }}
            </h2>
            <p>{{ starterMode ? starterLayoutContent.learning.practiceText : section.body }}</p>
          </div>
        </template>

        <button
          v-if="session?.authenticated"
          class="quiet-action lesson-progress-action"
          type="button"
          :disabled="
            savingPosition !== null || (data.progress?.sectionPosition ?? 0) >= section.position
          "
          @click="recordProgress(section.position, false)"
        >
          {{
            (data.progress?.sectionPosition ?? 0) >= section.position
              ? 'Saved through here'
              : 'Save through this section'
          }}
        </button>
      </section>

      <section class="lesson-completion" aria-labelledby="completion-heading">
        <div>
          <p class="section-number">
            {{ starterMode ? starterLayoutContent.learning.completionLabel : 'Return point' }}
          </p>
          <h2 id="completion-heading">
            {{
              starterMode
                ? starterLayoutContent.learning.completionHeading
                : 'Carry this lesson forward.'
            }}
          </h2>
          <p v-if="starterMode">{{ starterLayoutContent.learning.completionText }}</p>
          <p v-else-if="!session?.authenticated">
            Sign in to save completion and resume the next lesson.
          </p>
          <p v-else-if="data.progress?.completed">This lesson is complete in your account.</p>
          <p v-else>Mark the lesson complete when the practice feels whole.</p>
        </div>
        <NuxtLink
          v-if="!session?.authenticated"
          class="text-action"
          :to="`/sign-in?redirect=${route.fullPath}`"
          >Sign in to save</NuxtLink
        >
        <button
          v-else-if="!data.progress?.completed"
          class="text-action text-action--primary"
          type="button"
          :disabled="savingPosition !== null"
          @click="recordProgress(data.sections.at(-1)?.position ?? 0, true)"
        >
          Mark lesson complete
        </button>
      </section>
      <p v-if="progressMessage" class="form-message" role="status">{{ progressMessage }}</p>
    </div>

    <nav class="lesson-navigation" aria-label="Lesson order">
      <NuxtLink
        v-if="data.previousLesson"
        :to="`/learn/${data.path.slug}/${data.previousLesson.slug}`"
      >
        {{
          starterMode
            ? starterLayoutContent.learning.previousAction
            : `Previous: ${data.previousLesson.title}`
        }}
      </NuxtLink>
      <NuxtLink :to="`/learn/${data.path.slug}`">Path overview</NuxtLink>
      <NuxtLink v-if="data.nextLesson" :to="`/learn/${data.path.slug}/${data.nextLesson.slug}`">
        {{
          starterMode
            ? starterLayoutContent.learning.nextLessonAction
            : `Next: ${data.nextLesson.title}`
        }}
      </NuxtLink>
    </nav>
  </div>
  <div v-else class="page-frame interior-page">
    <h1>{{ error ? 'Lesson not found.' : 'Loading lesson…' }}</h1>
  </div>
</template>
