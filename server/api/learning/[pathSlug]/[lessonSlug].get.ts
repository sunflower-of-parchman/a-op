import { lessonSectionSchema } from '#shared/schemas/learning'
import type { LearningLessonResponse, VideoRecord } from '#shared/types/learning'
import { decideLessonAccess, presentVideo } from '../../../utils/learning'
import { getAdminSupabase, getAuthIdentity } from '../../../utils/supabase'

export default defineEventHandler(async (event): Promise<LearningLessonResponse> => {
  const pathSlug = getRouterParam(event, 'pathSlug')
  const lessonSlug = getRouterParam(event, 'lessonSlug')
  const identity = await getAuthIdentity(event)
  const admin = getAdminSupabase(event)

  const { data: path, error: pathError } = await admin
    .from('learning_paths')
    .select('id, slug, title')
    .eq('slug', pathSlug ?? '')
    .eq('state', 'published')
    .maybeSingle()
  if (pathError || !path) {
    throw createError({ statusCode: 404, statusMessage: 'Learning path not found.' })
  }
  const { data: courses, error: courseError } = await admin
    .from('courses')
    .select('id, slug, title, position')
    .eq('path_id', path.id)
    .eq('state', 'published')
    .order('position')
  if (courseError) throw createError({ statusCode: 503, statusMessage: 'Course could not load.' })
  const courseIds = courses.map(({ id }) => id)
  const { data: lessons, error: lessonError } = await admin
    .from('lessons')
    .select(
      'id, course_id, slug, title, summary, estimated_minutes, access_mode, access_explanation, position',
    )
    .in('course_id', courseIds)
    .eq('state', 'published')
    .order('position')
  if (lessonError) throw createError({ statusCode: 503, statusMessage: 'Lessons could not load.' })
  const orderedLessons = courses.flatMap((course) =>
    lessons.filter(({ course_id }) => course_id === course.id),
  )
  const lessonIndex = orderedLessons.findIndex(({ slug }) => slug === lessonSlug)
  const lesson = orderedLessons[lessonIndex]
  if (!lesson) throw createError({ statusCode: 404, statusMessage: 'Lesson not found.' })
  const course = courses.find(({ id }) => id === lesson.course_id)!
  const access = await decideLessonAccess(event, identity?.user.id ?? null, lesson.id)
  const { data: progress, error: progressError } = identity
    ? await admin
        .from('lesson_progress')
        .select('section_position, completed')
        .eq('subject_id', identity.user.id)
        .eq('lesson_id', lesson.id)
        .maybeSingle()
    : { data: null, error: null }
  if (progressError) {
    throw createError({ statusCode: 503, statusMessage: 'Lesson progress could not load.' })
  }

  let sections: LearningLessonResponse['sections'] = []
  if (access.allowed) {
    const { data: sectionRows, error: sectionError } = await admin
      .from('lesson_sections')
      .select('id, section_type, content, media_object_id, video_id, position')
      .eq('lesson_id', lesson.id)
      .order('position')
    if (sectionError) {
      throw createError({ statusCode: 503, statusMessage: 'Lesson sections could not load.' })
    }
    const videoIds = sectionRows.flatMap(({ video_id }) => (video_id ? [video_id] : []))
    const { data: videos, error: videoError } = videoIds.length
      ? await admin.from('videos').select('*').in('id', videoIds).eq('state', 'published')
      : { data: [], error: null }
    if (videoError)
      throw createError({ statusCode: 503, statusMessage: 'Lesson video could not load.' })
    const videoById = new Map<string, VideoRecord>(
      videos.map((video) => [video.id, presentVideo(video)]),
    )
    sections = sectionRows.map((section) => {
      const parsed = lessonSectionSchema.parse({
        ...(section.content as object),
        id: section.id,
        type: section.section_type,
        ...(section.media_object_id ? { mediaId: section.media_object_id } : {}),
        ...(section.video_id ? { videoId: section.video_id } : {}),
      })
      return {
        ...parsed,
        position: section.position,
        ...(section.media_object_id ? { mediaUrl: `/api/learning/media/${section.id}` } : {}),
        ...(section.video_id ? { video: videoById.get(section.video_id) } : {}),
      }
    })
  }

  return {
    path,
    course: { id: course.id, slug: course.slug, title: course.title },
    lesson: {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      estimatedMinutes: lesson.estimated_minutes,
      accessMode: lesson.access_mode,
      accessExplanation: lesson.access_explanation,
      position: lesson.position,
      accessible: access.allowed,
      accessReason: access.reason,
      completed: Boolean(progress?.completed),
    },
    access,
    sections,
    progress: progress
      ? { sectionPosition: progress.section_position, completed: progress.completed }
      : null,
    previousLesson:
      lessonIndex > 0
        ? {
            slug: orderedLessons[lessonIndex - 1]!.slug,
            title: orderedLessons[lessonIndex - 1]!.title,
          }
        : null,
    nextLesson:
      lessonIndex < orderedLessons.length - 1
        ? {
            slug: orderedLessons[lessonIndex + 1]!.slug,
            title: orderedLessons[lessonIndex + 1]!.title,
          }
        : null,
  }
})
