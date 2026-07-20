import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  indexRoute,
  detailRoute,
  postRoute,
  courseIndex,
  coursePreview,
  lessonExperience,
  styles,
] = await Promise.all([
  readFile("app/(public)/courses/page.tsx", "utf8"),
  readFile("app/(public)/courses/[courseSlug]/page.tsx", "utf8"),
  readFile("app/(public)/courses/[courseSlug]/[lessonSlug]/page.tsx", "utf8"),
  readFile("components/courses/CourseIndex.tsx", "utf8"),
  readFile("components/courses/CoursePreview.tsx", "utf8"),
  readFile("components/courses/LessonExperience.tsx", "utf8"),
  readFile("components/courses/Courses.module.css", "utf8"),
]);

test("an empty Courses installation exposes two UI-only Courses and ten generic Posts", () => {
  assert.match(courseIndex, /if \(courses\.length === 0\)/);
  assert.match(courseIndex, /CoursePreviewIndex/);
  assert.match(coursePreview, /const PREVIEW_COURSE_COUNT = 2/);
  assert.match(coursePreview, /const PREVIEW_POST_COUNT = 10/);
  assert.match(coursePreview, /0 of 10 completed/);
  assert.match(coursePreview, /<strong>Course<\/strong>/);
  assert.match(coursePreview, /<strong>Post<\/strong>/);
  assert.match(coursePreview, /<p>Blurb<\/p>/);
  assert.match(coursePreview, /<span>Category<\/span>/);
  assert.doesNotMatch(
    coursePreview,
    /\.(?:avif|gif|jpe?g|png|svg|webp)|data:image|placeholder|fallback/i,
  );
});

test("Course categories filter the neutral Post collection through shareable URLs", () => {
  assert.match(indexRoute, /searchParams/);
  assert.match(indexRoute, /previewCategory/);
  assert.match(coursePreview, /const PREVIEW_CATEGORY_COUNT = 3/);
  assert.match(coursePreview, /href="\/courses"/);
  assert.match(
    coursePreview,
    /href={`\/courses\?category=category-\$\{index \+ 1\}`}/,
  );
  assert.match(coursePreview, /aria-label="Post categories"/);
  assert.match(
    coursePreview,
    /category === null \|\| post\.category === category/,
  );
});

test("each preview Course has a keyboard-operable ten-Post filmstrip", () => {
  assert.match(coursePreview, /aria-label="Course posts"/);
  assert.match(coursePreview, /aria-current=\{currentPost === postIndex/);
  assert.match(
    coursePreview,
    /aria-label={`Open Post \$\{postIndex\} of \$\{PREVIEW_POST_COUNT\}`}/,
  );
  assert.match(coursePreview, /Post \{postIndex\} of \{PREVIEW_POST_COUNT\}/);
  assert.match(styles, /\.previewFilmstrip\s*\{[^}]*overflow-x: auto/s);
});

test("preview Posts demonstrate public and membership access without bypassing real Course authority", () => {
  assert.match(coursePreview, /index <= 5 \? "Public" : "Membership"/);
  assert.match(coursePreview, /Included with a membership or subscription\./);
  assert.match(coursePreview, /View Membership/);

  assert.match(detailRoute, /readPublishedCourse/);
  assert.match(detailRoute, /resolveApplicationIdentity/);
  assert.match(postRoute, /readPublishedCourseLesson/);
  assert.match(postRoute, /resolveApplicationIdentity/);
  assert.match(postRoute, /access\.allowed/);
  assert.match(postRoute, /LessonExperience/);
  assert.match(
    lessonExperience,
    /`\/api\/courses\/\$\{data\.course\.slug\}\/\$\{data\.lesson\.slug\}\/progress`/,
  );
  assert.match(lessonExperience, /method: "PUT"/);
});

test("preview Course routes stay module-aware and responsive", () => {
  assert.match(detailRoute, /requireActiveModule\(env\.DB, "courses"\)/);
  assert.match(postRoute, /requireActiveModule\(env\.DB, "courses"\)/);
  assert.match(detailRoute, /CoursePreviewDetail/);
  assert.match(postRoute, /CoursePreviewPost/);
  assert.match(
    styles,
    /\.previewCourseGrid\s*\{[^}]*grid-template-columns: repeat\(2,/s,
  );
  assert.match(
    styles,
    /\.previewPostGrid\s*\{[^}]*grid-template-columns: repeat\(3,/s,
  );
  assert.match(
    styles,
    /\.previewCourseGrid,\s*\.previewPostGrid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/s,
  );
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
