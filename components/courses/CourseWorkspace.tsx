"use client";

import { useState, type FormEvent } from "react";
import type {
  AdminCourseAccessPlanOption,
  AdminCourseDraft,
  AdminCourseMediaOption,
  CourseDraftInput,
  CourseLessonInput,
  CourseSectionInput,
  LessonItemInput,
  LessonItemType,
} from "@/lib/courses/types.ts";
import styles from "./Courses.module.css";

interface CourseApiResponse {
  result?: {
    courseId?: string;
    version?: number;
    revision?: number;
    publicationState?: "draft" | "published";
  };
  error?: { message?: string };
}

type EditableItem = {
  -readonly [K in keyof LessonItemInput]: LessonItemInput[K];
};
type EditableLesson = Omit<
  { -readonly [K in keyof CourseLessonInput]: CourseLessonInput[K] },
  "items"
> & { items: EditableItem[] };
type EditableSection = Omit<
  { -readonly [K in keyof CourseSectionInput]: CourseSectionInput[K] },
  "lessons"
> & { lessons: EditableLesson[] };
type EditableCourse = Omit<
  { -readonly [K in keyof CourseDraftInput]: CourseDraftInput[K] },
  "sections"
> & { sections: EditableSection[] };

function editableCourse(input: CourseDraftInput): EditableCourse {
  return {
    ...input,
    sections: input.sections.map((section) => ({
      ...section,
      lessons: section.lessons.map((lesson) => ({
        ...lesson,
        items: lesson.items.map((item) => ({
          ...item,
          content: { ...item.content },
        })),
      })),
    })),
  };
}

function generatedKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function newItem(type: LessonItemType = "text"): EditableItem {
  return {
    itemKey: generatedKey("item"),
    itemType: type,
    content: {
      text: "",
      caption: "",
      filename: type === "download" ? "course-download" : null,
    },
    mediaDerivativeId: type === "text" || type === "prompt" ? null : "",
    altText: null,
    transcriptText: null,
  };
}

function newLesson(): EditableLesson {
  const key = generatedKey("lesson");
  return {
    lessonKey: key,
    slug: key,
    title: "New lesson",
    summary: "",
    accessMode: "inherit",
    estimatedMinutes: null,
    items: [newItem()],
  };
}

function newSection(): EditableSection {
  return {
    sectionKey: generatedKey("section"),
    title: "New section",
    description: "",
    lessons: [newLesson()],
  };
}

function move<T>(values: readonly T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= values.length) return [...values];
  const next = [...values];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

async function mutateCourse(
  url: string,
  method: "PUT" | "POST",
  body: unknown,
): Promise<CourseApiResponse> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as CourseApiResponse;
  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "The Course change could not be saved.",
    );
  }
  return result;
}

function mediaMatches(
  type: LessonItemType,
  option: AdminCourseMediaOption,
): boolean {
  if (type === "image") return option.contentType.startsWith("image/");
  if (type === "audio") return option.contentType.startsWith("audio/");
  if (type === "video") return option.contentType.startsWith("video/");
  return type === "download";
}

