"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  AdminContentSectionDTO,
  ContentSectionKind,
  ContentSectionPublicationState,
} from "@/lib/content-sections/types.ts";
import styles from "./ContentSections.module.css";

interface MutationResponse {
  result?: {
    version?: number;
    revision?: number;
    revisionId?: string;
    publishedRevisionId?: string | null;
    publicationState?: ContentSectionPublicationState;
  };
  error?: { message?: string };
}

async function mutate(
  url: string,
  method: "PUT" | "POST",
  body: unknown,
): Promise<MutationResponse> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as MutationResponse;
  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "The content section change could not be saved.",
    );
  }
  return result;
}

export function ContentSectionWorkspace({
  initial,
}: {
  readonly initial: AdminContentSectionDTO | null;
}) {
  const router = useRouter();
  const [sectionKey, setSectionKey] = useState(initial?.sectionKey ?? "");
  const [kind, setKind] = useState<ContentSectionKind>(
    initial?.draft.kind ?? "prose",
  );
  const [heading, setHeading] = useState(initial?.draft.heading ?? "");
  const [bodyText, setBodyText] = useState(initial?.draft.bodyText ?? "");
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [draftRevision, setDraftRevision] = useState(
    initial?.draft.revision ?? 0,
  );
  const [draftRevisionId, setDraftRevisionId] = useState(
    initial?.draft.id ?? null,
  );
  const [publishedRevisionId, setPublishedRevisionId] = useState(
    initial?.published?.id ?? null,
  );
  const [publicationState, setPublicationState] =
    useState<ContentSectionPublicationState>(
      initial?.publicationState ?? "draft",
    );
  const [created, setCreated] = useState(initial !== null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Saving a new immutable draft revision…");
    try {
      const result = await mutate(
        `/api/admin/content-sections/${encodeURIComponent(sectionKey)}`,
        "PUT",
        {
          expectedVersion: version,
          section: { sectionKey, kind, heading, bodyText },
        },
      );
      if (typeof result.result?.version === "number") {
        setVersion(result.result.version);
      }
      if (typeof result.result?.revision === "number") {
        setDraftRevision(result.result.revision);
      }
      if (typeof result.result?.revisionId === "string") {
        setDraftRevisionId(result.result.revisionId);
      }
      if (
        result.result?.publicationState === "draft" ||
        result.result?.publicationState === "published"
      ) {
        setPublicationState(result.result.publicationState);
      }
      setCreated(true);
      setMessage("Draft revision saved. Existing revisions remain frozen.");
      if (!initial) {
        router.replace(
          `/admin/content-sections/${encodeURIComponent(sectionKey)}`,
        );
      }
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The content section draft could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changeState(action: "publish" | "archive") {
    setWorking(true);
    setMessage(
      action === "publish"
        ? "Publishing the exact current draft revision…"
        : "Archiving the content section…",
    );
    try {
      const result = await mutate(
        `/api/admin/content-sections/${encodeURIComponent(
          sectionKey,
        )}/${action}`,
        "POST",
        { expectedVersion: version },
      );
      if (typeof result.result?.version === "number") {
        setVersion(result.result.version);
      }
      if (action === "publish") {
        setPublicationState("published");
        setPublishedRevisionId(
          typeof result.result?.publishedRevisionId === "string"
            ? result.result.publishedRevisionId
            : draftRevisionId,
        );
        setMessage(
          "Current draft published. Pages can now pin this exact revision.",
        );
      } else {
        setPublicationState("archived");
        setMessage("Content section archived and frozen.");
      }
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The content section state could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  const hasUnpublishedDraft = draftRevisionId !== publishedRevisionId;

  return (
    <div className={styles.workspace}>
      <header className={styles.headingGroup}>
        <p className={styles.eyebrow}>Reusable page composition</p>
        <h2>{created ? heading || sectionKey : "New content section"}</h2>
        <p>
          The section key stays stable. Every save creates a new immutable
          revision, and publication exposes only the selected revision to page
          composition.
        </p>
      </header>

      <dl className={styles.workspaceFacts}>
        <div>
          <dt>Root version</dt>
          <dd>{version || "Not saved"}</dd>
        </div>
        <div>
          <dt>Current draft</dt>
          <dd>{draftRevision ? `Revision ${draftRevision}` : "Not saved"}</dd>
        </div>
        <div>
          <dt>Publication</dt>
          <dd>{publicationState}</dd>
        </div>
      </dl>

      <p aria-live="polite" className={styles.operation} role="status">
        {message}
      </p>

      <form className={styles.form} onSubmit={save}>
        <fieldset
          className={styles.fieldset}
          disabled={publicationState === "archived" || working}
        >
          <div className={styles.formFields}>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Section key</span>
                <input
                  disabled={created}
                  maxLength={80}
                  onChange={(event) =>
                    setSectionKey(event.target.value.toLowerCase())
                  }
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  required
                  value={sectionKey}
                />
              </label>
              <label className={styles.field}>
                <span>Section kind</span>
                <select
                  onChange={(event) =>
                    setKind(event.target.value as ContentSectionKind)
                  }
                  value={kind}
                >
                  <option value="prose">Prose</option>
                  <option value="quote">Quote</option>
                  <option value="callout">Callout</option>
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <span>Heading</span>
              <input
                maxLength={160}
                onChange={(event) => setHeading(event.target.value)}
                value={heading}
              />
            </label>
            <label className={styles.field}>
              <span>Body</span>
              <textarea
                maxLength={20000}
                onChange={(event) => setBodyText(event.target.value)}
                required
                rows={12}
                value={bodyText}
              />
            </label>
          </div>
        </fieldset>

        <div className={styles.actions}>
          <button
            className="button button-primary"
            disabled={working || publicationState === "archived"}
            type="submit"
          >
            Save new draft revision
          </button>
          {created && publicationState !== "archived" ? (
            <button
              className="button button-secondary"
              disabled={working || !hasUnpublishedDraft}
              onClick={() => changeState("publish")}
              type="button"
            >
              Publish current revision
            </button>
          ) : null}
          {created && publicationState !== "archived" ? (
            <button
              className={styles.textButton}
              disabled={working}
              onClick={() => changeState("archive")}
              type="button"
            >
              Archive section
            </button>
          ) : null}
        </div>
      </form>

      <section className={styles.preview} data-kind={kind}>
        <p className={styles.eyebrow}>Current draft preview · {kind}</p>
        {heading ? <h3>{heading}</h3> : null}
        {kind === "quote" ? (
          <blockquote>{bodyText || "Draft body"}</blockquote>
        ) : (
          <p>{bodyText || "Draft body"}</p>
        )}
      </section>
    </div>
  );
}
