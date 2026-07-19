"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminMediaOption,
  AdminMediaSummary,
  AdminReleaseTrack,
  AdminTrackOption,
  CatalogAccessMode,
  CatalogCreditInput,
  PublicationState,
  ReleaseTrackInput,
  ReleaseType,
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

const RELEASE_TYPES: readonly { value: ReleaseType; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "ep", label: "EP" },
  { value: "album", label: "Album" },
  { value: "compilation", label: "Compilation" },
  { value: "live", label: "Live" },
  { value: "other", label: "Other" },
];

export interface ReleaseWorkspaceInitial {
  readonly slug: string;
  readonly releaseType: ReleaseType;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string;
  readonly releaseDate: string | null;
  readonly catalogNumber: string | null;
  readonly copyrightNotice: string;
  readonly viewMode: CatalogAccessMode;
  readonly artworkDerivativeId: string | null;
  readonly tags: readonly string[];
  readonly tracks: readonly AdminReleaseTrack[];
  readonly credits: readonly CatalogCreditInput[];
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly revision: number;
  readonly created: boolean;
  readonly draftIsPublished: boolean;
}

export interface ReleaseWorkspaceProps {
  readonly canPublish: boolean;
  readonly canViewMediaStatus: boolean;
  readonly initial: ReleaseWorkspaceInitial;
  readonly media: readonly AdminMediaSummary[];
  readonly mediaOptions: readonly AdminMediaOption[];
  readonly trackOptions: readonly AdminTrackOption[];
}

export function ReleaseWorkspace({
  canPublish,
  canViewMediaStatus,
  initial,
  media,
  mediaOptions,
  trackOptions,
}: ReleaseWorkspaceProps) {
  const router = useRouter();
  const mutate = useCatalogMutation();
  const [draft, setDraft] = useState({
    slug: initial.slug,
    releaseType: initial.releaseType,
    title: initial.title,
    subtitle: initial.subtitle ?? "",
    description: initial.description,
    releaseDate: initial.releaseDate ?? "",
    catalogNumber: initial.catalogNumber ?? "",
    copyrightNotice: initial.copyrightNotice,
    viewMode: initial.viewMode,
    artworkDerivativeId: initial.artworkDerivativeId,
    tagsText: initial.tags.join(", "),
    tracks: initial.tracks.map(({ trackId, discNumber, trackNumber }) => ({
      trackId,
      discNumber,
      trackNumber,
    })) as readonly ReleaseTrackInput[],
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
    setMessage("Saving release draft…");
    try {
      const result = await mutate(
        `/api/admin/music/releases/${draft.slug}`,
        "PUT",
        {
          expectedVersion: version,
          release: {
            slug: draft.slug,
            releaseType: draft.releaseType,
            title: draft.title,
            subtitle: draft.subtitle || null,
            description: draft.description,
            releaseDate: draft.releaseDate || null,
            catalogNumber: draft.catalogNumber || null,
            copyrightNotice: draft.copyrightNotice,
            viewMode: draft.viewMode,
            artworkDerivativeId: draft.artworkDerivativeId,
            tags: parseCatalogTags(draft.tagsText),
            tracks: draft.tracks,
            credits: draft.credits,
          },
        },
      );
      if (typeof result.result?.version !== "number") {
        throw new Error(
          "The release response did not include its new version.",
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
      setMessage("Release draft saved. Published music is unchanged.");
      if (!wasCreated) {
        router.replace(`/admin/music/releases/${draft.slug}`);
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The release draft could not be saved.",
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
      action === "publish" ? "Publishing release…" : "Unpublishing release…",
    );
    try {
      const result = await mutate(
        `/api/admin/music/releases/${draft.slug}/${action}`,
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
        action === "publish" ? "Release published." : "Release unpublished.",
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
        <p className="eyebrow">Release draft</p>
        <h2>{created ? draft.title : "New release"}</h2>
        <p>
          Sequence published tracks, preserve ordered credits, and publish one
          validated release revision to the public catalog.
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
              <span>Release type</span>
              <select
                onChange={(event) =>
                  update("releaseType", event.target.value as ReleaseType)
                }
                value={draft.releaseType}
              >
                {RELEASE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
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
              <span>Release date</span>
              <input
                onChange={(event) => update("releaseDate", event.target.value)}
                type="date"
                value={draft.releaseDate}
              />
            </label>
            <label className="field-group">
              <span>Catalog number</span>
              <input
                maxLength={80}
                onChange={(event) =>
                  update("catalogNumber", event.target.value)
                }
                value={draft.catalogNumber}
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
          <legend>Catalog availability</legend>
          <AccessModeField
            label="Release visibility"
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
            mode="release"
            onChange={(value) =>
              update("tracks", value as readonly ReleaseTrackInput[])
            }
            options={trackOptions}
            releaseValue={draft.tracks}
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
              label: "Release visibility",
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
              label: "Release type",
              value:
                draft.releaseType === "ep"
                  ? "EP"
                  : `${draft.releaseType.charAt(0).toUpperCase()}${draft.releaseType.slice(1)}`,
            },
            {
              label: "Release date",
              value: draft.releaseDate || "Not entered",
            },
            {
              label: "Catalog number",
              value: draft.catalogNumber || "Not entered",
            },
            {
              label: "Copyright",
              value: draft.copyrightNotice || "Not entered",
            },
            {
              label: "Artwork derivative",
              value: draft.artworkDerivativeId || "Not selected",
            },
          ]}
          id="release-private-draft-preview"
          noun="release"
          subtitle={draft.subtitle}
          tags={parseCatalogTags(draft.tagsText)}
          title={draft.title}
          tracks={draft.tracks.map((track) => ({
            title: previewTrackTitles.get(track.trackId) ?? track.trackId,
            detail: `Disc ${track.discNumber} · Track ${track.trackNumber}`,
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
