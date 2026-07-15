<script setup lang="ts">
import type { LearningPathInput, LessonInput, LessonSectionInput } from '#shared/schemas/learning'
import { uploadWithTus, type TusUploadTarget } from '~/utils/tusUpload'

useSeoMeta({ title: 'Learning administration' })
const { data, error, refresh } = await useFetch('/api/admin/learning')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/learning')

const draft = ref<LearningPathInput | null>(null)
const savedSnapshot = ref('')
const message = ref('')
const saving = ref(false)
const publishing = ref(false)
const uploadProgress = reactive<Record<string, number>>({})
const sectionTypes: LessonSectionInput['type'][] = [
  'prose',
  'image',
  'audio',
  'video',
  'download',
  'prompt',
]
const unsaved = computed(
  () => Boolean(draft.value) && JSON.stringify(draft.value) !== savedSnapshot.value,
)

function selectDraft(value: LearningPathInput) {
  draft.value = structuredClone(value)
  savedSnapshot.value = JSON.stringify(draft.value)
  message.value = ''
}

watchEffect(() => {
  if (!draft.value && data.value?.drafts[0]) selectDraft(data.value.drafts[0])
})

function createDraft() {
  const areaId = crypto.randomUUID()
  const pathId = crypto.randomUUID()
  draft.value = {
    area: {
      id: areaId,
      slug: 'new-learning-area',
      name: 'New learning area',
      description: 'Describe the shared practice this area holds.',
    },
    id: pathId,
    slug: 'new-learning-path',
    title: 'New learning path',
    summary: 'Describe what this ordered path helps a learner practice.',
    introduction: 'Welcome the learner and explain how to move through this path.',
    courses: [createCourse()],
  }
  savedSnapshot.value = ''
  message.value = 'New private draft prepared. Save it before uploading lesson media.'
}

function createCourse(): LearningPathInput['courses'][number] {
  return {
    id: crypto.randomUUID(),
    slug: 'new-course',
    title: 'New course',
    summary: 'Describe this stage of the path.',
    lessons: [createLesson()],
  }
}

function createLesson(): LessonInput {
  return {
    id: crypto.randomUUID(),
    slug: 'new-lesson',
    title: 'New lesson',
    summary: 'Describe the lesson in one direct sentence.',
    estimatedMinutes: 10,
    accessMode: 'public',
    accessExplanation: 'This lesson is public.',
    membershipTierId: null,
    price: null,
    sections: [createSection('prose')],
  }
}

function createSection(type: LessonSectionInput['type']): LessonSectionInput {
  const id = crypto.randomUUID()
  if (type === 'prose') return { id, type, heading: 'New section', body: 'Write in plain text.' }
  if (type === 'image')
    return {
      id,
      type,
      heading: 'Look closely',
      mediaId: data.value?.media[0]?.id ?? crypto.randomUUID(),
      alt: 'Describe the approved image.',
      caption: '',
    }
  if (type === 'audio')
    return {
      id,
      type,
      heading: 'Listen',
      mediaId:
        data.value?.media.find(({ media_type }) => media_type.startsWith('audio/'))?.id ??
        crypto.randomUUID(),
      prompt: 'Name what the learner should listen for.',
      transcript: 'Add a transcript when the audio contains speech.',
    }
  if (type === 'video')
    return {
      id,
      type,
      heading: 'Watch with context',
      videoId: data.value?.videos[0]?.id ?? crypto.randomUUID(),
    }
  if (type === 'download')
    return {
      id,
      type,
      heading: 'Take the resource',
      mediaId:
        data.value?.media.find(({ kind }) => kind === 'lesson_media')?.id ?? crypto.randomUUID(),
      label: 'Download resource',
      description: 'Explain what this protected resource contains.',
    }
  return { id, type, heading: 'Practice prompt', body: 'Describe one specific practice.' }
}

function move<T>(values: T[], index: number, direction: -1 | 1) {
  const destination = index + direction
  if (destination < 0 || destination >= values.length) return
  const [value] = values.splice(index, 1)
  if (value) values.splice(destination, 0, value)
}

