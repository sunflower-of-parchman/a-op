"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  AdminUpdateDTO,
  StructuredTextBlock,
  UpdateAudience,
  UpdateResourceType,
} from "@/lib/updates/types.ts";
import { StructuredBody } from "./StructuredBody";
import { StructuredBodyEditor } from "./StructuredBodyEditor";
import styles from "./Updates.module.css";

interface ApiBody {
  result?: { revision?: number; state?: "draft" | "published" | "archived" };
  error?: { message?: string };
}

async function mutate(url: string, method: "PUT" | "POST", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as ApiBody;
  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "The update change could not be saved.",
    );
  }
  return result;
}

export function UpdateWorkspace({
  initial,
  canPublish,
}: {
  readonly initial: AdminUpdateDTO | null;
  readonly canPublish: boolean;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState<readonly StructuredTextBlock[]>(
    initial?.body ?? [{ type: "paragraph", text: "" }],
  );
  const [audience, setAudience] = useState<UpdateAudience>(
    initial?.audience ?? "public",
  );
  const [resourceType, setResourceType] = useState<UpdateResourceType | "">(
    initial?.resource?.type ?? "",
  );
  const [resourceId, setResourceId] = useState(initial?.resource?.id ?? "");
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [state, setState] = useState(initial?.state ?? "draft");
  const [created, setCreated] = useState(initial !== null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Saving update draft…");
    try {
      const result = await mutate(
        `/api/admin/whats-new/${encodeURIComponent(slug)}`,
        "PUT",
        {
          expectedRevision: revision,
          update: {
            slug,
            title,
            summary,
            body,
            audience,
            resource:
              resourceType && resourceId
                ? { type: resourceType, id: resourceId }
                : null,
          },
        },
      );
      if (typeof result.result?.revision === "number") {
        setRevision(result.result.revision);
      }
      setCreated(true);
      setMessage("Update draft saved with an immutable audit snapshot.");
      if (!initial)
        router.replace(`/admin/whats-new/${encodeURIComponent(slug)}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The update draft could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changeState(action: "publish" | "archive") {
    setWorking(true);
    setMessage(
      action === "publish" ? "Publishing update…" : "Archiving update…",
    );
    try {
      const result = await mutate(
        `/api/admin/whats-new/${encodeURIComponent(slug)}/${action}`,
        "POST",
        { expectedRevision: revision },
      );
      if (typeof result.result?.revision === "number") {
        setRevision(result.result.revision);
      }
      setState(action === "publish" ? "published" : "archived");
      setMessage(
        action === "publish"
          ? "Update published and frozen."
          : "Update archived.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The update publication state could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <p className={styles.eyebrow}>What&apos;s New publication</p>
        <h2>{created ? title : "New update"}</h2>
        <p>
          Draft saves retain immutable audit snapshots. Publication freezes the
          update; corrections and follow-ups become new updates.
        </p>
      </header>
      <p aria-live="polite" className={styles.operation} role="status">
        {message}
      </p>
      <form className={styles.form} onSubmit={save}>
        <fieldset
          className={styles.lockedFields}
          disabled={state !== "draft" || working}
        >
          <div className={styles.form}>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Slug</span>
                <input
                  disabled={created}
                  maxLength={80}
                  onChange={(event) =>
                    setSlug(event.target.value.toLowerCase())
                  }
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  required
                  value={slug}
                />
              </label>
              <label className={styles.field}>
                <span>Audience</span>
                <select
                  onChange={(event) =>
                    setAudience(event.target.value as UpdateAudience)
                  }
                  value={audience}
                >
                  <option value="public">Public</option>
                  <option value="account">Signed-in customers</option>
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <span>Title</span>
              <input
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            </label>
            <label className={styles.field}>
              <span>Summary</span>
              <textarea
                maxLength={2000}
                onChange={(event) => setSummary(event.target.value)}
                rows={3}
                value={summary}
              />
            </label>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Linked resource type</span>
                <select
                  onChange={(event) =>
                    setResourceType(
                      event.target.value as UpdateResourceType | "",
                    )
                  }
                  value={resourceType}
                >
                  <option value="">No linked resource</option>
                  <option value="track">Track</option>
                  <option value="release">Release</option>
                  <option value="collection">Collection</option>
                  <option value="course">Course</option>
                  <option value="video">Video</option>
                  <option value="page">Page</option>
                  <option value="license">License offer</option>
                  <option value="membership">Membership plan</option>
                  <option value="subscription">Subscription plan</option>
                  <option value="order">Test order activity</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Published resource ID</span>
                <input
                  disabled={!resourceType}
                  maxLength={128}
                  onChange={(event) => setResourceId(event.target.value)}
                  required={Boolean(resourceType)}
                  value={resourceId}
                />
              </label>
            </div>
            <StructuredBodyEditor blocks={body} onChange={setBody} />
          </div>
        </fieldset>
        <div className={styles.actions}>
          <button
            className="button button-primary"
            disabled={working || state !== "draft"}
            type="submit"
          >
            Save update draft
          </button>
          {canPublish && state === "draft" ? (
            <button
              className="button button-secondary"
              disabled={working || !created}
              onClick={() => changeState("publish")}
              type="button"
            >
              Publish and freeze
            </button>
          ) : null}
          {canPublish && state !== "archived" && created ? (
            <button
              className={styles.textButton}
              disabled={working}
              onClick={() => changeState("archive")}
              type="button"
            >
              Archive update
            </button>
          ) : null}
        </div>
      </form>
      <section className={styles.preview}>
        <p className={styles.eyebrow}>Draft preview · {audience}</p>
        <h2>{title || "Untitled update"}</h2>
        {summary ? <p className={styles.summary}>{summary}</p> : null}
        <StructuredBody blocks={body} />
      </section>
    </div>
  );
}
