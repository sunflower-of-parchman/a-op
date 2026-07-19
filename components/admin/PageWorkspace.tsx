"use client";

import { useState, type FormEvent } from "react";
import { MODULE_REGISTRY, type ModuleKey } from "@/lib/modules/index.ts";

export interface PageWorkspaceProps {
  readonly availableSections: readonly PageSectionOption[];
  readonly canChangeStructure: boolean;
  readonly canPublish: boolean;
  readonly initial: {
    readonly slug: string;
    readonly title: string;
    readonly introduction: string;
    readonly bodyText: string;
    readonly sectionRevisionIds: readonly string[];
    readonly moduleKey: ModuleKey | null;
    readonly kind: "standard" | "legal" | "system";
    readonly publicationState: "draft" | "published" | "archived";
    readonly version: number;
    readonly created: boolean;
  };
}

export interface PageSectionOption {
  readonly revisionId: string;
  readonly sectionKey: string;
  readonly revision: number;
  readonly kind: "prose" | "quote" | "callout";
  readonly heading: string;
}

interface PageApiBody {
  result?: {
    version?: number;
    slug?: string;
    publicationState?: "draft" | "published";
  };
  error?: { message?: string };
}

async function pageMutation(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<PageApiBody> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as PageApiBody;
  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "The page change could not be saved.",
    );
  }
  return result;
}

export function PageWorkspace({
  availableSections,
  canChangeStructure,
  canPublish,
  initial,
}: PageWorkspaceProps) {
  const [slug, setSlug] = useState(initial.slug);
  const [title, setTitle] = useState(initial.title);
  const [introduction, setIntroduction] = useState(initial.introduction);
  const [bodyText, setBodyText] = useState(initial.bodyText);
  const [sectionRevisionIds, setSectionRevisionIds] = useState<
    readonly string[]
  >(initial.sectionRevisionIds);
  const [sectionToAdd, setSectionToAdd] = useState("");
  const [moduleKey, setModuleKey] = useState<ModuleKey | null>(
    initial.moduleKey,
  );
  const [kind, setKind] = useState(initial.kind);
  const [version, setVersion] = useState(initial.version);
  const [created, setCreated] = useState(initial.created);
  const [publicationState, setPublicationState] = useState(
    initial.publicationState,
  );
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Saving page draft…");
    try {
      const result = await pageMutation(`/api/admin/pages/${slug}`, "PUT", {
        expectedVersion: version,
        page: {
          slug,
          title,
          introduction,
          bodyText,
          sectionRevisionIds,
          moduleKey,
          kind,
        },
      });
      if (typeof result.result?.version === "number") {
        setVersion(result.result.version);
      }
      setCreated(true);
      setMessage("Page draft saved. Published content is unchanged.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The page draft could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  function addSection() {
    if (!sectionToAdd || sectionRevisionIds.includes(sectionToAdd)) return;
    setSectionRevisionIds((current) => [...current, sectionToAdd]);
    setSectionToAdd("");
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sectionRevisionIds.length) return;
    setSectionRevisionIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeSection(revisionId: string) {
    setSectionRevisionIds((current) =>
      current.filter((candidate) => candidate !== revisionId),
    );
  }

  async function changePublication(action: "publish" | "unpublish") {
    setWorking(true);
    setMessage(
      action === "publish" ? "Publishing page…" : "Unpublishing page…",
    );
    try {
      const result = await pageMutation(
        `/api/admin/pages/${slug}/${action}`,
        "POST",
        { expectedVersion: version },
      );
      if (typeof result.result?.version === "number") {
        setVersion(result.result.version);
      }
      setPublicationState(action === "publish" ? "published" : "draft");
      setMessage(
        action === "publish" ? "Page published." : "Page unpublished.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The publication change could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Page revision</p>
        <h2>{created ? title : "New page"}</h2>
        <p>
          Draft revisions are private until publication. Module-linked pages
          disappear publicly while their module is inactive.
        </p>
      </header>
      <p className="operation-message" aria-live="polite" role="status">
        {message}
      </p>
      <form className="working-form" onSubmit={save}>
        <div className="field-grid">
          <label className="field-group">
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
          <label className="field-group">
            <span>Page kind</span>
            <select
              disabled={!canChangeStructure}
              onChange={(event) =>
                setKind(event.target.value as "standard" | "legal" | "system")
              }
              value={kind}
            >
              <option value="standard">Standard</option>
              <option value="legal">Legal</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="field-group">
            <span>Required module</span>
            <select
              disabled={!canChangeStructure}
              onChange={(event) =>
                setModuleKey(
                  event.target.value === ""
                    ? null
                    : (event.target.value as ModuleKey),
                )
              }
              value={moduleKey ?? ""}
            >
              <option value="">Always active</option>
              {MODULE_REGISTRY.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-group">
          <span>Title</span>
          <input
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <fieldset className="field-group">
          <legend>Reusable content sections</legend>
          <p>
            Each page revision freezes the selected published section revisions
            in this order. A later section edit changes the page only after you
            save a new page revision.
          </p>
          <div className="field-grid">
            <label className="field-group">
              <span>Published section</span>
              <select
                onChange={(event) => setSectionToAdd(event.target.value)}
                value={sectionToAdd}
              >
                <option value="">Choose a section</option>
                {availableSections
                  .filter(
                    ({ revisionId }) =>
                      !sectionRevisionIds.includes(revisionId),
                  )
                  .map((section) => (
                    <option key={section.revisionId} value={section.revisionId}>
                      {section.heading || section.sectionKey} · revision{" "}
                      {section.revision}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button button-secondary"
              disabled={!sectionToAdd}
              onClick={addSection}
              type="button"
            >
              Add section
            </button>
          </div>
          {sectionRevisionIds.length === 0 ? (
            <p>No reusable sections selected.</p>
          ) : (
            <ol className="admin-row-list">
              {sectionRevisionIds.map((revisionId, index) => {
                const section = availableSections.find(
                  (candidate) => candidate.revisionId === revisionId,
                );
                return (
                  <li className="admin-row" key={revisionId}>
                    <div>
                      <strong>
                        {section?.heading ||
                          section?.sectionKey ||
                          "Unavailable section revision"}
                      </strong>
                      <p>
                        {section
                          ? `${section.kind} · revision ${section.revision}`
                          : revisionId}
                      </p>
                    </div>
                    <div className="working-form__actions">
                      <button
                        className="text-button"
                        disabled={index === 0}
                        onClick={() => moveSection(index, -1)}
                        type="button"
                      >
                        Move up
                      </button>
                      <button
                        className="text-button"
                        disabled={index === sectionRevisionIds.length - 1}
                        onClick={() => moveSection(index, 1)}
                        type="button"
                      >
                        Move down
                      </button>
                      <button
                        className="text-button"
                        onClick={() => removeSection(revisionId)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </fieldset>
        <label className="field-group">
          <span>Introduction</span>
          <textarea
            maxLength={2000}
            onChange={(event) => setIntroduction(event.target.value)}
            rows={4}
            value={introduction}
          />
        </label>
        <label className="field-group">
          <span>Body</span>
          <textarea
            maxLength={50000}
            onChange={(event) => setBodyText(event.target.value)}
            rows={10}
            value={bodyText}
          />
        </label>
        <div className="working-form__actions">
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
              onClick={() => changePublication("publish")}
              type="button"
            >
              Publish
            </button>
          ) : null}
          {canPublish && publicationState === "published" ? (
            <button
              className="text-button"
              disabled={working}
              onClick={() => changePublication("unpublish")}
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
