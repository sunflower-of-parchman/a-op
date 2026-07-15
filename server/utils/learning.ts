import type { H3Event } from 'h3'
import type { LearningAccess, LearningCatalogResponse, VideoRecord } from '#shared/types/learning'
import { getAdminSupabase } from './supabase'

type LearningRows = {
  areas: Array<{ id: string; slug: string; name: string; description: string }>
  paths: Array<{
    id: string
    area_id: string
    slug: string
    title: string
    summary: string
    introduction: string
    sort_order: number
  }>
  courses: Array<{
    id: string
    path_id: string
    slug: string
    title: string
    summary: string
    position: number
  }>
  lessons: Array<{
    id: string
    course_id: string
    slug: string
    title: string
    summary: string
    estimated_minutes: number
    access_mode: 'public' | 'account' | 'entitlement' | 'membership'
    access_explanation: string
    position: number
  }>
}

export function presentVideo(
  video: {
    id: string
    slug: string
    title: string
    summary: string
    provider: string
    external_id: string | null
    hosted_media_id: string | null
    poster_url: string | null
    transcript: string
    credits: unknown
    published_at: string
  },
  mediaUrl: string | null = null,
): VideoRecord {
  const embedUrl =
    video.provider === 'youtube' && video.external_id
      ? `https://www.youtube-nocookie.com/embed/${video.external_id}?rel=0`
      : video.provider === 'vimeo' && video.external_id
        ? `https://player.vimeo.com/video/${video.external_id}?dnt=1`
        : null
  return {
    id: video.id,
    slug: video.slug,
    title: video.title,
    summary: video.summary,
    provider: video.provider as VideoRecord['provider'],
    embedUrl,
    mediaUrl,
    posterUrl: video.poster_url,
    transcript: video.transcript,
    credits: video.credits as VideoRecord['credits'],
    publishedAt: video.published_at,
  }
}

async function loadRows(event: H3Event): Promise<LearningRows> {
  const admin = getAdminSupabase(event)
  const [
    { data: areas, error: areaError },
    { data: paths, error: pathError },
    { data: courses, error: courseError },
    { data: lessons, error: lessonError },
  ] = await Promise.all([
    admin
      .from('learning_areas')
      .select('id, slug, name, description')
      .eq('state', 'published')
      .order('sort_order'),
    admin
      .from('learning_paths')
      .select('id, area_id, slug, title, summary, introduction, sort_order')
      .eq('state', 'published')
      .order('sort_order'),
    admin
      .from('courses')
      .select('id, path_id, slug, title, summary, position')
      .eq('state', 'published')
      .order('position'),
    admin
      .from('lessons')
      .select(
        'id, course_id, slug, title, summary, estimated_minutes, access_mode, access_explanation, position',
      )
      .eq('state', 'published')
      .order('position'),
  ])
  if (areaError || pathError || courseError || lessonError) {
    throw createError({ statusCode: 503, statusMessage: 'Learning could not be loaded.' })
  }
  return { areas, paths, courses, lessons }
}

export async function decideLessonAccess(
  event: H3Event,
  subjectId: string | null,
  lessonId: string,
): Promise<LearningAccess> {
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('decide_lesson_access', {
    p_subject_id: subjectId as string,
    p_lesson_id: lessonId,
  })
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw createError({ statusCode: 503, statusMessage: 'Lesson access could not be decided.' })
  }
  return data as LearningAccess
}

export async function loadLearningCatalog(
  event: H3Event,
  subjectId: string | null,
): Promise<LearningCatalogResponse> {
  const admin = getAdminSupabase(event)
  const rows = await loadRows(event)
  const { data: progress, error: progressError } = subjectId
    ? await admin.from('lesson_progress').select('lesson_id, completed').eq('subject_id', subjectId)
    : { data: [], error: null }
  if (progressError) {
    throw createError({ statusCode: 503, statusMessage: 'Learning progress could not be loaded.' })
  }
  const decisions = await Promise.all(
    rows.lessons.map(
      async (lesson) => [lesson.id, await decideLessonAccess(event, subjectId, lesson.id)] as const,
    ),
  )
  const accessByLesson = new Map(decisions)
  const progressByLesson = new Map(progress.map((entry) => [entry.lesson_id, entry.completed]))

  return {
    paths: rows.paths.map((path) => {
      const pathCourses = rows.courses.filter(({ path_id }) => path_id === path.id)
      const lessons = pathCourses.flatMap((course) =>
        rows.lessons.filter(({ course_id }) => course_id === course.id),
      )
      const next = lessons.find(({ id }) => !progressByLesson.get(id)) ?? null
      const area = rows.areas.find(({ id }) => id === path.area_id)
      return {
        id: path.id,
        slug: path.slug,
        title: path.title,
        summary: path.summary,
        introduction: path.introduction,
        area: {
          slug: area?.slug ?? 'learning',
          name: area?.name ?? 'Learning',
          description: area?.description ?? '',
        },
        courses: pathCourses.map((course) => ({
          id: course.id,
          slug: course.slug,
          title: course.title,
          summary: course.summary,
          position: course.position,
          lessons: rows.lessons
            .filter(({ course_id }) => course_id === course.id)
            .map((lesson) => ({
              id: lesson.id,
              slug: lesson.slug,
              title: lesson.title,
              summary: lesson.summary,
              estimatedMinutes: lesson.estimated_minutes,
              accessMode: lesson.access_mode,
              accessExplanation: lesson.access_explanation,
              position: lesson.position,
              accessible: Boolean(accessByLesson.get(lesson.id)?.allowed),
              accessReason: accessByLesson.get(lesson.id)?.reason ?? 'missing',
              completed: Boolean(progressByLesson.get(lesson.id)),
            })),
        })),
        completedLessons: lessons.filter(({ id }) => progressByLesson.get(id)).length,
        totalLessons: lessons.length,
        nextLesson: next
          ? {
              slug: next.slug,
              title: next.title,
              accessible: Boolean(accessByLesson.get(next.id)?.allowed),
            }
          : null,
      }
    }),
  }
}
