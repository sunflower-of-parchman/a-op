import type { LessonSectionInput } from '../schemas/learning'

export type LearningAccess = {
  allowed: boolean
  reason: string
  entitlementId?: string | null
  expiresAt?: string | null
}

export type LearningLessonSummary = {
  id: string
  slug: string
  title: string
  summary: string
  estimatedMinutes: number
  accessMode: 'public' | 'account' | 'entitlement' | 'membership'
  accessExplanation: string
  position: number
  accessible: boolean
  accessReason: string
  completed: boolean
}

export type LearningCatalogResponse = {
  paths: Array<{
    id: string
    slug: string
    title: string
    summary: string
    introduction: string
    area: { slug: string; name: string; description: string }
    courses: Array<{
      id: string
      slug: string
      title: string
      summary: string
      position: number
      lessons: LearningLessonSummary[]
    }>
    completedLessons: number
    totalLessons: number
    nextLesson: { slug: string; title: string; accessible: boolean } | null
  }>
}

export type LearningLessonResponse = {
  path: { id: string; slug: string; title: string }
  course: { id: string; slug: string; title: string }
  lesson: LearningLessonSummary
  access: LearningAccess
  sections: Array<
    LessonSectionInput & {
      position: number
      mediaUrl?: string
      video?: VideoRecord
    }
  >
  progress: { sectionPosition: number; completed: boolean } | null
  previousLesson: { slug: string; title: string } | null
  nextLesson: { slug: string; title: string } | null
}

export type LearningAccountResponse = {
  authenticated: boolean
  paths?: LearningCatalogResponse['paths']
}

export type VideoRecord = {
  id: string
  slug: string
  title: string
  summary: string
  provider: 'youtube' | 'vimeo' | 'hosted'
  embedUrl: string | null
  mediaUrl: string | null
  posterUrl: string | null
  transcript: string
  credits: Array<{ role: string; name: string }>
  publishedAt: string
}

export type EditorialRecord = {
  id: string
  kind: 'essay' | 'announcement' | 'learning_note' | 'information'
  slug: string
  title: string
  summary: string
  publishedOn: string
  sections: import('../schemas/page').PageSection[]
  publishedAt: string
}
