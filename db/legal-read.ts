import { activeOwnerCondition } from "./authority-guards.ts";
import {
  LEGAL_DOCUMENT_IDS,
  parseStoredLegalSetupAnswers,
  type AdminLegalDocumentDTO,
  type LegalAdminWorkspaceDTO,
  type LegalDocumentId,
  type LegalDocumentVersionDTO,
  type PublishedLegalDocumentDTO,
} from "@/lib/legal/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

interface AdminLegalRow {
  document_id: unknown;
  document_title: unknown;
  draft_version_id: unknown;
  approved_version_id: unknown;
  published_version_id: unknown;
  current_version: unknown;
  document_revision: unknown;
  published_at: unknown;
  document_created_at: unknown;
  document_updated_at: unknown;
  version_id: unknown;
  version: unknown;
  version_title: unknown;
  introduction: unknown;
  body_text: unknown;
  setup_answers_json: unknown;
  created_by_user_id: unknown;
  approved_by_user_id: unknown;
  approved_at: unknown;
  version_created_at: unknown;
}

interface PublishedLegalRow {
  document_id: unknown;
  document_title: unknown;
  published_at: unknown;
  published_version_id: unknown;
  version: unknown;
  version_title: unknown;
  introduction: unknown;
  body_text: unknown;
  setup_answers_json: unknown;
  approved_at: unknown;
}

interface OwnerBarrierRow {
  allowed: number;
}

export class LegalReadIntegrityError extends Error {
  override readonly name = "LegalReadIntegrityError";
}

function integrity(message: string): never {
  throw new LegalReadIntegrityError(message);
}

