import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  indexRoute,
  detailRoute,
  lessonRoute,
  courseIndex,
  lessonExperience,
  styles,
] = await Promise.all([
  readFile("app/(public)/courses/page.tsx", "utf8"),
  readFile("app/(public)/courses/[courseSlug]/page.tsx", "utf8"),
  readFile("app/(public)/courses/[courseSlug]/[lessonSlug]/page.tsx", "utf8"),
  readFile("components/courses/CourseIndex.tsx", "utf8"),
  readFile("components/courses/LessonExperience.tsx", "utf8"),
  readFile("components/courses/Courses.module.css", "utf8"),
]);

test("an empty Courses installation keeps the page shell without mock records", () => {
  assert.match(
    indexRoute,
    /requirePublicModulePresentation\(env\.DB, "courses"\)/,
  );
  assert.doesNotMatch(indexRoute, /searchParams|previewCategory/);
  assert.match(courseIndex, /if \(courses\.length === 0\)/);
  assert.match(courseIndex, /No Courses have been published\./);
  assert.match(courseIndex, /<PageHero/);
  assert.doesNotMatch(
    `${indexRoute}\n${courseIndex}`,
    /preview-|CoursePreview|0 of 10|<strong>Post<|<p>Blurb<|>Category</,
  );
});

test("published Course and lesson routes keep durable identity and access checks", () => {
  assert.match(detailRoute, /requireActiveModule\(env\.DB, "courses"\)/);
  assert.match(detailRoute, /readPublishedCourse/);
  assert.match(detailRoute, /resolveApplicationIdentity/);
  assert.match(detailRoute, /if \(!course\) notFound\(\)/);
  assert.doesNotMatch(detailRoute, /CoursePreview|preview-/);

  assert.match(lessonRoute, /requireActiveModule\(env\.DB, "courses"\)/);
  assert.match(lessonRoute, /readPublishedCourseLesson/);
  assert.match(lessonRoute, /resolveApplicationIdentity/);
  assert.match(lessonRoute, /access\.allowed/);
  assert.match(lessonRoute, /LessonExperience/);
  assert.doesNotMatch(lessonRoute, /CoursePreview|preview-|Post \{/);
  assert.match(
    lessonExperience,
    /`\/api\/courses\/\$\{data\.course\.slug\}\/\$\{data\.lesson\.slug\}\/progress`/,
  );
  assert.match(lessonExperience, /method: "PUT"/);
});

test("Courses remains responsive and reduced-motion aware", () => {
  assert.match(styles, /@media \(max-width: 46rem\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