function normalizeAccess(lesson: LessonInput) {
  lesson.membershipTierId = lesson.accessMode === 'membership' ? lesson.membershipTierId : null
  lesson.price =
    lesson.accessMode === 'entitlement'
      ? (lesson.price ?? { currency: 'USD', amountMinor: 1200 })
      : null
}

function mediaRecord(mediaId: string) {
  return data.value?.media.find(({ id }) => id === mediaId)
}

function videoRecord(videoId: string) {
  return data.value?.videos.find(({ id }) => id === videoId)
}

async function saveDraft() {
  if (!draft.value) return false
  saving.value = true
  message.value = ''
  try {
    await $fetch('/api/admin/learning', { method: 'PUT', body: draft.value })
    savedSnapshot.value = JSON.stringify(draft.value)
    await refresh()
    message.value = 'Learning draft saved. The published path is unchanged.'
    return true
  } catch {
    message.value = 'The learning draft did not pass validation. Review access and every section.'
    return false
  } finally {
    saving.value = false
  }
}

async function publishDraft() {
  if (!draft.value) return
  if (unsaved.value && !(await saveDraft())) return
  if (!window.confirm('Publish this exact path, course order, lesson order, access, and media?'))
    return
  publishing.value = true
  try {
    await $fetch('/api/admin/learning/publish', { method: 'POST', body: { id: draft.value.id } })
    await refresh()
    savedSnapshot.value = JSON.stringify(draft.value)
    message.value = 'Learning path published from the approved draft.'
  } catch {
    message.value =
      'The learning path could not be published. Verify every referenced media and video.'
  } finally {
    publishing.value = false
  }
}

async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function uploadLessonMedia(lesson: LessonInput, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (unsaved.value && !(await saveDraft())) {
    input.value = ''
    return
  }
  try {
    uploadProgress[lesson.id] = 0
    const target = await $fetch<
      TusUploadTarget & { reused: boolean; mediaId?: string; status?: string }
    >('/api/admin/media/upload-target', {
      method: 'POST',
      body: {
        kind: 'lesson_media',
        lessonId: lesson.id,
        filename: file.name,
        mediaType: file.type,
        byteSize: file.size,
        sha256: await hashBlob(file),
      },
    })
    if (!target.reused) {
      await uploadWithTus(file, target, (fraction) => (uploadProgress[lesson.id] = fraction))
      await $fetch('/api/admin/media/upload-complete', {
        method: 'POST',
        body: { intentId: target.intentId },
      })
    }
    await refresh()
    message.value = target.reused
      ? 'The existing lesson resource was reused by content hash.'
      : 'Lesson media uploaded privately and is ready to attach.'
  } catch {
    message.value =
      'Lesson media upload failed. Use a supported image, audio, video, PDF, or text file.'
  } finally {
    Reflect.deleteProperty(uploadProgress, lesson.id)
    input.value = ''
  }
}
</script>

