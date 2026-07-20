"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminMediaOption,
  AdminMediaSummary,
  CatalogAccessMode,
  CatalogCreditInput,
  PublicationState,
} from "@/lib/catalog/types.ts";

import styles from "./CatalogAdmin.module.css";
import {
  AccessModeField,
  CatalogStateSummary,
  CreditsEditor,
  MediaReadiness,
  MediaSelector,
} from "./CatalogFormFields";
import {
  CatalogDraftPreview,
  catalogAccessModeLabel,
} from "./CatalogDraftPreview";
import { parseCatalogTags, useCatalogMutation } from "./useCatalogMutation";

export interface TrackWorkspaceInitial {
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string;
  readonly durationMs: number | null;
  readonly meter: string | null;
  readonly tempoBpm: number | null;
  readonly musicalKey: string | null;
  readonly isrc: string | null;
  readonly copyrightNotice: string;
  readonly explicit: boolean;
  readonly viewMode: CatalogAccessMode;
  readonly streamMode: CatalogAccessMode;
  readonly downloadMode: CatalogAccessMode;
  readonly originalMediaId: string | null;
  readonly streamingDerivativeId: string | null;
  readonly downloadDerivativeId: string | null;
  readonly tags: readonly string[];
  readonly credits: readonly CatalogCreditInput[];
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly revision: number;
  readonly created: boolean;
  readonly draftIsPublished: boolean;
}

export interface TrackWorkspaceProps {
  readonly canPublish: boolean;
  readonly canViewMediaStatus: boolean;
  readonly initial: TrackWorkspaceInitial;
  readonly media: readonly AdminMediaSummary[];
  readonly mediaOptions: readonly AdminMediaOption[];
}

