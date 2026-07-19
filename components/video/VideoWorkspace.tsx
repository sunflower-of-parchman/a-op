"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  AdminVideoDraftDTO,
  ExternalVideoProvider,
  VideoCredit,
  VideoTranscriptInput,
} from "@/lib/video/types.ts";
import { ExternalVideoConsent } from "./ExternalVideoConsent";
import styles from "./Video.module.css";

interface ApiBody {
  result?: {
    revision?: number;
    publicationState?: "draft" | "published";
  };
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
      result.error?.message ?? "The video change could not be saved.",
    );
  }
  return result;
}

const EMPTY_CREDIT: VideoCredit = { name: "", role: "", details: "" };
const EMPTY_TRANSCRIPT: VideoTranscriptInput = {
  language: "en",
  transcriptText: "",
  captionsDerivativeId: null,
};

export function VideoWorkspace({
  initial,
  canPublish,
}: {
  readonly initial: AdminVideoDraftDTO | null;
  readonly canPublish: boolean;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.draft.title ?? "");
  const [summary, setSummary] = useState(initial?.draft.summary ?? "");
  const [artistContext, setArtistContext] = useState(
    initial?.draft.artistContext ?? "",
  );
  const [credits, setCredits] = useState<readonly VideoCredit[]>(
    initial?.draft.credits ?? [],
  );
  const [transcripts, setTranscripts] = useState<
    readonly VideoTranscriptInput[]
  >(initial?.draft.transcripts ?? [EMPTY_TRANSCRIPT]);
  const [deliveryKind, setDeliveryKind] = useState<
    "artist_hosted" | "external"
  >(initial?.draft.deliveryKind ?? "external");
  const [posterDerivativeId, setPosterDerivativeId] = useState(
    initial?.draft.posterDerivativeId ?? "",
  );
  const [hostedDerivativeId, setHostedDerivativeId] = useState(
    initial?.draft.hostedDerivativeId ?? "",
  );
  const [externalProvider, setExternalProvider] =
    useState<ExternalVideoProvider>(
      initial?.draft.externalProvider ?? "youtube",
    );
  const [externalEmbedUrl, setExternalEmbedUrl] = useState(
    initial?.draft.externalEmbedUrl ?? "",
  );
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [created, setCreated] = useState(initial !== null);
  const [publicationState, setPublicationState] = useState(
    initial?.publicationState ?? "draft",
  );
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  function updateCredit(
    index: number,
    field: keyof VideoCredit,
    value: string,
  ) {
    setCredits(
      credits.map((credit, creditIndex) =>
        creditIndex === index ? { ...credit, [field]: value } : credit,
      ),
    );
  }

  function updateTranscript(
    index: number,
    field: keyof VideoTranscriptInput,
    value: string,
  ) {
    setTranscripts(
      transcripts.map((transcript, transcriptIndex) =>
        transcriptIndex === index
          ? {
              ...transcript,
              [field]: field === "captionsDerivativeId" ? value || null : value,
            }
          : transcript,
      ),
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Saving immutable video revision…");
    try {
      const result = await mutate(
        `/api/admin/videos/${encodeURIComponent(slug)}`,
        "PUT",
        {
          expectedRevision: revision,
          video: {
            slug,
            title,
            summary,
            artistContext,
            credits,
            deliveryKind,
            posterDerivativeId: posterDerivativeId || null,
            hostedDerivativeId:
              deliveryKind === "artist_hosted"
                ? hostedDerivativeId || null
                : null,
            externalProvider:
              deliveryKind === "external" ? externalProvider : null,
            externalEmbedUrl:
              deliveryKind === "external" ? externalEmbedUrl : null,
            transcripts,
          },
        },
      );
      if (typeof result.result?.revision === "number") {
        setRevision(result.result.revision);
      }
      setCreated(true);
      setMessage("Video revision saved. Published video is unchanged.");
      if (!initial) router.replace(`/admin/videos/${encodeURIComponent(slug)}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The video draft could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changePublication(action: "publish" | "unpublish") {
    setWorking(true);
    setMessage(
      action === "publish" ? "Publishing video…" : "Unpublishing video…",
    );
    try {
      const result = await mutate(
        `/api/admin/videos/${encodeURIComponent(slug)}/${action}`,
        "POST",
        { expectedRevision: revision },
      );
      if (typeof result.result?.revision === "number") {
        setRevision(result.result.revision);
      }
      setPublicationState(action === "publish" ? "published" : "draft");
      setMessage(
        action === "publish" ? "Video published." : "Video unpublished.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The video publication change could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <p className={styles.eyebrow}>Video revisions</p>
        <h2>{created ? title : "New video"}</h2>
        <p>
          Each save creates an immutable revision. Publication freezes the
          selected revision while later draft work stays private.
        </p>
      </header>
      <p aria-live="polite" className={styles.operation} role="status">
        {message}
      </p>
      <form className={styles.form} onSubmit={save}>
        <div className={styles.fieldGrid}>
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
            <span>Delivery</span>
            <select
              onChange={(event) =>
                setDeliveryKind(
                  event.target.value as "artist_hosted" | "external",
                )
              }
              value={deliveryKind}
            >
              <option value="external">External player with consent</option>
              <option value="artist_hosted">Artist-hosted media</option>
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
        <label className={styles.field}>
          <span>Artist context</span>
          <textarea
            maxLength={10000}
            onChange={(event) => setArtistContext(event.target.value)}
            required
            rows={7}
            value={artistContext}
          />
        </label>
        <label className={styles.field}>
          <span>Approved poster derivative ID</span>
          <input
            maxLength={128}
            onChange={(event) => setPosterDerivativeId(event.target.value)}
            value={posterDerivativeId}
          />
        </label>
        {deliveryKind === "artist_hosted" ? (
          <label className={styles.field}>
            <span>Approved hosted-video derivative ID</span>
            <input
              maxLength={128}
              onChange={(event) => setHostedDerivativeId(event.target.value)}
              required
              value={hostedDerivativeId}
            />
          </label>
        ) : (
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>External provider</span>
              <select
                onChange={(event) =>
                  setExternalProvider(
                    event.target.value as ExternalVideoProvider,
                  )
                }
                value={externalProvider}
              >
                <option value="youtube">YouTube</option>
                <option value="vimeo">Vimeo</option>
                <option value="other">Other HTTPS provider</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>HTTPS embed URL</span>
              <input
                maxLength={2048}
                onChange={(event) => setExternalEmbedUrl(event.target.value)}
                required
                type="url"
                value={externalEmbedUrl}
              />
            </label>
          </div>
        )}
        <section>
          <div className={styles.repeatHeading}>
            <h3>Credits</h3>
            <button
              className={styles.textButton}
              onClick={() => setCredits([...credits, EMPTY_CREDIT])}
              type="button"
            >
              Add credit
            </button>
          </div>
          <div className={styles.repeatList}>
            {credits.map((credit, index) => (
              <div className={styles.repeatItem} key={`credit-${index}`}>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Role</span>
                    <input
                      maxLength={120}
                      onChange={(event) =>
                        updateCredit(index, "role", event.target.value)
                      }
                      required
                      value={credit.role}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      maxLength={160}
                      onChange={(event) =>
                        updateCredit(index, "name", event.target.value)
                      }
                      required
                      value={credit.name}
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span>Details</span>
                  <input
                    maxLength={500}
                    onChange={(event) =>
                      updateCredit(index, "details", event.target.value)
                    }
                    value={credit.details}
                  />
                </label>
                <button
                  className={styles.textButton}
                  onClick={() =>
                    setCredits(
                      credits.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  type="button"
                >
                  Remove credit
                </button>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className={styles.repeatHeading}>
            <h3>Transcripts</h3>
            <button
              className={styles.textButton}
              onClick={() => setTranscripts([...transcripts, EMPTY_TRANSCRIPT])}
              type="button"
            >
              Add transcript
            </button>
          </div>
          <div className={styles.repeatList}>
            {transcripts.map((transcript, index) => (
              <div className={styles.repeatItem} key={`transcript-${index}`}>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Language</span>
                    <input
                      maxLength={16}
                      onChange={(event) =>
                        updateTranscript(
                          index,
                          "language",
                          event.target.value.toLowerCase(),
                        )
                      }
                      required
                      value={transcript.language}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Approved captions derivative ID</span>
                    <input
                      maxLength={128}
                      onChange={(event) =>
                        updateTranscript(
                          index,
                          "captionsDerivativeId",
                          event.target.value,
                        )
                      }
                      value={transcript.captionsDerivativeId ?? ""}
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span>Transcript</span>
                  <textarea
                    maxLength={50000}
                    onChange={(event) =>
                      updateTranscript(
                        index,
                        "transcriptText",
                        event.target.value,
                      )
                    }
                    required
                    rows={10}
                    value={transcript.transcriptText}
                  />
                </label>
                <button
                  className={styles.textButton}
                  disabled={transcripts.length === 1}
                  onClick={() =>
                    setTranscripts(
                      transcripts.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  type="button"
                >
                  Remove transcript
                </button>
              </div>
            ))}
          </div>
        </section>
        <div className={styles.actions}>
          <button
            className="button button-primary"
            disabled={working}
            type="submit"
          >
            Save draft revision
          </button>
          {canPublish ? (
            <button
              className="button button-secondary"
              disabled={working || !created}
              onClick={() => changePublication("publish")}
              type="button"
            >
              Publish revision
            </button>
          ) : null}
          {canPublish && publicationState === "published" ? (
            <button
              className={styles.textButton}
              disabled={working}
              onClick={() => changePublication("unpublish")}
              type="button"
            >
              Unpublish video
            </button>
          ) : null}
        </div>
      </form>
      <section className={styles.preview}>
        <p className={styles.eyebrow}>Draft preview</p>
        <h2>{title || "Untitled video"}</h2>
        {summary ? <p className={styles.summary}>{summary}</p> : null}
        {artistContext ? (
          <p className={styles.context}>{artistContext}</p>
        ) : null}
        <div className={styles.transcriptList}>
          {transcripts.map((transcript, index) => (
            <section className={styles.transcript} key={`preview-${index}`}>
              <h3>{transcript.language}</h3>
              <p className={styles.transcriptText}>
                {transcript.transcriptText}
              </p>
            </section>
          ))}
        </div>
        {deliveryKind === "external" && externalEmbedUrl ? (
          <ExternalVideoConsent
            embedUrl={externalEmbedUrl}
            provider={externalProvider}
            title={title || "Draft video"}
            videoId={null}
          />
        ) : (
          <p className={styles.consentCopy}>
            Artist-hosted playback becomes available through the protected
            server route after publication.
          </p>
        )}
      </section>
    </div>
  );
}