<template>
  <div class="page-frame admin-editor learning-admin">
    <header class="page-heading">
      <p class="eyebrow">Artist administration / Learning</p>
      <h1>Author the sequence, access, and return.</h1>
      <p>
        Private drafts preserve the published path until one explicit publication applies the
        complete order.
      </p>
    </header>

    <div class="admin-record-selector">
      <button class="text-action" type="button" @click="createDraft">Create learning path</button>
      <button
        v-for="item in data?.drafts ?? []"
        :key="item.id"
        class="quiet-action"
        type="button"
        @click="selectDraft(item)"
      >
        {{ item.title }} · {{ item.publishedAt ? 'published' : 'draft only' }}
      </button>
    </div>

    <form v-if="draft" class="admin-edit-form" @submit.prevent="saveDraft">
      <section aria-labelledby="learning-path-heading">
        <div class="admin-section-heading">
          <p class="section-number">01 / Path</p>
          <h2 id="learning-path-heading">Public purpose and area</h2>
        </div>
        <div class="admin-fields">
          <label
            ><span>Area name</span><input v-model="draft.area.name" required maxlength="120"
          /></label>
          <label
            ><span>Area slug</span
            ><input v-model="draft.area.slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*"
          /></label>
          <label
            ><span>Area description</span
            ><textarea v-model="draft.area.description" required rows="3" />
          </label>
          <label
            ><span>Path title</span><input v-model="draft.title" required maxlength="200"
          /></label>
          <label
            ><span>Path slug</span
            ><input v-model="draft.slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*"
          /></label>
          <label><span>Summary</span><textarea v-model="draft.summary" required rows="4" /></label>
          <label
            ><span>Introduction</span><textarea v-model="draft.introduction" required rows="7" />
          </label>
        </div>
      </section>

      <section aria-labelledby="course-order-heading">
        <div class="admin-section-heading">
          <p class="section-number">02 / Courses and lessons</p>
          <h2 id="course-order-heading">The complete authored order</h2>
        </div>
        <ol class="learning-course-editor">
          <li v-for="(course, courseIndex) in draft.courses" :key="course.id">
            <div class="section-editor-controls">
              <strong>Course {{ courseIndex + 1 }}</strong>
              <div>
                <button
                  class="quiet-action"
                  type="button"
                  :disabled="courseIndex === 0"
                  @click="move(draft.courses, courseIndex, -1)"
                >
                  Move up</button
                ><button
                  class="quiet-action"
                  type="button"
                  :disabled="courseIndex === draft.courses.length - 1"
                  @click="move(draft.courses, courseIndex, 1)"
                >
                  Move down</button
                ><button
                  class="quiet-action"
                  type="button"
                  :disabled="draft.courses.length === 1"
                  @click="draft.courses.splice(courseIndex, 1)"
                >
                  Remove
                </button>
              </div>
            </div>
            <div class="admin-fields compact-fields">
              <label><span>Course title</span><input v-model="course.title" required /></label>
              <label
                ><span>Course slug</span
                ><input v-model="course.slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*"
              /></label>
              <label
                ><span>Course summary</span><textarea v-model="course.summary" required rows="3" />
              </label>
            </div>
            <ol class="learning-lesson-editor">
              <li v-for="(lesson, lessonIndex) in course.lessons" :key="lesson.id">
                <div class="section-editor-controls">
                  <strong>Lesson {{ lessonIndex + 1 }} · {{ lesson.title }}</strong>
                  <div>
                    <button
                      class="quiet-action"
                      type="button"
                      :disabled="lessonIndex === 0"
                      @click="move(course.lessons, lessonIndex, -1)"
                    >
                      Move up</button
                    ><button
                      class="quiet-action"
                      type="button"
                      :disabled="lessonIndex === course.lessons.length - 1"
                      @click="move(course.lessons, lessonIndex, 1)"
                    >
                      Move down</button
                    ><button
                      class="quiet-action"
                      type="button"
                      :disabled="course.lessons.length === 1"
                      @click="course.lessons.splice(lessonIndex, 1)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div class="admin-fields compact-fields">
                  <label><span>Lesson title</span><input v-model="lesson.title" required /></label>
                  <label
                    ><span>Lesson slug</span
                    ><input v-model="lesson.slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  /></label>
                  <label
                    ><span>Summary</span><textarea v-model="lesson.summary" required rows="3" />
                  </label>
                  <label
                    ><span>Estimated minutes</span
                    ><input
                      v-model.number="lesson.estimatedMinutes"
                      type="number"
                      min="1"
                      max="600"
                      required
                  /></label>
                  <label
                    ><span>Access</span
                    ><select v-model="lesson.accessMode" @change="normalizeAccess(lesson)">
                      <option value="public">Public</option>
                      <option value="account">Free account</option>
                      <option value="entitlement">Individual purchase</option>
                      <option value="membership">Membership</option>
                    </select></label
                  >
                  <label v-if="lesson.accessMode === 'membership'"
                    ><span>Membership tier</span
                    ><select v-model="lesson.membershipTierId" required>
                      <option :value="null">Choose tier</option>
                      <option
                        v-for="tier in data?.membershipTiers ?? []"
                        :key="tier.id"
                        :value="tier.id"
                      >
                        {{ tier.name }}
                      </option>
                    </select></label
                  >
                  <template v-if="lesson.accessMode === 'entitlement' && lesson.price"
                    ><label
                      ><span>Currency</span
                      ><input v-model="lesson.price.currency" required pattern="[A-Z]{3}" /></label
                    ><label
                      ><span>Price in minor units</span
                      ><input
                        v-model.number="lesson.price.amountMinor"
                        type="number"
                        min="1"
                        required /></label
                  ></template>
                  <label
                    ><span>Access explanation</span
                    ><textarea v-model="lesson.accessExplanation" required rows="3" />
                  </label>
                </div>

                <div class="lesson-media-upload">
                  <label
                    ><span>Upload private lesson media</span
                    ><input
                      type="file"
                      accept="image/webp,image/png,image/jpeg,audio/mpeg,audio/wav,video/mp4,video/webm,application/pdf,text/plain"
                      @change="uploadLessonMedia(lesson, $event)"
                  /></label>
                  <p
                    v-if="uploadProgress[lesson.id] !== undefined"
                    class="form-message"
                    role="status"
                  >
                    Upload {{ Math.round(uploadProgress[lesson.id]! * 100) }}%
                  </p>
                </div>

                <ol class="lesson-section-editor">
                  <li v-for="(section, sectionIndex) in lesson.sections" :key="section.id">
                    <div class="section-editor-controls">
                      <strong>{{ sectionIndex + 1 }} · {{ section.type }}</strong>
                      <div>
                        <button
                          class="quiet-action"
                          type="button"
                          :disabled="sectionIndex === 0"
                          @click="move(lesson.sections, sectionIndex, -1)"
                        >
                          Up</button
                        ><button
                          class="quiet-action"
                          type="button"
                          :disabled="sectionIndex === lesson.sections.length - 1"
                          @click="move(lesson.sections, sectionIndex, 1)"
                        >
                          Down</button
                        ><button
                          class="quiet-action"
                          type="button"
                          :disabled="lesson.sections.length === 1"
                          @click="lesson.sections.splice(sectionIndex, 1)"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div class="admin-fields compact-fields">
                      <label
                        ><span>Heading</span><input v-model="section.heading" required
                      /></label>
                      <template v-if="section.type === 'prose'"
                        ><label><span>Eyebrow</span><input v-model="section.eyebrow" /></label
                        ><label
                          ><span>Body · **bold**, _emphasis_, [label](/path), and - lists</span
                          ><textarea v-model="section.body" required rows="6" /></label
                      ></template>
                      <template v-else-if="section.type === 'image'"
                        ><label
                          ><span>Image media</span
                          ><select v-model="section.mediaId">
                            <option
                              v-for="media in data?.media.filter(({ media_type }) =>
                                media_type.startsWith('image/'),
                              ) ?? []"
                              :key="media.id"
                              :value="media.id"
                            >
                              {{ media.object_path }}
                            </option>
                          </select></label
                        ><label
                          ><span>Alternative text</span
                          ><textarea v-model="section.alt" required rows="3" /></label
                        ><label
                          ><span>Caption</span
                          ><textarea v-model="section.caption" rows="2" /></label
                      ></template>
                      <template v-else-if="section.type === 'audio'"
                        ><label
                          ><span>Audio media</span
                          ><select v-model="section.mediaId">
                            <option
                              v-for="media in data?.media.filter(({ media_type }) =>
                                media_type.startsWith('audio/'),
                              ) ?? []"
                              :key="media.id"
                              :value="media.id"
                            >
                              {{ media.object_path }}
                            </option>
                          </select></label
                        ><label
                          ><span>Listening prompt</span
                          ><textarea v-model="section.prompt" required rows="3" /></label
                        ><label
                          ><span>Transcript</span
                          ><textarea v-model="section.transcript" rows="3" /></label
                      ></template>
                      <template v-else-if="section.type === 'video'"
                        ><label
                          ><span>Published video</span
                          ><select v-model="section.videoId">
                            <option
                              v-for="video in data?.videos ?? []"
                              :key="video.id"
                              :value="video.id"
                            >
                              {{ video.title }}
                            </option>
                          </select></label
                        ></template
                      >
                      <template v-else-if="section.type === 'download'"
                        ><label
                          ><span>Resource media</span
                          ><select v-model="section.mediaId">
                            <option
                              v-for="media in data?.media.filter(
                                ({ kind }) => kind === 'lesson_media',
                              ) ?? []"
                              :key="media.id"
                              :value="media.id"
                            >
                              {{ media.object_path }}
                            </option>
                          </select></label
                        ><label
                          ><span>Link label</span><input v-model="section.label" required /></label
                        ><label
                          ><span>Description</span
                          ><textarea v-model="section.description" required rows="3" /></label
                      ></template>
                      <template v-else-if="section.type === 'prompt'"
                        ><label
                          ><span>Prompt</span
                          ><textarea v-model="section.body" required rows="5" /></label
                      ></template>
                    </div>
                  </li>
                </ol>
                <div class="section-add-actions">
                  <button
                    v-for="type in sectionTypes"
                    :key="type"
                    class="quiet-action"
                    type="button"
                    @click="lesson.sections.push(createSection(type))"
                  >
                    Add {{ type }}
                  </button>
                </div>
              </li>
            </ol>
            <button class="text-action" type="button" @click="course.lessons.push(createLesson())">
              Add lesson
            </button>
          </li>
        </ol>
        <button class="text-action" type="button" @click="draft.courses.push(createCourse())">
          Add course
        </button>
      </section>

      <section class="learning-draft-preview" aria-labelledby="learning-preview-heading">
        <div class="admin-section-heading">
          <p class="section-number">03 / Preview</p>
          <h2 id="learning-preview-heading">The proposed learner sequence</h2>
        </div>
        <ol class="learning-preview-courses">
          <li v-for="course in draft.courses" :key="course.id">
            <strong>{{ course.title }}</strong>
            <ol>
              <li v-for="lesson in course.lessons" :key="lesson.id">
                <details>
                  <summary>
                    {{ lesson.title }} · {{ lesson.accessMode }} ·
                    {{ lesson.sections.length }} sections
                  </summary>
                  <ol class="learning-preview-sections">
                    <li v-for="(section, sectionIndex) in lesson.sections" :key="section.id">
                      <p class="section-number">
                        {{ String(sectionIndex + 1).padStart(2, '0') }} / {{ section.type }}
                      </p>
                      <h4>{{ section.heading }}</h4>
                      <SafeRichText
                        v-if="section.type === 'prose' || section.type === 'prompt'"
                        :body="section.body"
                      />
                      <figure v-else-if="section.type === 'image'">
                        <img :src="`/api/admin/media/${section.mediaId}`" :alt="section.alt" />
                        <figcaption>{{ section.caption }}</figcaption>
                      </figure>
                      <template v-else-if="section.type === 'audio'">
                        <p>{{ section.prompt }}</p>
                        <audio
                          :src="`/api/admin/media/${section.mediaId}`"
                          controls
                          preload="metadata"
                        />
                        <p v-if="section.transcript">{{ section.transcript }}</p>
                      </template>
                      <p v-else-if="section.type === 'video'">
                        Published video:
                        <NuxtLink
                          v-if="videoRecord(section.videoId)"
                          :to="`/video/${videoRecord(section.videoId)?.slug}`"
                        >
                          {{ videoRecord(section.videoId)?.title }}
                        </NuxtLink>
                        <span v-else>Choose a published video.</span>
                      </p>
                      <p v-else>
                        {{ section.label }} ·
                        {{ mediaRecord(section.mediaId)?.object_path ?? 'Choose a resource.'
                        }}<br />
                        {{ section.description }}
                      </p>
                    </li>
                  </ol>
                </details>
              </li>
            </ol>
          </li>
        </ol>
      </section>

      <div class="admin-submit-row">
        <button class="text-action" type="submit" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save private draft' }}</button
        ><button
          class="text-action text-action--primary"
          type="button"
          :disabled="publishing"
          @click="publishDraft"
        >
          {{ publishing ? 'Publishing…' : 'Publish approved path' }}
        </button>
      </div>
      <p v-if="message" class="form-message" role="status">{{ message }}</p>
    </form>
  </div>
</template>