function legalDocumentId(value: unknown): LegalDocumentId {
  if (value !== "privacy" && value !== "terms") {
    integrity("D1 returned an invalid legal document ID.");
  }
  return value;
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function nullableSafeId(value: unknown, label: string): string | null {
  return value === null ? null : safeId(value, label);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") integrity(`D1 returned invalid ${label}.`);
  return value;
}

function nonBlank(value: unknown, label: string): string {
  const result = text(value, label);
  if (result.trim().length === 0) integrity(`D1 returned blank ${label}.`);
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function mapVersion(row: AdminLegalRow): LegalDocumentVersionDTO {
  const approvedByUserId = nullableSafeId(
    row.approved_by_user_id,
    "legal approver ID",
  );
  const approvedAt = nullableTimestamp(row.approved_at, "legal approval time");
  if ((approvedByUserId === null) !== (approvedAt === null)) {
    integrity("D1 returned incomplete legal approval state.");
  }
  return Object.freeze({
    id: safeId(row.version_id, "legal version ID"),
    version: positiveInteger(row.version, "legal version number"),
    title: nonBlank(row.version_title, "legal version title"),
    introduction: text(row.introduction, "legal introduction"),
    bodyText: nonBlank(row.body_text, "legal body"),
    setupAnswers: parseStoredLegalSetupAnswers(row.setup_answers_json),
    createdByUserId: nullableSafeId(row.created_by_user_id, "legal author ID"),
    approvedByUserId,
    approvedAt,
    createdAt: timestamp(row.version_created_at, "legal version creation time"),
  });
}

function mapAdminRows(rows: readonly AdminLegalRow[]): AdminLegalDocumentDTO {
  const first = rows[0];
  if (!first) integrity("D1 returned an empty legal document aggregate.");
  const documentId = legalDocumentId(first.document_id);
  for (const row of rows) {
    if (row.document_id !== documentId) {
      integrity("D1 returned mixed legal document versions.");
    }
  }

  const history = Object.freeze(rows.map(mapVersion));
  const byId = new Map(history.map((version) => [version.id, version]));
  if (byId.size !== history.length) {
    integrity("D1 returned duplicate legal version IDs.");
  }
  const draftVersionId = safeId(first.draft_version_id, "legal draft pointer");
  const approvedVersionId = nullableSafeId(
    first.approved_version_id,
    "approved legal pointer",
  );
  const publishedVersionId = nullableSafeId(
    first.published_version_id,
    "published legal pointer",
  );
  const draft = byId.get(draftVersionId);
  if (!draft) integrity("D1 returned a legal document without its draft.");
  const currentVersion = positiveInteger(
    first.current_version,
    "current legal version",
  );
  if (draft.version !== currentVersion) {
    integrity("D1 returned a legal draft pointer at the wrong version.");
  }
  const approved = approvedVersionId ? byId.get(approvedVersionId) : null;
  if (approvedVersionId && (!approved || approved.approvedAt === null)) {
    integrity("D1 returned an invalid approved legal pointer.");
  }
  const published = publishedVersionId ? byId.get(publishedVersionId) : null;
  const publishedAt = nullableTimestamp(
    first.published_at,
    "legal publication time",
  );
  if (
    (publishedVersionId === null) !== (publishedAt === null) ||
    (publishedVersionId !== null &&
      (!published ||
        published.approvedAt === null ||
        published.setupAnswers === null))
  ) {
    integrity("D1 returned invalid legal publication state.");
  }

  return Object.freeze({
    id: documentId,
    title: nonBlank(first.document_title, "legal document title"),
    revision: positiveInteger(first.document_revision, "legal root revision"),
    currentVersion,
    draft,
    approved: approved ?? null,
    published: published ?? null,
    publishedAt,
    history,
    createdAt: timestamp(first.document_created_at, "legal creation time"),
    updatedAt: timestamp(first.document_updated_at, "legal update time"),
  });
}

const ADMIN_SELECT = `
  SELECT
    document.id AS document_id,
    document.title AS document_title,
    document.draft_version_id,
    document.approved_version_id,
    document.published_version_id,
    document.current_version,
    document.revision AS document_revision,
    document.published_at,
    document.created_at AS document_created_at,
    document.updated_at AS document_updated_at,
    version.id AS version_id,
    version.version,
    version.title AS version_title,
    version.introduction,
    version.body_text,
    version.setup_answers_json,
    version.created_by_user_id,
    version.approved_by_user_id,
    version.approved_at,
    version.created_at AS version_created_at
  FROM legal_documents AS document
  JOIN legal_document_versions AS version
    ON version.document_id = document.id`;

export async function readAdminLegalDocument(
  binding: D1Database,
  documentId: LegalDocumentId,
  actorUserId: string,
): Promise<AdminLegalDocumentDTO | null> {
  const authority = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(
      `${ADMIN_SELECT}
       WHERE document.id = ?1
         AND ${authority.sql}
       ORDER BY version.version DESC`,
    )
    .bind(documentId, ...authority.bindings)
    .all<AdminLegalRow>();
  return result.results.length === 0 ? null : mapAdminRows(result.results);
}

async function requireFinalOwnerBarrier(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT 1 AS allowed WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<OwnerBarrierRow>();
  if (row?.allowed === 1) return;
  throw new RuntimeError(
    "LEGAL_OWNER_REQUIRED",
    "Legal document administration requires live owner authority.",
    {
      status: 403,
      publicMessage: "This account cannot read private legal drafts.",
    },
  );
}

export async function readLegalAdminWorkspace(
  binding: D1Database,
  actorUserId: string,
): Promise<LegalAdminWorkspaceDTO> {
  const documents = await Promise.all(
    LEGAL_DOCUMENT_IDS.map((documentId) =>
      readAdminLegalDocument(binding, documentId, actorUserId),
    ),
  );
  if (documents.some((document) => document === null)) {
    await requireFinalOwnerBarrier(binding, actorUserId);
    integrity("D1 returned an incomplete legal document workspace.");
  }
  await requireFinalOwnerBarrier(binding, actorUserId);
  return Object.freeze({
    documents: Object.freeze(documents as AdminLegalDocumentDTO[]),
  });
}

export async function readPublishedLegalDocument(
  binding: D1Database,
  documentId: LegalDocumentId,
): Promise<PublishedLegalDocumentDTO | null> {
  const row = await binding
    .prepare(
      `SELECT
         document.id AS document_id,
         document.title AS document_title,
         document.published_at,
         document.published_version_id,
         version.version,
         version.title AS version_title,
         version.introduction,
         version.body_text,
         version.setup_answers_json,
         version.approved_at
       FROM legal_documents AS document
       JOIN legal_document_versions AS version
         ON version.id = document.published_version_id
        AND version.document_id = document.id
       WHERE document.id = ?1
         AND document.published_version_id IS NOT NULL
         AND document.published_at IS NOT NULL
         AND version.approved_by_user_id IS NOT NULL
         AND version.approved_at IS NOT NULL
       LIMIT 1`,
    )
    .bind(documentId)
    .first<PublishedLegalRow>();
  if (!row) return null;
  if (parseStoredLegalSetupAnswers(row.setup_answers_json) === null) {
    integrity("D1 returned a published legal version without complete setup.");
  }
  const id = legalDocumentId(row.document_id);
  if (id !== documentId) integrity("D1 returned the wrong legal document.");
  return Object.freeze({
    id,
    title: nonBlank(row.version_title, "published legal title"),
    introduction: text(row.introduction, "published legal introduction"),
    bodyText: nonBlank(row.body_text, "published legal body"),
    version: positiveInteger(row.version, "published legal version"),
    approvedAt: timestamp(row.approved_at, "published legal approval time"),
    publishedAt: timestamp(row.published_at, "legal publication time"),
  });
}
