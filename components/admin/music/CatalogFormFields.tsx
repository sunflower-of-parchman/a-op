"use client";

import type {
  AdminMediaOption,
  AdminMediaSummary,
  CatalogAccessMode,
  CatalogCreditInput,
} from "@/lib/catalog/types.ts";

import styles from "./CatalogAdmin.module.css";

const ACCESS_OPTIONS: readonly {
  value: CatalogAccessMode;
  label: string;
}[] = [
  { value: "public", label: "Public" },
  { value: "account", label: "Signed-in account" },
  { value: "protected", label: "Protected access" },
  { value: "unavailable", label: "Unavailable" },
];

export function AccessModeField({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: CatalogAccessMode) => void;
  readonly value: CatalogAccessMode;
}) {
  return (
    <label className="field-group">
      <span>{label}</span>
      <select
        onChange={(event) => onChange(event.target.value as CatalogAccessMode)}
        value={value}
      >
        {ACCESS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MediaSelector({
  allowedKinds,
  contentTypePrefix,
  label,
  onChange,
  options,
  sourceMediaId,
  value,
}: {
  readonly allowedKinds: readonly AdminMediaOption["kind"][];
  readonly contentTypePrefix?: string;
  readonly label: string;
  readonly onChange: (value: string | null) => void;
  readonly options: readonly AdminMediaOption[];
  readonly sourceMediaId?: string | null;
  readonly value: string | null;
}) {
  const available = options.filter(
    (option) =>
      allowedKinds.includes(option.kind) &&
      (contentTypePrefix === undefined ||
        option.contentType?.startsWith(contentTypePrefix) === true) &&
      (sourceMediaId === undefined ||
        (sourceMediaId !== null && option.sourceMediaId === sourceMediaId)),
  );
  const currentIsAvailable =
    value === null || available.some((option) => option.id === value);

  return (
    <label className="field-group">
      <span>{label}</span>
      <select
        onChange={(event) => onChange(event.target.value || null)}
        value={value ?? ""}
      >
        <option value="">No selection</option>
        {!currentIsAvailable && value ? (
          <option value={value}>Current selection · {value}</option>
        ) : null}
        {available.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} · {option.contentType ?? "type pending"}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CreditsEditor({
  onChange,
  value,
}: {
  readonly onChange: (value: readonly CatalogCreditInput[]) => void;
  readonly value: readonly CatalogCreditInput[];
}) {
  function update(index: number, patch: Partial<CatalogCreditInput>) {
    onChange(
      value.map((credit, creditIndex) =>
        creditIndex === index ? { ...credit, ...patch } : credit,
      ),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= value.length) return;
    const next = [...value];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  }

  return (
    <div>
      <div className={styles.creditHeader}>
        <div>
          <h4 className={styles.subheading}>Credits</h4>
          <p className={styles.creditMeta}>
            Credits are published in this order.
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={() =>
            onChange([...value, { name: "", role: "", details: "" }])
          }
          type="button"
        >
          Add credit
        </button>
      </div>
      {value.length === 0 ? (
        <p className={styles.empty}>No credits added.</p>
      ) : (
        <ol className={styles.creditList}>
          {value.map((credit, index) => (
            <li className={styles.creditRow} key={index}>
              <div className={styles.creditFields}>
                <label className="field-group">
                  <span>Name</span>
                  <input
                    maxLength={160}
                    onChange={(event) =>
                      update(index, { name: event.target.value })
                    }
                    required
                    value={credit.name}
                  />
                </label>
                <label className="field-group">
                  <span>Role</span>
                  <input
                    maxLength={120}
                    onChange={(event) =>
                      update(index, { role: event.target.value })
                    }
                    required
                    value={credit.role}
                  />
                </label>
                <label className="field-group">
                  <span>Details</span>
                  <input
                    maxLength={1000}
                    onChange={(event) =>
                      update(index, { details: event.target.value })
                    }
                    value={credit.details}
                  />
                </label>
              </div>
              <div className={styles.rowActions}>
                <button
                  aria-label={`Move credit ${index + 1} up`}
                  className="text-button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  type="button"
                >
                  Move up
                </button>
                <button
                  aria-label={`Move credit ${index + 1} down`}
                  className="text-button"
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                  type="button"
                >
                  Move down
                </button>
                <button
                  aria-label={`Remove credit ${index + 1}`}
                  className="text-button"
                  onClick={() =>
                    onChange(
                      value.filter((_, creditIndex) => creditIndex !== index),
                    )
                  }
                  type="button"
                >
                  Remove credit
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatBytes(value: number | null): string {
  if (value === null) return "Pending";
  if (value < 1000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)} KB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

function readiness(status: string, approvalState: string): string {
  if (approvalState === "rejected") return "rejected";
  if (status === "failed") return "failed";
  if (status === "ready" && approvalState === "approved") return "ready";
  if (approvalState === "pending") return "pending";
  return status;
}

export function MediaReadiness({
  canView,
  media,
  selectedIds,
}: {
  readonly canView: boolean;
  readonly media: readonly AdminMediaSummary[];
  readonly selectedIds: readonly (string | null)[];
}) {
  const selected = new Set(
    selectedIds.filter((value): value is string => !!value),
  );
  const relevant = media.filter(
    (source) =>
      selected.has(source.id) ||
      source.derivatives.some((derivative) => selected.has(derivative.id)),
  );

  if (selected.size === 0) {
    return <p className={styles.empty}>No media selected for this draft.</p>;
  }
  if (!canView || relevant.length === 0) {
    return (
      <p className={styles.empty}>
        Readiness details are unavailable for the current selection.
      </p>
    );
  }

  return (
    <ul className={styles.mediaList}>
      {relevant.map((source) => {
        const sourceReadiness = readiness(source.status, source.approvalState);
        return (
          <li className={styles.mediaRow} key={source.id}>
            <div className={styles.mediaHeader}>
              <div>
                <strong>{source.kind} source</strong>
                <span className={styles.identifier}>{source.id}</span>
              </div>
              <span className={styles.status} data-readiness={sourceReadiness}>
                {source.status} · {source.approvalState}
              </span>
            </div>
            <dl className={styles.mediaFacts}>
              <div>
                <dt>Content type</dt>
                <dd>{source.contentType}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(source.byteLength)}</dd>
              </div>
              <div>
                <dt>Source version</dt>
                <dd>{source.sourceVersion}</dd>
              </div>
              <div>
                <dt>Derivatives</dt>
                <dd>{source.derivatives.length}</dd>
              </div>
            </dl>
            {source.derivatives.length > 0 ? (
              <ul className={styles.derivativeList}>
                {source.derivatives.map((derivative) => {
                  const derivativeReadiness = readiness(
                    derivative.status,
                    derivative.approvalState,
                  );
                  return (
                    <li className={styles.derivativeRow} key={derivative.id}>
                      <div>
                        <strong>{derivative.kind}</strong>
                        <span className={styles.mediaMeta}>
                          {derivative.processingProfile}{" "}
                          {derivative.processingVersion}
                          {derivative.contentType
                            ? ` · ${derivative.contentType}`
                            : ""}
                          {` · ${formatBytes(derivative.byteLength)}`}
                        </span>
                        <span className={styles.identifier}>
                          {derivative.id}
                        </span>
                      </div>
                      <span
                        className={styles.status}
                        data-readiness={derivativeReadiness}
                      >
                        {derivative.status} · {derivative.approvalState}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.supporting}>No derivatives registered.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CatalogStateSummary({
  created,
  dirty,
  draftIsPublished,
  publicationState,
  revision,
  version,
}: {
  readonly created: boolean;
  readonly dirty: boolean;
  readonly draftIsPublished: boolean;
  readonly publicationState: "draft" | "published" | "archived";
  readonly revision: number;
  readonly version: number;
}) {
  return (
    <div className={styles.stateSummary} aria-label="Catalog draft state">
      <span className={styles.status} data-state={publicationState}>
        {publicationState}
      </span>
      <span>Version {version}</span>
      <span>Draft revision {revision}</span>
      {publicationState === "published" ? (
        <span>
          {draftIsPublished
            ? "Published draft current"
            : "Draft waiting for publication"}
        </span>
      ) : (
        <span>
          {publicationState === "archived" ? "Archived" : "Not published"}
        </span>
      )}
      {dirty ? (
        <span>Unsaved changes</span>
      ) : (
        <span>{created ? "Draft saved" : "No saved draft"}</span>
      )}
    </div>
  );
}