export function CourseWorkspace({
  initial,
  canPublish,
  media,
  accessPlans,
}: {
  readonly initial: AdminCourseDraft;
  readonly canPublish: boolean;
  readonly media: readonly AdminCourseMediaOption[];
  readonly accessPlans: readonly AdminCourseAccessPlanOption[];
}) {
  const [course, setCourse] = useState<EditableCourse>(() =>
    editableCourse(initial),
  );
  const [courseId, setCourseId] = useState(initial.id);
  const [version, setVersion] = useState(initial.version);
  const [revision, setRevision] = useState(initial.revision);
  const [created, setCreated] = useState(initial.version > 0);
  const [publicationState, setPublicationState] = useState(
    initial.publicationState,
  );
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  function updateSection(index: number, update: Partial<EditableSection>) {
    setCourse((current) => ({
      ...current,
      sections: current.sections.map((section, candidate) =>
        candidate === index ? { ...section, ...update } : section,
      ),
    }));
  }

  function updateLesson(
    sectionIndex: number,
    lessonIndex: number,
    update: Partial<EditableLesson>,
  ) {
    setCourse((current) => ({
      ...current,
      sections: current.sections.map((section, candidateSection) =>
        candidateSection === sectionIndex
          ? {
              ...section,
              lessons: section.lessons.map((lesson, candidateLesson) =>
                candidateLesson === lessonIndex
                  ? { ...lesson, ...update }
                  : lesson,
              ),
            }
          : section,
      ),
    }));
  }

  function updateItem(
    sectionIndex: number,
    lessonIndex: number,
    itemIndex: number,
    update: Partial<EditableItem>,
  ) {
    setCourse((current) => ({
      ...current,
      sections: current.sections.map((section, candidateSection) =>
        candidateSection === sectionIndex
          ? {
              ...section,
              lessons: section.lessons.map((lesson, candidateLesson) =>
                candidateLesson === lessonIndex
                  ? {
                      ...lesson,
                      items: lesson.items.map((item, candidateItem) =>
                        candidateItem === itemIndex
                          ? { ...item, ...update }
                          : item,
                      ),
                    }
                  : lesson,
              ),
            }
          : section,
      ),
    }));
  }

  function changeItemType(
    sectionIndex: number,
    lessonIndex: number,
    itemIndex: number,
    type: LessonItemType,
  ) {
    const current =
      course.sections[sectionIndex].lessons[lessonIndex].items[itemIndex];
    updateItem(sectionIndex, lessonIndex, itemIndex, {
      itemType: type,
      content: {
        ...current.content,
        filename:
          type === "download"
            ? (current.content.filename ?? "course-download")
            : null,
      },
      mediaDerivativeId: type === "text" || type === "prompt" ? null : "",
      altText: type === "image" ? (current.altText ?? "") : null,
      transcriptText:
        type === "audio" || type === "video"
          ? (current.transcriptText ?? "")
          : null,
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Saving Course draft…");
    try {
      const result = await mutateCourse(
        `/api/admin/courses/${course.slug}`,
        "PUT",
        {
          expectedVersion: version,
          course,
        },
      );
      if (typeof result.result?.version === "number")
        setVersion(result.result.version);
      if (typeof result.result?.revision === "number")
        setRevision(result.result.revision);
      if (result.result?.courseId) setCourseId(result.result.courseId);
      setCreated(true);
      setMessage("Course draft saved. Published lessons are unchanged.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The Course draft could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function publication(action: "publish" | "unpublish") {
    setWorking(true);
    setMessage(
      action === "publish" ? "Publishing Course…" : "Unpublishing Course…",
    );
    try {
      const result = await mutateCourse(
        `/api/admin/courses/${course.slug}/${action}`,
        "POST",
        { expectedVersion: version },
      );
      if (typeof result.result?.version === "number")
        setVersion(result.result.version);
      setPublicationState(action === "publish" ? "published" : "draft");
      setMessage(
        action === "publish" ? "Course published." : "Course unpublished.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Publication could not be changed.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.adminWorkspace}>
      <header className={styles.workspaceHeader}>
        <div className={styles.workspaceHeading}>
          <p className="eyebrow">Course revision</p>
          <h2>{created ? course.title : "New Course"}</h2>
          <p className={styles.supporting}>
            Every save creates an immutable nested revision. Publication pins
            the exact access plan and approved media state.
          </p>
          {created ? (
            <p className={styles.supporting}>
              Course ID: <code>{courseId}</code> · draft revision {revision} ·
              version {version}
            </p>
          ) : null}
        </div>
      </header>
      <p className={styles.operationMessage} role="status" aria-live="polite">
        {message}
      </p>
      <form className={styles.adminForm} onSubmit={save}>
        <div className={styles.fieldGrid}>
          <label className={styles.fieldGroup}>
            <span>Slug</span>
            <input
              disabled={created}
              onChange={(event) =>
                setCourse({ ...course, slug: event.target.value.toLowerCase() })
              }
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
              value={course.slug}
            />
          </label>
          <label className={styles.fieldGroup}>
            <span>Access</span>
            <select
              onChange={(event) => {
                const accessMode = event.target
                  .value as EditableCourse["accessMode"];
                setCourse({
                  ...course,
                  accessMode,
                  accessPlanId:
                    accessMode === "protected" ? course.accessPlanId : null,
                  accessPlanRevision:
                    accessMode === "protected"
                      ? course.accessPlanRevision
                      : null,
                });
              }}
              value={course.accessMode}
            >
              <option value="public">Public</option>
              <option value="account">Signed-in account</option>
              <option value="protected">Protected access plan</option>
            </select>
          </label>
          <label className={styles.fieldGroup}>
            <span>Estimated minutes</span>
            <input
              min={1}
              onChange={(event) =>
                setCourse({
                  ...course,
                  estimatedMinutes: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
              type="number"
              value={course.estimatedMinutes ?? ""}
            />
          </label>
        </div>
        {course.accessMode === "protected" ? (
          <label className={styles.fieldGroup}>
            <span>Access plan</span>
            <select
              required
              onChange={(event) => {
                const plan =
                  accessPlans.find(({ id }) => id === event.target.value) ??
                  null;
                setCourse({
                  ...course,
                  accessPlanId: plan?.id ?? null,
                  accessPlanRevision: plan?.revision ?? null,
                });
              }}
              value={course.accessPlanId ?? ""}
            >
              <option value="">Select an active access plan</option>
              {accessPlans
                .filter(({ state }) => state === "active")
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · revision {plan.revision}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <label className={styles.fieldGroup}>
          <span>Title</span>
          <input
            maxLength={160}
            onChange={(event) =>
              setCourse({ ...course, title: event.target.value })
            }
            required
            value={course.title}
          />
        </label>
        <label className={styles.fieldGroup}>
          <span>Description</span>
          <textarea
            maxLength={8000}
            onChange={(event) =>
              setCourse({ ...course, description: event.target.value })
            }
            rows={5}
            value={course.description}
          />
        </label>

        <section aria-labelledby="course-sections-heading">
          <div className={styles.sectionHeadingRow}>
            <div>
              <h3 id="course-sections-heading">Sections and lessons</h3>
              <p className={styles.supporting}>
                Order is saved from top to bottom.
              </p>
            </div>
            <button
              className="button button-secondary"
              onClick={() =>
                setCourse({
                  ...course,
                  sections: [...course.sections, newSection()],
                })
              }
              type="button"
            >
              Add section
            </button>
          </div>
          {course.sections.map((section, sectionIndex) => (
            <section
              className={styles.draftSection}
              key={`${section.sectionKey}-${sectionIndex}`}
            >
              <div className={styles.sectionHeadingRow}>
                <h3>Section {sectionIndex + 1}</h3>
                <div className={styles.rowActions}>
                  <button
                    onClick={() =>
                      setCourse({
                        ...course,
                        sections: move(course.sections, sectionIndex, -1),
                      })
                    }
                    type="button"
                  >
                    Move up
                  </button>
                  <button
                    onClick={() =>
                      setCourse({
                        ...course,
                        sections: move(course.sections, sectionIndex, 1),
                      })
                    }
                    type="button"
                  >
                    Move down
                  </button>
                  <button
                    className={styles.dangerAction}
                    onClick={() =>
                      setCourse({
                        ...course,
                        sections: course.sections.filter(
                          (_, index) => index !== sectionIndex,
                        ),
                      })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className={styles.fieldGrid}>
                <label className={styles.fieldGroup}>
                  <span>Stable section key</span>
                  <input
                    onChange={(event) =>
                      updateSection(sectionIndex, {
                        sectionKey: event.target.value.toLowerCase(),
                      })
                    }
                    required
                    value={section.sectionKey}
                  />
                </label>
                <label className={styles.fieldGroup}>
                  <span>Section title</span>
                  <input
                    onChange={(event) =>
                      updateSection(sectionIndex, { title: event.target.value })
                    }
                    required
                    value={section.title}
                  />
                </label>
              </div>
              <label className={styles.fieldGroup}>
                <span>Section description</span>
                <textarea
                  onChange={(event) =>
                    updateSection(sectionIndex, {
                      description: event.target.value,
                    })
                  }
                  rows={3}
                  value={section.description}
                />
              </label>
              {section.lessons.map((lesson, lessonIndex) => (
                <section
                  className={styles.draftLesson}
                  key={`${lesson.lessonKey}-${lessonIndex}`}
                >
                  <div className={styles.sectionHeadingRow}>
                    <h3>Lesson {lessonIndex + 1}</h3>
                    <div className={styles.rowActions}>
                      <button
                        onClick={() =>
                          updateSection(sectionIndex, {
                            lessons: move(section.lessons, lessonIndex, -1),
                          })
                        }
                        type="button"
                      >
                        Move up
                      </button>
                      <button
                        onClick={() =>
                          updateSection(sectionIndex, {
                            lessons: move(section.lessons, lessonIndex, 1),
                          })
                        }
                        type="button"
                      >
                        Move down
                      </button>
                      <button
                        className={styles.dangerAction}
                        onClick={() =>
                          updateSection(sectionIndex, {
                            lessons: section.lessons.filter(
                              (_, index) => index !== lessonIndex,
                            ),
                          })
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className={styles.fieldGrid}>
                    <label className={styles.fieldGroup}>
                      <span>Stable lesson key</span>
                      <input
                        onChange={(event) =>
                          updateLesson(sectionIndex, lessonIndex, {
                            lessonKey: event.target.value.toLowerCase(),
                          })
                        }
                        required
                        value={lesson.lessonKey}
                      />
                    </label>
                    <label className={styles.fieldGroup}>
                      <span>Lesson slug</span>
                      <input
                        onChange={(event) =>
                          updateLesson(sectionIndex, lessonIndex, {
                            slug: event.target.value.toLowerCase(),
                          })
                        }
                        required
                        value={lesson.slug}
                      />
                    </label>
                    <label className={styles.fieldGroup}>
                      <span>Lesson access</span>
                      <select
                        onChange={(event) =>
                          updateLesson(sectionIndex, lessonIndex, {
                            accessMode: event.target
                              .value as EditableLesson["accessMode"],
                          })
                        }
                        value={lesson.accessMode}
                      >
                        <option value="inherit">Inherit Course</option>
                        <option value="public">Public</option>
                        <option value="account">Signed-in account</option>
                        {course.accessMode === "protected" ? (
                          <option value="protected">
                            Protected by Course plan
                          </option>
                        ) : null}
                      </select>
                    </label>
                  </div>
                  <label className={styles.fieldGroup}>
                    <span>Lesson title</span>
                    <input
                      onChange={(event) =>
                        updateLesson(sectionIndex, lessonIndex, {
                          title: event.target.value,
                        })
                      }
                      required
                      value={lesson.title}
                    />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span>Lesson summary</span>
                    <textarea
                      onChange={(event) =>
                        updateLesson(sectionIndex, lessonIndex, {
                          summary: event.target.value,
                        })
                      }
                      rows={3}
                      value={lesson.summary}
                    />
                  </label>
                  <div className={styles.sectionHeadingRow}>
                    <h3>Lesson items</h3>
                    <button
                      className="button button-secondary"
                      onClick={() =>
                        updateLesson(sectionIndex, lessonIndex, {
                          items: [...lesson.items, newItem()],
                        })
                      }
                      type="button"
                    >
                      Add item
                    </button>
                  </div>
                  {lesson.items.map((item, itemIndex) => (
                    <section
                      className={styles.draftItem}
                      key={`${item.itemKey}-${itemIndex}`}
                    >
                      <div className={styles.sectionHeadingRow}>
                        <h3>Item {itemIndex + 1}</h3>
                        <div className={styles.rowActions}>
                          <button
                            onClick={() =>
                              updateLesson(sectionIndex, lessonIndex, {
                                items: move(lesson.items, itemIndex, -1),
                              })
                            }
                            type="button"
                          >
                            Move up
                          </button>
                          <button
                            onClick={() =>
                              updateLesson(sectionIndex, lessonIndex, {
                                items: move(lesson.items, itemIndex, 1),
                              })
                            }
                            type="button"
                          >
                            Move down
                          </button>
                          <button
                            className={styles.dangerAction}
                            onClick={() =>
                              updateLesson(sectionIndex, lessonIndex, {
                                items: lesson.items.filter(
                                  (_, index) => index !== itemIndex,
                                ),
                              })
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className={styles.fieldGrid}>
                        <label className={styles.fieldGroup}>
                          <span>Stable item key</span>
                          <input
                            onChange={(event) =>
                              updateItem(sectionIndex, lessonIndex, itemIndex, {
                                itemKey: event.target.value.toLowerCase(),
                              })
                            }
                            required
                            value={item.itemKey}
                          />
                        </label>
                        <label className={styles.fieldGroup}>
                          <span>Item type</span>
                          <select
                            onChange={(event) =>
                              changeItemType(
                                sectionIndex,
                                lessonIndex,
                                itemIndex,
                                event.target.value as LessonItemType,
                              )
                            }
                            value={item.itemType}
                          >
                            <option value="text">Text</option>
                            <option value="prompt">Prompt</option>
                            <option value="image">Image</option>
                            <option value="audio">Audio</option>
                            <option value="video">Video</option>
                            <option value="download">Download</option>
                          </select>
                        </label>
                        {item.itemType !== "text" &&
                        item.itemType !== "prompt" ? (
                          <label className={styles.fieldGroup}>
                            <span>Approved media derivative</span>
                            <select
                              onChange={(event) =>
                                updateItem(
                                  sectionIndex,
                                  lessonIndex,
                                  itemIndex,
                                  { mediaDerivativeId: event.target.value },
                                )
                              }
                              required
                              value={item.mediaDerivativeId ?? ""}
                            >
                              <option value="">Select media</option>
                              {media
                                .filter((option) =>
                                  mediaMatches(item.itemType, option),
                                )
                                .map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.id} · {option.contentType}
                                  </option>
                                ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                      {item.itemType === "text" ||
                      item.itemType === "prompt" ? (
                        <label className={styles.fieldGroup}>
                          <span>Text</span>
                          <textarea
                            onChange={(event) =>
                              updateItem(sectionIndex, lessonIndex, itemIndex, {
                                content: {
                                  ...item.content,
                                  text: event.target.value,
                                },
                              })
                            }
                            required
                            rows={6}
                            value={item.content.text}
                          />
                        </label>
                      ) : (
                        <label className={styles.fieldGroup}>
                          <span>Caption</span>
                          <textarea
                            onChange={(event) =>
                              updateItem(sectionIndex, lessonIndex, itemIndex, {
                                content: {
                                  ...item.content,
                                  caption: event.target.value,
                                },
                              })
                            }
                            rows={3}
                            value={item.content.caption}
                          />
                        </label>
                      )}
                      {item.itemType === "image" ? (
                        <label className={styles.fieldGroup}>
                          <span>Alt text</span>
                          <textarea
                            onChange={(event) =>
                              updateItem(sectionIndex, lessonIndex, itemIndex, {
                                altText: event.target.value,
                              })
                            }
                            required
                            rows={3}
                            value={item.altText ?? ""}
                          />
                        </label>
                      ) : null}
                      {item.itemType === "audio" ||
                      item.itemType === "video" ? (
                        <label className={styles.fieldGroup}>
                          <span>Transcript</span>
                          <textarea
                            onChange={(event) =>
                              updateItem(sectionIndex, lessonIndex, itemIndex, {
                                transcriptText: event.target.value,
                              })
                            }
                            required
                            rows={6}
                            value={item.transcriptText ?? ""}
                          />
                        </label>
                      ) : null}
                      {item.itemType === "download" ? (
                        <label className={styles.fieldGroup}>
                          <span>Download filename</span>
                          <input
                            onChange={(event) =>
                              updateItem(sectionIndex, lessonIndex, itemIndex, {
                                content: {
                                  ...item.content,
                                  filename: event.target.value,
                                },
                              })
                            }
                            required
                            value={item.content.filename ?? ""}
                          />
                        </label>
                      ) : null}
                    </section>
                  ))}
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      updateSection(sectionIndex, {
                        lessons: [...section.lessons, newLesson()],
                      })
                    }
                    type="button"
                  >
                    Add lesson
                  </button>
                </section>
              ))}
            </section>
          ))}
        </section>
        <div className={styles.formActions}>
          <button
            className="button button-primary"
            disabled={working}
            type="submit"
          >
            Save draft
          </button>
          {canPublish ? (
            <button
              className="button button-secondary"
              disabled={working || !created}
              onClick={() => publication("publish")}
              type="button"
            >
              Publish
            </button>
          ) : null}
          {canPublish && publicationState === "published" ? (
            <button
              className="button button-secondary"
              disabled={working}
              onClick={() => publication("unpublish")}
              type="button"
            >
              Unpublish
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
