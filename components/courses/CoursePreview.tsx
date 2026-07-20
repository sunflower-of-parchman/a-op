import Link from "next/link";
import styles from "./Courses.module.css";

const PREVIEW_COURSE_COUNT = 2;
const PREVIEW_POST_COUNT = 10;
const PREVIEW_CATEGORY_COUNT = 3;

function previewCourseHref(courseIndex: number) {
  return `/courses/preview-${courseIndex}`;
}

function previewPostHref(courseIndex: number, postIndex: number) {
  return `${previewCourseHref(courseIndex)}/post-${postIndex}`;
}

function categoryKey(index: number) {
  return `category-${((index - 1) % PREVIEW_CATEGORY_COUNT) + 1}`;
}

function accessLabel(index: number) {
  return index <= 5 ? "Public" : "Membership";
}

function previewNumber(value: string, prefix: string, maximum: number) {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(value);
  const number = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : null;
}

function CourseFilmstrip({
  courseIndex,
  currentPost,
}: {
  readonly courseIndex: number;
  readonly currentPost: number | null;
}) {
  return (
    <nav aria-label="Course posts" className={styles.previewFilmstrip}>
      {Array.from({ length: PREVIEW_POST_COUNT }, (_, index) => {
        const postIndex = index + 1;
        return (
          <Link
            aria-current={currentPost === postIndex ? "page" : undefined}
            aria-label={`Open Post ${postIndex} of ${PREVIEW_POST_COUNT}`}
            href={previewPostHref(courseIndex, postIndex)}
            key={postIndex}
          >
            <span aria-hidden="true" />
            <small>{postIndex}</small>
          </Link>
        );
      })}
    </nav>
  );
}

function PreviewPostGrid({
  category,
  courseIndex,
}: {
  readonly category: string | null;
  readonly courseIndex: number;
}) {
  const posts = Array.from({ length: PREVIEW_POST_COUNT }, (_, index) => {
    const postIndex = index + 1;
    return { postIndex, category: categoryKey(postIndex) };
  }).filter((post) => category === null || post.category === category);

  return (
    <ol aria-label="Posts" className={styles.previewPostGrid}>
      {posts.map(({ postIndex }) => (
        <li key={postIndex}>
          <Link href={previewPostHref(courseIndex, postIndex)}>
            <span aria-hidden="true" className={styles.previewPostArtwork} />
            <strong>Post</strong>
            <p>Blurb</p>
            <span className={styles.previewPostMeta}>
              <span>Category</span>
              <span>{accessLabel(postIndex)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function CoursePreviewIndex({
  category,
}: {
  readonly category: string | null;
}) {
  const selectedCategory = /^category-[1-3]$/.test(category ?? "")
    ? category
    : null;

  return (
    <main className={`page-frame ${styles.previewIndex}`}>
      <h1 className="sr-only">Courses</h1>
      <section aria-label="Courses" className={styles.previewCourseGrid}>
        {Array.from({ length: PREVIEW_COURSE_COUNT }, (_, index) => {
          const courseIndex = index + 1;
          return (
            <Link href={previewCourseHref(courseIndex)} key={courseIndex}>
              <span aria-hidden="true" />
              <small>0 of 10 completed</small>
              <strong>Course</strong>
            </Link>
          );
        })}
      </section>

      <section className={styles.previewPosts}>
        <header className={styles.previewCategoryHeader}>
          <nav aria-label="Post categories">
            <Link
              aria-current={selectedCategory === null ? "page" : undefined}
              href="/courses"
            >
              All
            </Link>
            {Array.from({ length: PREVIEW_CATEGORY_COUNT }, (_, index) => (
              <Link
                aria-current={
                  selectedCategory === `category-${index + 1}`
                    ? "page"
                    : undefined
                }
                href={`/courses?category=category-${index + 1}`}
                key={index + 1}
              >
                Category
              </Link>
            ))}
          </nav>
          <p>{selectedCategory ? "Category" : "10 posts"}</p>
        </header>
        <PreviewPostGrid category={selectedCategory} courseIndex={1} />
      </section>
    </main>
  );
}

export function CoursePreviewDetail({
  courseSlug,
}: {
  readonly courseSlug: string;
}) {
  const courseIndex = previewNumber(
    courseSlug,
    "preview",
    PREVIEW_COURSE_COUNT,
  );
  if (courseIndex === null) return null;

  return (
    <main className={styles.previewCourseDetail}>
      <div className={`page-frame ${styles.previewCourseNavigation}`}>
        <Link href="/courses">← Courses</Link>
        <h1>Course</h1>
        <p>0 of 10 completed</p>
        <CourseFilmstrip courseIndex={courseIndex} currentPost={null} />
      </div>
      <section className={`page-frame ${styles.previewCoursePosts}`}>
        <h2>Posts</h2>
        <PreviewPostGrid category={null} courseIndex={courseIndex} />
      </section>
    </main>
  );
}

export function CoursePreviewPost({
  courseSlug,
  postSlug,
}: {
  readonly courseSlug: string;
  readonly postSlug: string;
}) {
  const courseIndex = previewNumber(
    courseSlug,
    "preview",
    PREVIEW_COURSE_COUNT,
  );
  const postIndex = previewNumber(postSlug, "post", PREVIEW_POST_COUNT);
  if (courseIndex === null || postIndex === null) return null;
  const gated = accessLabel(postIndex) === "Membership";

  return (
    <main className={styles.previewPostDetail}>
      <div className={`page-frame ${styles.previewCourseNavigation}`}>
        <Link href={previewCourseHref(courseIndex)}>← Course</Link>
        <h1>Course</h1>
        <p>
          Post {postIndex} of {PREVIEW_POST_COUNT}
        </p>
        <CourseFilmstrip courseIndex={courseIndex} currentPost={postIndex} />
      </div>

      <article>
        <header className={styles.previewPostHero}>
          <div className="page-frame">
            <p>{gated ? "Membership" : "Public"}</p>
            <h2>Post</h2>
            <p>Blurb</p>
          </div>
        </header>
        <div className={`page-frame ${styles.previewPostBody}`}>
          <p>Category</p>
          {gated ? (
            <section className={styles.previewAccessBoundary}>
              <h3>Membership</h3>
              <p>Included with a membership or subscription.</p>
              <Link className="button button-secondary" href="/membership">
                View Membership
              </Link>
            </section>
          ) : (
            <section>
              <h3>Title</h3>
              <p>Blurb</p>
            </section>
          )}
        </div>
      </article>
    </main>
  );
}
