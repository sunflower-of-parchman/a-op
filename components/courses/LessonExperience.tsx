"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  CourseItemView,
  CourseProgressView,
  PublishedCourseLessonView,
} from "@/lib/courses/types.ts";
import styles from "./Courses.module.css";

interface ProgressResponse {
  result?: CourseProgressView;
  error?: { message?: string };
}

function itemBody(item: CourseItemView) {
  if (item.itemType === "text") {
    return <p className={styles.lessonText}>{item.content.text}</p>;
  }
  if (item.itemType === "prompt") {
    return (
      <div className={styles.prompt}>
        <p className="eyebrow">Prompt</p>
        <p className={styles.lessonText}>{item.content.text}</p>
      </div>
    );
  }
  if (!item.mediaUrl) return null;
  return (
    <div className={styles.mediaSurface}>
      {item.content.caption ? (
        <p className={styles.itemCaption}>{item.content.caption}</p>
      ) : null}
      {item.transcriptText ? (
        <details className={styles.transcript} open>
          <summary>Transcript</summary>
          <p>{item.transcriptText}</p>
        </details>
      ) : null}
      {item.itemType === "image" ? (
        <div className={styles.imageFrame}>
          <Image
            alt={item.altText ?? ""}
            fill
            sizes="(max-width: 720px) calc(100vw - 2rem), 56rem"
            src={item.mediaUrl}
            unoptimized
          />
        </div>
      ) : null}
      {item.itemType === "audio" ? (
        <audio controls preload="metadata" src={item.mediaUrl}>
          Your browser does not support audio playback.
        </audio>
      ) : null}
      {item.itemType === "video" ? (
        <video controls preload="metadata" src={item.mediaUrl}>
          Your browser does not support video playback.
        </video>
      ) : null}
      {item.itemType === "download" ? (
        <a className="button button-secondary" href={item.mediaUrl}>
          Download {item.content.filename}
        </a>
      ) : null}
    </div>
  );
}

export function LessonExperience({
  data,
  canTrackProgress,
  signInHref,
}: {
  readonly data: PublishedCourseLessonView;
  readonly canTrackProgress: boolean;
  readonly signInHref: string;
}) {
  const [completedItemKeys, setCompletedItemKeys] = useState<readonly string[]>(
    data.progress?.completedItemKeys ?? [],
  );
  const [lastItemKey, setLastItemKey] = useState<string | null>(
    data.progress?.lastItemKey ?? null,
  );
  const [progressRevision, setProgressRevision] = useState(
    data.progress?.revision ?? 0,
  );
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const itemKeys = useMemo(
    () => data.lesson.items.map(({ itemKey }) => itemKey),
    [data.lesson.items],
  );
  const complete =
    itemKeys.length > 0 &&
    itemKeys.every((key) => completedItemKeys.includes(key));
  const percent =
    itemKeys.length === 0
      ? 0
      : Math.round((completedItemKeys.length / itemKeys.length) * 100);

  async function saveProgress(
    nextCompleted: readonly string[],
    nextLastItemKey: string,
  ) {
    setWorkingKey(nextLastItemKey);
    setMessage("Saving Course progress…");
    const state =
      itemKeys.length > 0 &&
      itemKeys.every((key) => nextCompleted.includes(key))
        ? "completed"
        : "in_progress";
    try {
      const response = await fetch(
        `/api/courses/${data.course.slug}/${data.lesson.slug}/progress`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            expectedProgressRevision: progressRevision,
            progress: {
              courseId: data.course.id,
              courseRevisionId: data.course.revisionId,
              lessonKey: data.lesson.lessonKey,
              completedItemKeys: nextCompleted,
              lastItemKey: nextLastItemKey,
              state,
            },
          }),
        },
      );
      const result = (await response.json()) as ProgressResponse;
      if (!response.ok || !result.result) {
        throw new Error(
          result.error?.message ?? "Course progress could not be saved.",
        );
      }
      setCompletedItemKeys(result.result.completedItemKeys);
      setLastItemKey(result.result.lastItemKey);
      setProgressRevision(result.result.revision);
      setMessage(
        result.result.state === "completed"
          ? "Lesson complete."
          : "Course progress saved.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Course progress could not be saved.",
      );
    } finally {
      setWorkingKey(null);
    }
  }

  return (
    <>
      <header className={`page-frame ${styles.lessonHeader}`}>
        <nav className={styles.breadcrumbs} aria-label="Course breadcrumb">
          <Link href="/courses">Courses</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/courses/${data.course.slug}`}>{data.course.title}</Link>
          <span aria-hidden="true">/</span>
          <span>{data.lesson.title}</span>
        </nav>
        <p className="eyebrow">{data.section.title}</p>
        <h1>{data.lesson.title}</h1>
        {data.lesson.summary ? (
          <p className={styles.lessonIntro}>{data.lesson.summary}</p>
        ) : null}
      </header>
      <div className={`page-frame ${styles.lessonContent}`}>
        {canTrackProgress ? (
          <section
            className={styles.progressSummary}
            aria-label="Lesson progress"
          >
            <div className={styles.sectionHeadingRow}>
              <span>
                {complete ? "Lesson complete" : `${percent}% complete`}
              </span>
              {lastItemKey ? (
                <a className="text-link" href={`#item-${lastItemKey}`}>
                  Resume
                </a>
              ) : null}
            </div>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="Lesson completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <p
              className={styles.operationMessage}
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          </section>
        ) : (
          <div className={styles.accessMessage}>
            <p>
              Sign in with a customer account to save completion and resume
              later.
            </p>
            <Link className="button button-secondary" href={signInHref}>
              Sign in to track progress
            </Link>
          </div>
        )}

        <div className={styles.itemList}>
          {data.lesson.items.map((item) => {
            const itemComplete = completedItemKeys.includes(item.itemKey);
            return (
              <section
                className={styles.lessonItem}
                id={`item-${item.itemKey}`}
                key={item.id}
                aria-labelledby={`item-${item.itemKey}-heading`}
              >
                <p className="eyebrow" id={`item-${item.itemKey}-heading`}>
                  {item.itemType}
                </p>
                {itemBody(item)}
                {canTrackProgress ? (
                  <div className={styles.itemActions}>
                    {itemComplete ? (
                      <span className={styles.itemComplete}>Complete</span>
                    ) : (
                      <button
                        className="button button-primary"
                        disabled={workingKey !== null}
                        onClick={() =>
                          saveProgress(
                            [...completedItemKeys, item.itemKey],
                            item.itemKey,
                          )
                        }
                        type="button"
                      >
                        Mark complete
                      </button>
                    )}
                    {!itemComplete || lastItemKey !== item.itemKey ? (
                      <button
                        className="button button-secondary"
                        disabled={workingKey !== null}
                        onClick={() =>
                          saveProgress(completedItemKeys, item.itemKey)
                        }
                        type="button"
                      >
                        Resume here later
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
