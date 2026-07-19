"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminCollectionTrack,
  AdminMediaOption,
  AdminMediaSummary,
  AdminTrackOption,
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
import { OrderedTrackEditor } from "./OrderedTrackEditor";
import { parseCatalogTags, useCatalogMutation } from "./useCatalogMutation";

export interface CollectionWorkspaceInitial {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly viewMode: CatalogAccessMode;
  readonly artworkDerivativeId: string | null;
  readonly tags: readonly string[];
  readonly tracks: readonly AdminCollectionTrack[];
  readonly credits: readonly CatalogCreditInput[];
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly revision: number;
  readonly created: boolean;
  readonly draftIsPublished: boolean;
}

export interface CollectionWorkspaceProps {
  readonly canPublish: boolean;
  readonly canViewMediaStatus: boolean;
  readonly initial: CollectionWorkspaceInitial;
  readonly media: readonly AdminMediaSummary[];
  readonly mediaOptions: readonly AdminMediaOption[];
  readonly trackOptions: readonly AdminTrackOption[];
}

export function CollectionWorkspace({
  canPublish,
  canViewMediaStatus,
  initial,
  media,
  mediaOptions,
  trackOptions,
}: CollectionWorkspaceProps) {
  const router = useRouter();
  const mutate = useCatalogMutation();
  const [draft, setDraft] = useState({
    slug: initial.slug,
    title: initial.title,
    description: initial.description,
    viewMode: initial.viewMode,
    artworkDerivativeId: initial.artworkDerivativeId,
    tagsText: initial.tags.join(", "),
    trackIds: initial.tracks.map(({ trackId }) => trackId) as readonly string[],
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
    setMessage("Saving collection draft…");
    try {
      const result = await mutate(
        `/api/admin/music/collections/${draft.slug}`,
        "PUT",
        {
          expectedVersion: version,
          collection: {
            slug: draft.slug,
            title: draft.title,
            description: draft.description,
            viewMode: draft.viewMode,
            artworkDerivativeId: draft.artworkDerivativeId,
            tags: parseCatalogTags(draft.tagsText),
            trackIds: draft.trackIds,
            credits: draft.credits,
          },
        },
      );
      if (typeof result.result?.version !== "number") {
        throw new Error(
          "The collection response did not include its new version.",
        );
      }
      const wasCreated = created;
      setVersion(result.result.version);
      if (typeof result.result.revision === "number") {
        setRevision(result.result.revision);
      }
      setCreated(true);
      setDraftIsPublished(false);
      setDirty(false);
      setMessage("Collection draft saved. Published music is unchanged.");
      if (!wasCreated) {
        router.replace(`/admin/music/collections/${draft.slug}`);
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The collection draft could not be saved.",
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
      action === "publish"
        ? "Publishing collection…"
        : "Unpublishing collection…",
    );
    try {
      const result = await mutate(
        `/api/admin/music/collections/${draft.slug}/${action}`,
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
        action === "publish"
          ? "Collection published."
          : "Collection unpublished.",
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
  const previewTrackTitles = new Map<string, string>();
  for (const option of trackOptions) {
    previewTrackTitles.set(option.id, option.title);
  }
  for (const track of initial.tracks) {
    previewTrackTitles.set(track.trackId, track.title);
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <p className="eyebrow">Collection draft</p>
        <h2>{created ? draft.title : "New collection"}</h2>
        <p>
          Arrange published tracks into a public listening collection and keep
          each draft revision separate from its published state.
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
          <legend>Catalog availability</legend>
          <AccessModeField
            label="Collection visibility"
            onChange={(value) => update("viewMode", value)}
            value={draft.viewMode}
          />
          <MediaSelector
            allowedKinds={["artwork"]}
            contentTypePrefix="image/"
            label="Artwork derivative"
            onChange={(value) => update("artworkDerivativeId", value)}
            options={mediaOptions}
            value={draft.artworkDerivativeId}
          />
          <MediaReadiness
            canView={canViewMediaStatus}
            media={media}
            selectedIds={[draft.artworkDerivativeId]}
          />
        </fieldset>

        <fieldset className={styles.formSection} disabled={working || archived}>
          <legend>Track order</legend>
          <OrderedTrackEditor
            initialTracks={initial.tracks}
            mode="collection"
            onChange={(value) => update("trackIds", value as readonly string[])}
            options={trackOptions}
            trackIds={draft.trackIds}
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
              label: "Collection visibility",
              value: catalogAccessModeLabel(draft.viewMode),
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
              label: "Artwork derivative",
              value: draft.artworkDerivativeId || "Not selected",
            },
          ]}
          id="collection-private-draft-preview"
          noun="collection"
          tags={parseCatalogTags(draft.tagsText)}
          title={draft.title}
          tracks={draft.trackIds.map((trackId) => ({
            title: previewTrackTitles.get(trackId) ?? trackId,
          }))}
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