export function TrackWorkspace({
  canPublish,
  canViewMediaStatus,
  initial,
  media,
  mediaOptions,
}: TrackWorkspaceProps) {
  const router = useRouter();
  const mutate = useCatalogMutation();
  const [draft, setDraft] = useState({
    slug: initial.slug,
    title: initial.title,
    subtitle: initial.subtitle ?? "",
    description: initial.description,
    durationMs: initial.durationMs === null ? "" : String(initial.durationMs),
    meter: initial.meter ?? "",
    tempoBpm: initial.tempoBpm === null ? "" : String(initial.tempoBpm),
    musicalKey: initial.musicalKey ?? "",
    isrc: initial.isrc ?? "",
    copyrightNotice: initial.copyrightNotice,
    explicit: initial.explicit,
    viewMode: initial.viewMode,
    streamMode: initial.streamMode,
    downloadMode: initial.downloadMode,
    originalMediaId: initial.originalMediaId,
    streamingDerivativeId: initial.streamingDerivativeId,
    downloadDerivativeId: initial.downloadDerivativeId,
    tagsText: initial.tags.join(", "),
    credits: initial.credits,
  });
  const [created, setCreated] = useState(initial.created);
  const [publicationState, setPublicationState] = useState(
    initial.publicationState,
  );
  const [version, setVersion] = useState(initial.version);
  const [revision, setRevision] = useState(initial.revision);
  const [draftIsPublished, setDraftIsPublished] = useState(
    initial.draftIsPublished,
  );
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  function update<K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Saving track draft…");
    try {
      const result = await mutate(
        `/api/admin/music/tracks/${draft.slug}`,
        "PUT",
        {
          expectedVersion: version,
          track: {
            slug: draft.slug,
            title: draft.title,
            subtitle: draft.subtitle || null,
            description: draft.description,
            durationMs:
              draft.durationMs === "" ? null : Number(draft.durationMs),
            meter: draft.meter || null,
            tempoBpm: draft.tempoBpm === "" ? null : Number(draft.tempoBpm),
            musicalKey: draft.musicalKey || null,
            isrc: draft.isrc || null,
            copyrightNotice: draft.copyrightNotice,
            explicit: draft.explicit,
            viewMode: draft.viewMode,
            streamMode: draft.streamMode,
            downloadMode: draft.downloadMode,
            originalMediaId: draft.originalMediaId,
            streamingDerivativeId: draft.streamingDerivativeId,
            downloadDerivativeId: draft.downloadDerivativeId,
            tags: parseCatalogTags(draft.tagsText),
            credits: draft.credits,
          },
        },
      );
      if (typeof result.result?.version !== "number") {
        throw new Error("The track response did not include its new version.");
      }
      const wasCreated = created;
      setVersion(result.result.version);
      if (typeof result.result.revision === "number") {
        setRevision(result.result.revision);
      }
      setCreated(true);
      setDraftIsPublished(false);
      setDirty(false);
      setMessage("Track draft saved. Published music is unchanged.");
      if (!wasCreated) {
        router.replace(`/admin/music/tracks/${draft.slug}`);
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The track draft could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changePublication(action: "publish" | "unpublish") {
    if (dirty) {
      setMessage("Save this draft before changing publication.");
      return;
    }
    setWorking(true);
    setMessage(
      action === "publish" ? "Publishing track…" : "Unpublishing track…",
    );
    try {
      const result = await mutate(
        `/api/admin/music/tracks/${draft.slug}/${action}`,
        "POST",
        { expectedVersion: version },
      );
      if (typeof result.result?.version !== "number") {
        throw new Error(
          "The publication response did not include its new version.",
        );
      }
      setVersion(result.result.version);
      setPublicationState(action === "publish" ? "published" : "draft");
      setDraftIsPublished(action === "publish");
      setMessage(
        action === "publish" ? "Track published." : "Track unpublished.",
      );
      router.refresh();
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

  const archived = publicationState === "archived";

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <p className="eyebrow">Track draft</p>
        <h2>{created ? draft.title : "New track"}</h2>
        <p>
          Save private metadata revisions, connect approved derivatives, then
          publish the exact draft the public catalog should use.
        </p>
        <CatalogStateSummary
          created={created}
          dirty={dirty}
          draftIsPublished={draftIsPublished}
          publicationState={publicationState}
          revision={revision}
          version={version}
        />
      </header>
      <p className={styles.operationMessage} aria-live="polite" role="status">
        {message}
      </p>
      <form className={styles.form} onSubmit={save}>
        <fieldset className={styles.formSection} disabled={working || archived}>
          <legend>Identity and description</legend>
          <div className="field-grid">
            <label className="field-group">
              <span>Slug</span>
              <input
                disabled={created}
                maxLength={80}
                onChange={(event) =>
                  update("slug", event.target.value.toLowerCase())
                }
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                value={draft.slug}
              />
            </label>
            <label className="field-group">
              <span>Title</span>
              <input
                maxLength={160}
                onChange={(event) => update("title", event.target.value)}
                required
                value={draft.title}
              />
            </label>
            <label className="field-group">
              <span>Subtitle</span>
              <input
                maxLength={240}
                onChange={(event) => update("subtitle", event.target.value)}
                value={draft.subtitle}
              />
            </label>
            <label className="field-group">
              <span>Duration in milliseconds</span>
              <input
                min={0}
                onChange={(event) => update("durationMs", event.target.value)}
                type="number"
                value={draft.durationMs}
              />
            </label>
            <label className="field-group">
              <span>Meter</span>
              <input
                maxLength={16}
                onChange={(event) => update("meter", event.target.value)}
                value={draft.meter}
              />
            </label>
            <label className="field-group">
              <span>Tempo in BPM</span>
              <input
                max={1000}
                min={1}
                onChange={(event) => update("tempoBpm", event.target.value)}
                type="number"
                value={draft.tempoBpm}
              />
            </label>
            <label className="field-group">
              <span>Key</span>
              <input
                maxLength={32}
                onChange={(event) => update("musicalKey", event.target.value)}
                value={draft.musicalKey}
              />
            </label>
            <label className="field-group">
              <span>ISRC</span>
              <input
                maxLength={32}
                onChange={(event) => update("isrc", event.target.value)}
                value={draft.isrc}
              />
            </label>
            <label className={styles.checkbox}>
              <input
                checked={draft.explicit}
                onChange={(event) => update("explicit", event.target.checked)}
                type="checkbox"
              />
              <span>Contains explicit material</span>
            </label>
          </div>
          <label className="field-group">
            <span>Description</span>
            <textarea
              maxLength={50000}
              onChange={(event) => update("description", event.target.value)}
              rows={7}
              value={draft.description}
            />
          </label>
          <label className="field-group">
            <span>Copyright notice</span>
            <input
              maxLength={1000}
              onChange={(event) =>
                update("copyrightNotice", event.target.value)
              }
              value={draft.copyrightNotice}
            />
          </label>
          <label className="field-group">
            <span>Tags</span>
            <input
              maxLength={2079}
              onChange={(event) => update("tagsText", event.target.value)}
              value={draft.tagsText}
            />
            <small>Separate tags with commas.</small>
          </label>
        </fieldset>

        <fieldset className={styles.formSection} disabled={working || archived}>
          <legend>Availability</legend>
          <div className={styles.threeColumns}>
            <AccessModeField
              label="Page visibility"
              onChange={(value) => update("viewMode", value)}
              value={draft.viewMode}
            />
            <AccessModeField
              label="Streaming"
              onChange={(value) => update("streamMode", value)}
              value={draft.streamMode}
            />
            <AccessModeField
              label="Download"
              onChange={(value) => update("downloadMode", value)}
              value={draft.downloadMode}
            />
          </div>
        </fieldset>

        <fieldset className={styles.formSection} disabled={working || archived}>
          <legend>Approved media</legend>
          <div className="field-grid">
            <MediaSelector
              allowedKinds={["source"]}
              contentTypePrefix="audio/"
              label="Original audio source"
              onChange={(value) => {
                update("originalMediaId", value);
                if (value !== draft.originalMediaId) {
                  update("streamingDerivativeId", null);
                  update("downloadDerivativeId", null);
                }
              }}
              options={mediaOptions}
              value={draft.originalMediaId}
            />
            <MediaSelector
              allowedKinds={["streaming"]}
              label="Streaming derivative"
              onChange={(value) => update("streamingDerivativeId", value)}
              options={mediaOptions}
              sourceMediaId={draft.originalMediaId}
              value={draft.streamingDerivativeId}
            />
            <MediaSelector
              allowedKinds={["download"]}
              label="Download derivative"
              onChange={(value) => update("downloadDerivativeId", value)}
              options={mediaOptions}
              sourceMediaId={draft.originalMediaId}
              value={draft.downloadDerivativeId}
            />
          </div>
          <MediaReadiness
            canView={canViewMediaStatus}
            media={media}
            selectedIds={[
              draft.originalMediaId,
              draft.streamingDerivativeId,
              draft.downloadDerivativeId,
            ]}
          />
        </fieldset>

        <fieldset className={styles.formSection} disabled={working || archived}>
          <legend>Credits</legend>
          <CreditsEditor
            onChange={(value) => update("credits", value)}
            value={draft.credits}
          />
        </fieldset>

        <CatalogDraftPreview
          availability={[
            {
              label: "Page visibility",
              value: catalogAccessModeLabel(draft.viewMode),
            },
            {
              label: "Streaming",
              value: catalogAccessModeLabel(draft.streamMode),
            },
            {
              label: "Download",
              value: catalogAccessModeLabel(draft.downloadMode),
            },
          ]}
          credits={draft.credits}
          description={draft.description}
          facts={[
            {
              label: "Slug",
              value: draft.slug ? `/${draft.slug}` : "Not entered",
            },
            {
              label: "Duration",
              value: draft.durationMs
                ? `${draft.durationMs} milliseconds`
                : "Not entered",
            },
            { label: "Meter", value: draft.meter || "Not entered" },
            {
              label: "Tempo",
              value: draft.tempoBpm ? `${draft.tempoBpm} BPM` : "Not entered",
            },
            { label: "Key", value: draft.musicalKey || "Not entered" },
            { label: "ISRC", value: draft.isrc || "Not entered" },
            {
              label: "Explicit material",
              value: draft.explicit ? "Yes" : "No",
            },
            {
              label: "Copyright",
              value: draft.copyrightNotice || "Not entered",
            },
            {
              label: "Original source",
              value: draft.originalMediaId || "Not selected",
            },
            {
              label: "Streaming derivative",
              value: draft.streamingDerivativeId || "Not selected",
            },
            {
              label: "Download derivative",
              value: draft.downloadDerivativeId || "Not selected",
            },
          ]}
          id="track-private-draft-preview"
          noun="track"
          subtitle={draft.subtitle}
          tags={parseCatalogTags(draft.tagsText)}
          title={draft.title}
        />

        <div className={styles.publicationActions}>
          <button
            className="button button-primary"
            disabled={working || archived}
            type="submit"
          >
            Save draft
          </button>
          {canPublish && !archived ? (
            <button
              className="button button-secondary"
              disabled={working || !created || dirty}
              onClick={() => changePublication("publish")}
              type="button"
            >
              {publicationState === "published" ? "Publish draft" : "Publish"}
            </button>
          ) : null}
          {canPublish && publicationState === "published" ? (
            <button
              className="text-button"
              disabled={working || dirty}
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
