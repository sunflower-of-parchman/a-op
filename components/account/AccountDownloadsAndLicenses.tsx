import Link from "next/link";
import type { CustomerAccessibleResourceDTO } from "@/lib/customer-access/types.ts";
import type {
  CustomerLicenseHistoryDTO,
  LicenseDocumentDTO,
} from "@/lib/licensing/types.ts";

import styles from "./AccountDownloadsAndLicenses.module.css";

export interface AccountDownloadsProps {
  readonly tracks: readonly CustomerAccessibleResourceDTO[];
}

export interface AccountLicensesProps {
  readonly history: CustomerLicenseHistoryDTO;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function itemLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function documentForLicense(
  documents: readonly LicenseDocumentDTO[],
  licenseId: string,
): LicenseDocumentDTO | null {
  return (
    documents.find((document) => document.issuedLicenseId === licenseId) ?? null
  );
}

export function AccountDownloads({ tracks }: AccountDownloadsProps) {
  return (
    <details className={styles.collection} open>
      <summary className={styles.summary}>
        <span className={styles.heading}>
          <span className={styles.title}>Downloads</span>
          <span className={styles.description}>
            Download tracks available through your purchases and entitlements.
          </span>
        </span>
        <span className={styles.count}>{itemLabel(tracks.length)}</span>
      </summary>

      {tracks.length === 0 ? (
        <p className={styles.empty}>No downloadable tracks yet.</p>
      ) : (
        <ul className={styles.list}>
          {tracks.map((track) => (
            <li className={styles.row} key={track.resource.resourceId}>
              <div className={styles.identity}>
                {track.resource.href ? (
                  <Link href={track.resource.href}>{track.resource.title}</Link>
                ) : (
                  <span>{track.resource.title}</span>
                )}
                <span className={styles.meta}>
                  {track.sources
                    .map((source) => source.explanation)
                    .join(" · ")}
                </span>
              </div>
              {track.downloadUrl ? (
                <a
                  aria-label={`Download ${track.resource.title}`}
                  className="button button-secondary"
                  href={track.downloadUrl}
                >
                  Download
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function AccountLicenses({ history }: AccountLicensesProps) {
  return (
    <details className={styles.collection} open>
      <summary className={styles.summary}>
        <span className={styles.heading}>
          <span className={styles.title}>Licenses</span>
          <span className={styles.description}>
            View generated licenses and download ready PDFs.
          </span>
        </span>
        <span className={styles.count}>
          {itemLabel(history.licenses.length)}
        </span>
      </summary>

      {history.licenses.length === 0 ? (
        <p className={styles.empty}>No licenses have been created yet.</p>
      ) : (
        <ul className={styles.list}>
          {history.licenses.map((license) => {
            const document = documentForLicense(history.documents, license.id);
            const documentReady =
              document?.state === "ready" && license.state === "active";

            return (
              <li className={styles.row} key={license.id}>
                <div className={styles.identity}>
                  <span>{license.termsSnapshot.track.title}</span>
                  <span className={styles.meta}>
                    {license.termsSnapshot.option.label} · Issued{" "}
                    {dateLabel(license.issuedAt)}
                  </span>
                  <span className={styles.reference}>{license.id}</span>
                </div>
                {documentReady ? (
                  <a
                    aria-label={`Download license PDF for ${license.termsSnapshot.track.title}`}
                    className="button button-secondary"
                    href={`/api/licensing/documents/${encodeURIComponent(document.id)}/download`}
                  >
                    Download PDF
                  </a>
                ) : (
                  <span className={styles.documentState}>
                    {document === null
                      ? "PDF not generated"
                      : document.state === "ready"
                        ? "License inactive"
                        : `PDF ${document.state}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
