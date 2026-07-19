"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  AdminEditorialPostDTO,
  StructuredTextBlock,
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
      result.error?.message ?? "The editorial change could not be saved.",
    );
  }
  return result;
}

export function EditorialWorkspace({
  initial,
  canPublish,
}: {
  readonly initial: AdminEditorialPostDTO | null;
  readonly canPublish: boolean;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [body, setBody] = useState<readonly StructuredTextBlock[]>(
    initial?.body ?? [{ type: "paragraph", text: "" }],
  );
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [state, setState] = useState(initial?.state ?? "draft");
  const [created, setCreated] = useState(initial !== null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Saving editorial draft…");
    try {
      const result = await mutate(
        `/api/admin/editorial/${encodeURIComponent(slug)}`,
        "PUT",
        {
          expectedRevision: revision,
          editorial: { slug, title, excerpt, body },
        },
      );
      if (typeof result.result?.revision === "number") {
        setRevision(result.result.revision);
      }
      setCreated(true);
      setMessage("Editorial draft saved with an immutable audit snapshot.");
      if (!initial)
        router.replace(`/admin/editorial/${encodeURIComponent(slug)}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The editorial draft could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changeState(action: "publish" | "archive") {
    setWorking(true);
    setMessage(
      action === "publish" ? "Publishing editorial…" : "Archiving editorial…",
    );
    try {
      const result = await mutate(
        `/api/admin/editorial/${encodeURIComponent(slug)}/${action}`,
        "POST",
        { expectedRevision: revision },
      );
      if (typeof result.result?.revision === "number") {
        setRevision(result.result.revision);
      }
      setState(action === "publish" ? "published" : "archived");
      setMessage(
        action === "publish"
          ? "Editorial post published and frozen."
          : "Editorial post archived.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The editorial publication state could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <p className={styles.eyebrow}>Editorial publication</p>
        <h2>{created ? title : "New editorial post"}</h2>
        <p>
          Structured text stays safe as data. Publication freezes the post and
          its complete authored body.
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
            <label className={styles.field}>
              <span>Slug</span>
              <input
                disabled={created}
                maxLength={80}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                value={slug}
              />
            </label>
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
              <span>Excerpt</span>
              <textarea
                maxLength={2000}
                onChange={(event) => setExcerpt(event.target.value)}
                rows={3}
                value={excerpt}
              />
            </label>
            <StructuredBodyEditor blocks={body} onChange={setBody} />
          </div>
        </fieldset>
        <div className={styles.actions}>
          <button
            className="button button-primary"
            disabled={working || state !== "draft"}
            type="submit"
          >
            Save editorial draft
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
              Archive editorial
            </button>
          ) : null}
        </div>
      </form>
      <section className={styles.preview}>
        <p className={styles.eyebrow}>Draft preview</p>
        <h2>{title || "Untitled editorial"}</h2>
        {excerpt ? <p className={styles.summary}>{excerpt}</p> : null}
        <StructuredBody blocks={body} />
      </section>
    </div>
  );
}
