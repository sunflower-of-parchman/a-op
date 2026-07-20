import type { LicenseAdministrationDTO } from "@/lib/licensing/types.ts";

import styles from "./Licensing.module.css";
import { LicensingMutationControls } from "./LicensingMutationControls";

export interface AdminLicensingProps {
  readonly administration: LicenseAdministrationDTO;
}

function label(value: string): string {
  return value
    .split("_")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function dateTime(value: string | null): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(parsed);
}

function requestUrl(requestId: string, action: string): string {
  return `/api/admin/licensing/requests/${encodeURIComponent(requestId)}/${action}`;
}

function licenseUrl(licenseId: string, action: string): string {
  return `/api/admin/licensing/licenses/${encodeURIComponent(licenseId)}/${action}`;
}

function documentUrl(documentId: string): string {
  return `/api/admin/licensing/documents/${encodeURIComponent(documentId)}/generate`;
}

export function AdminLicensing({ administration }: AdminLicensingProps) {
  const documentById = new Map(
    administration.documents.map(
      (document) => [document.id, document] as const,
    ),
  );

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Licensing</p>
        <h2>Licensing operations</h2>
        <p>
          Operate artist-authored terms, exact intended-use requests, issued
          rights, queued documents, and access history from one connected view.
        </p>
      </header>

      <dl className={styles.summaryList}>
        <div className={styles.summaryItem}>
          <dt>Terms definitions</dt>
          <dd>{administration.terms.length}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>License offers</dt>
          <dd>{administration.offers.length}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Requests</dt>
          <dd>{administration.requests.length}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Issued licenses</dt>
          <dd>{administration.licenses.length}</dd>
        </div>
      </dl>

      <section className={styles.section} aria-labelledby="admin-terms-title">
        <div className={styles.headingGroup}>
          <h3 id="admin-terms-title">Terms authority</h3>
          <p>
            Current artist-authored definitions. Requests and licenses retain
            the exact version active at submission.
          </p>
        </div>
        {administration.terms.length === 0 ? (
          <p className={styles.emptyState}>No licensing terms defined.</p>
        ) : (
          <ol className={styles.recordList}>
            {administration.terms.map((terms) => (
              <li className={styles.recordRow} key={terms.id}>
                <div className={styles.recordIdentity}>
                  <span className={styles.stateLabel}>
                    {label(terms.state)}
                  </span>
                  <h3>{terms.version.title}</h3>
                  <span>{terms.version.name}</span>
                  <span className={styles.recordMeta}>{terms.slug}</span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Current version</span>
                  <strong>{terms.currentVersion}</strong>
                  <span>{terms.version.options.length} options</span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Updated</span>
                  <strong>{dateTime(terms.updatedAt)}</strong>
                  <span>{terms.version.disclaimer}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="admin-offers-title">
        <div className={styles.headingGroup}>
          <h3 id="admin-offers-title">Offers</h3>
          <p>Track, terms, option, and Stripe Test product references.</p>
        </div>
        {administration.offers.length === 0 ? (
          <p className={styles.emptyState}>No license offers defined.</p>
        ) : (
          <ol className={styles.recordList}>
            {administration.offers.map((offer) => (
              <li className={styles.recordRow} key={offer.id}>
                <div className={styles.recordIdentity}>
                  <span className={styles.testLabel}>Test offer</span>
                  <h3>{offer.snapshot.track.title}</h3>
                  <span>{offer.snapshot.option.label}</span>
                  <span className={styles.recordMeta}>{offer.slug}</span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Offer state</span>
                  <strong>{label(offer.state)}</strong>
                  <span>Revision {offer.revision}</span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Frozen source</span>
                  <strong>
                    {offer.snapshot.terms.title} · version{" "}
                    {offer.snapshot.terms.version}
                  </strong>
                  <span>{offer.snapshot.testPrice.currency} test price</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        className={styles.section}
        aria-labelledby="admin-requests-title"
      >
        <div className={styles.headingGroup}>
          <h3 id="admin-requests-title">Intended-use requests</h3>
          <p>
            Approve or reject pending requests. Issue an approved license as an
            owner action when no checkout fulfillment is required.
          </p>
        </div>
        {administration.requests.length === 0 ? (
          <p className={styles.emptyState}>No licensing requests submitted.</p>
        ) : (
          <ol className={styles.recordList}>
            {administration.requests.map((request) => (
              <li className={styles.recordRow} key={request.id}>
                <div className={styles.recordIdentity}>
                  <span className={styles.testLabel}>Test record</span>
                  <h3>{request.termsSnapshot.track.title}</h3>
                  <span>{request.termsSnapshot.option.label}</span>
                  <span className={styles.recordMeta}>
                    {request.intendedUseSnapshot.projectTitle} ·{" "}
                    {request.intendedUseSnapshot.licenseeName}
                  </span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Request state</span>
                  <strong>{label(request.state)}</strong>
                  <span>Revision {request.revision}</span>
                  <span>Customer {request.customerUserId}</span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Exact intended use</span>
                  <strong>{request.intendedUseSnapshot.intendedUse}</strong>
                  <span>
                    Frozen terms version {request.termsSnapshot.terms.version}
                  </span>
                  <span>{request.intendedUseSnapshot.projectDescription}</span>
                </div>
                {request.state === "pending_approval" ? (
                  <div className={styles.recordActions}>
                    <LicensingMutationControls
                      actions={[
                        {
                          label: "Approve request",
                          url: requestUrl(request.id, "approve"),
                        },
                        {
                          label: "Reject request",
                          url: requestUrl(request.id, "reject"),
                        },
                      ]}
                      expectedRevision={request.revision}
                      reasonRequired
                      subjectLabel={`Request ${request.id}`}
                    />
                  </div>
                ) : null}
                {request.state === "approved" ? (
                  <div className={styles.recordActions}>
                    <LicensingMutationControls
                      actions={[
                        {
                          label: "Issue owner-approved license",
                          url: requestUrl(request.id, "issue"),
                        },
                      ]}
                      expectedRevision={request.revision}
                      subjectLabel={`Request ${request.id}`}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="admin-issued-title">
        <div className={styles.headingGroup}>
          <h3 id="admin-issued-title">Issued licenses</h3>
          <p>Active rights and terminal state controls.</p>
        </div>
        {administration.licenses.length === 0 ? (
          <p className={styles.emptyState}>No licenses issued.</p>
        ) : (
          <ol className={styles.recordList}>
            {administration.licenses.map((license) => {
              const terminalActions = [
                {
                  label: "Revoke license",
                  url: licenseUrl(license.id, "revoke"),
                },
                ...(license.expiresAt
                  ? [
                      {
                        label: "Mark license expired",
                        url: licenseUrl(license.id, "expire"),
                      },
                    ]
                  : []),
              ];
              return (
                <li className={styles.recordRow} key={license.id}>
                  <div className={styles.recordIdentity}>
                    <span className={styles.testLabel}>Test record</span>
                    <h3>{license.termsSnapshot.track.title}</h3>
                    <span>{license.termsSnapshot.option.label}</span>
                    <span className={styles.recordMeta}>{license.id}</span>
                  </div>
                  <div className={styles.recordFacts}>
                    <span>License state</span>
                    <strong>{label(license.state)}</strong>
                    <span>Source {label(license.source)}</span>
                    <span>Revision {license.revision}</span>
                  </div>
                  <div className={styles.recordFacts}>
                    <span>Lifecycle</span>
                    <strong>Issued {dateTime(license.issuedAt)}</strong>
                    <span>
                      {license.expiresAt
                        ? `Expires ${dateTime(license.expiresAt)}`
                        : "No fixed expiry"}
                    </span>
                    <span>Customer {license.customerUserId}</span>
                  </div>
                  {license.state === "active" ? (
                    <div className={styles.recordActions}>
                      <LicensingMutationControls
                        actions={terminalActions}
                        expectedRevision={license.revision}
                        reasonRequired
                        subjectLabel={`License ${license.id}`}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section
        className={styles.section}
        aria-labelledby="admin-documents-title"
      >
        <div className={styles.headingGroup}>
          <h3 id="admin-documents-title">Documents and jobs</h3>
          <p>
            Generate each protected text document from its immutable issued
            terms. Durable leases make interrupted jobs safe to retry.
          </p>
        </div>
        {administration.documentJobs.length === 0 ? (
          <p className={styles.emptyState}>No document jobs queued.</p>
        ) : (
          <ol className={styles.recordList}>
            {administration.documentJobs.map((job) => {
              const document = documentById.get(job.licenseDocumentId);
              return (
                <li className={styles.recordRow} key={job.id}>
                  <div className={styles.recordIdentity}>
                    <span className={styles.testLabel}>Test record</span>
                    <h3>License document job</h3>
                    <span className={styles.recordMeta}>{job.id}</span>
                  </div>
                  <div className={styles.recordFacts}>
                    <span>Job state</span>
                    <strong>{label(job.status)}</strong>
                    <span>{job.attempts} attempts</span>
                    <span>{job.failureCategory ?? "No failure"}</span>
                  </div>
                  <div className={styles.recordFacts}>
                    <span>Document state</span>
                    <strong>
                      {document ? label(document.state) : "Unavailable"}
                    </strong>
                    <span>{job.licenseDocumentId}</span>
                    <span>{dateTime(job.updatedAt)}</span>
                    {document?.byteLength ? (
                      <span>{document.byteLength} bytes ready</span>
                    ) : null}
                  </div>
                  {document &&
                  (document.state === "queued" ||
                    document.state === "processing" ||
                    document.state === "failed") ? (
                    <div className={styles.recordActions}>
                      <LicensingMutationControls
                        actions={[
                          {
                            label:
                              document.state === "failed"
                                ? "Retry license document"
                                : document.state === "processing"
                                  ? "Resume license document"
                                  : "Generate license document",
                            url: documentUrl(document.id),
                          },
                        ]}
                        expectedRevision={document.revision}
                        subjectLabel={`License document ${document.id}`}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="admin-events-title">
        <div className={styles.headingGroup}>
          <h3 id="admin-events-title">Operational event history</h3>
          <p>
            Customer, owner, Test fulfillment, and system licensing evidence.
          </p>
        </div>
        {administration.events.length === 0 ? (
          <p className={styles.emptyState}>No licensing events recorded.</p>
        ) : (
          <ol className={styles.timeline}>
            {administration.events.map((event) => (
              <li className={styles.timelineRow} key={event.id}>
                <div className={styles.recordIdentity}>
                  <span className={styles.testLabel}>Test record</span>
                  <h3>{label(event.eventType)}</h3>
                  <span className={styles.recordMeta}>
                    Customer {event.customerUserId} · source{" "}
                    {label(event.source)}
                  </span>
                </div>
                <div className={styles.timelineFacts}>
                  <span>{dateTime(event.createdAt)}</span>
                  <span>
                    {event.licenseRequestId ?? "No request reference"}
                  </span>
                  <span>{event.issuedLicenseId ?? "No license reference"}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default AdminLicensing;
