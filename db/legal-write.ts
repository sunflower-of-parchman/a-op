import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import {
  parseStoredLegalSetupAnswers,
  type LegalDocumentId,
  type LegalDraftInput,
} from "@/lib/legal/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface LegalAggregateRow {
  id: LegalDocumentId;
  draft_version_id: string;
  approved_version_id: string | null;
  published_version_id: string | null;
  current_version: number;
  revision: number;
  draft_approved_at: string | null;
  draft_setup_answers_json: string;
}

interface OwnerRow {
  allowed: number;
}

export interface LegalDraftResult {
  readonly documentId: LegalDocumentId;
  readonly draftVersionId: string;
  readonly version: number;
  readonly revision: number;
  readonly approvedVersionId: null;
  readonly publishedVersionId: string | null;
}

export interface LegalApprovalResult {
  readonly documentId: LegalDocumentId;
  readonly approvedVersionId: string;
  readonly version: number;
  readonly revision: number;
  readonly approvedAt: string;
  readonly publishedVersionId: string | null;
}

export interface LegalPublicationResult {
  readonly documentId: LegalDocumentId;
  readonly publishedVersionId: string;
  readonly version: number;
  readonly revision: number;
  readonly publishedAt: string;
}

async function requireLiveOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT 1 AS allowed WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<OwnerRow>();
  if (row?.allowed === 1) return;
  throw new RuntimeError(
    "LEGAL_OWNER_REQUIRED",
    "Legal document changes require live owner authority.",
    {
      status: 403,
      publicMessage: "Only the active owner can change legal documents.",
    },
  );
}

async function readAggregate(
  binding: D1Database,
  documentId: LegalDocumentId,
): Promise<LegalAggregateRow> {
  const row = await binding
    .prepare(
      `SELECT
         document.id,
         document.draft_version_id,
         document.approved_version_id,
         document.published_version_id,
         document.current_version,
         document.revision,
         draft.approved_at AS draft_approved_at,
         draft.setup_answers_json AS draft_setup_answers_json
       FROM legal_documents AS document
       JOIN legal_document_versions AS draft
         ON draft.id = document.draft_version_id
        AND draft.document_id = document.id
        AND draft.version = document.current_version
       WHERE document.id = ?1
       LIMIT 1`,
    )
    .bind(documentId)
    .first<LegalAggregateRow>();
  if (row) return row;
  throw new RuntimeError(
    "LEGAL_DOCUMENT_NOT_FOUND",
    "The seeded legal document aggregate does not exist.",
    {
      status: 404,
      publicMessage: "That legal document was not found.",
    },
  );
}

function approvalRequired(): never {
  throw new RuntimeError(
    "LEGAL_APPROVAL_REQUIRED",
    "Only the explicitly approved exact draft can be published.",
    {
      status: 409,
      publicMessage: "Approve the current exact draft before publishing it.",
    },
  );
}

export async function saveLegalDocumentDraft(
  binding: D1Database,
  input: LegalDraftInput,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<LegalDraftResult>> {
  await requireLiveOwner(binding, context.actorUserId);
  const operation = "legal-document.draft.save";
  const mutation = await prepareMutation<LegalDraftResult>(
    binding,
    operation,
    context,
    { expectedRevision, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAggregate(binding, input.documentId);
  if (aggregate.revision !== expectedRevision) {
    throw staleMutation("legal document");
  }
  const version = aggregate.current_version + 1;
  const draftVersionId = `legal_${input.documentId}_${crypto.randomUUID()}`;
  const setupAnswersJson = JSON.stringify(input.setupAnswers);
  const result: LegalDraftResult = Object.freeze({
    documentId: input.documentId,
    draftVersionId,
    version,
    revision: expectedRevision + 1,
    approvedVersionId: null,
    publishedVersionId: aggregate.published_version_id,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `INSERT INTO legal_document_versions
          (id, document_id, version, title, introduction, body_text,
           setup_answers_json, created_by_user_id)
         SELECT ?1, document.id, ?2, ?3, ?4, ?5, ?6, ?7
         FROM legal_documents AS document
         WHERE document.id = ?8
           AND document.revision = ?9
           AND document.current_version = ?10
           AND document.draft_version_id = ?11
           AND NOT EXISTS (
             SELECT 1 FROM legal_document_versions AS collision
             WHERE collision.document_id = document.id
               AND collision.version = ?2
           )
           AND ${authority.sql}`,
      )
      .bind(
        draftVersionId,
        version,
        input.title,
        input.introduction,
        input.bodyText,
        setupAnswersJson,
        context.actorUserId,
        input.documentId,
        expectedRevision,
        aggregate.current_version,
        aggregate.draft_version_id,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE legal_documents AS document
         SET title = ?1,
             draft_version_id = ?2,
             approved_version_id = NULL,
             current_version = ?3,
             revision = revision + 1,
             last_operation_key = ?4,
             updated_at = CURRENT_TIMESTAMP
         WHERE document.id = ?5
           AND document.revision = ?6
           AND document.current_version = ?7
           AND document.draft_version_id = ?8
           AND EXISTS (
             SELECT 1 FROM legal_document_versions AS exact_draft
             WHERE exact_draft.id = ?2
               AND exact_draft.document_id = document.id
               AND exact_draft.version = ?3
               AND exact_draft.setup_answers_json = ?9
               AND exact_draft.approved_at IS NULL
           )
           AND ${authority.sql}`,
      )
      .bind(
        input.title,
        draftVersionId,
        version,
        mutation.namespacedKey,
        input.documentId,
        expectedRevision,
        aggregate.current_version,
        aggregate.draft_version_id,
        setupAnswersJson,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "legal-document",
        subjectId: input.documentId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          version,
          title: input.title,
          bodyLength: input.bodyText.length,
          serviceCount: input.setupAnswers.services.length,
          stripeEnvironment: "test",
          realPaymentsAccepted: false,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1
        FROM legal_documents AS document
        JOIN legal_document_versions AS exact_draft
          ON exact_draft.id = document.draft_version_id
         AND exact_draft.document_id = document.id
        WHERE document.id = ?
          AND document.revision = ?
          AND document.current_version = ?
          AND document.draft_version_id = ?
          AND document.approved_version_id IS NULL
          AND document.last_operation_key = ?
          AND exact_draft.setup_answers_json = ?
      ) AND ${authority.sql}`,
      [
        input.documentId,
        result.revision,
        version,
        draftVersionId,
        mutation.namespacedKey,
        setupAnswersJson,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      changedRows(results[2]) !== 1
    ) {
      throw staleMutation("legal document");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function approveLegalDocumentDraft(
  binding: D1Database,
  documentId: LegalDocumentId,
  expectedDraftVersionId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<LegalApprovalResult>> {
  await requireLiveOwner(binding, context.actorUserId);
  const operation = "legal-document.approve";
  const mutation = await prepareMutation<LegalApprovalResult>(
    binding,
    operation,
    context,
    { documentId, expectedDraftVersionId, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAggregate(binding, documentId);
  if (
    aggregate.revision !== expectedRevision ||
    aggregate.draft_version_id !== expectedDraftVersionId
  ) {
    throw staleMutation("legal document approval");
  }
  if (aggregate.draft_approved_at !== null) {
    throw new RuntimeError(
      "LEGAL_ALREADY_APPROVED",
      "The exact legal draft is already approved.",
      {
        status: 409,
        publicMessage: "This exact legal draft is already approved.",
      },
    );
  }
  if (
    parseStoredLegalSetupAnswers(aggregate.draft_setup_answers_json) === null
  ) {
    throw new RuntimeError(
      "LEGAL_SETUP_INCOMPLETE",
      "The legal draft does not contain the complete setup-answer schema.",
      {
        status: 409,
        publicMessage:
          "Save complete guided setup answers before approving this draft.",
      },
    );
  }

  const approvedAt = new Date().toISOString();
  const result: LegalApprovalResult = Object.freeze({
    documentId,
    approvedVersionId: expectedDraftVersionId,
    version: aggregate.current_version,
    revision: expectedRevision + 1,
    approvedAt,
    publishedVersionId: aggregate.published_version_id,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE legal_document_versions AS version
         SET approved_by_user_id = ?1,
             approved_at = ?2
         WHERE version.id = ?3
           AND version.document_id = ?4
           AND version.version = ?5
           AND version.approved_by_user_id IS NULL
           AND version.approved_at IS NULL
           AND version.setup_answers_json = ?6
           AND EXISTS (
             SELECT 1 FROM legal_documents AS document
             WHERE document.id = version.document_id
               AND document.draft_version_id = version.id
               AND document.current_version = version.version
               AND document.revision = ?7
           )
           AND ${authority.sql}`,
      )
      .bind(
        context.actorUserId,
        approvedAt,
        expectedDraftVersionId,
        documentId,
        aggregate.current_version,
        aggregate.draft_setup_answers_json,
        expectedRevision,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE legal_documents AS document
         SET approved_version_id = ?1,
             revision = revision + 1,
             last_operation_key = ?2,
             updated_at = CURRENT_TIMESTAMP
         WHERE document.id = ?3
           AND document.revision = ?4
           AND document.current_version = ?5
           AND document.draft_version_id = ?1
           AND EXISTS (
             SELECT 1 FROM legal_document_versions AS exact_draft
             WHERE exact_draft.id = ?1
               AND exact_draft.document_id = document.id
               AND exact_draft.version = document.current_version
               AND exact_draft.approved_by_user_id = ?6
               AND exact_draft.approved_at = ?7
               AND exact_draft.setup_answers_json = ?8
           )
           AND ${authority.sql}`,
      )
      .bind(
        expectedDraftVersionId,
        mutation.namespacedKey,
        documentId,
        expectedRevision,
        aggregate.current_version,
        context.actorUserId,
        approvedAt,
        aggregate.draft_setup_answers_json,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "legal-document",
        subjectId: documentId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          version: aggregate.current_version,
          approvedVersionId: expectedDraftVersionId,
          artistReviewRequired: true,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1
        FROM legal_documents AS document
        JOIN legal_document_versions AS exact_draft
          ON exact_draft.id = document.approved_version_id
         AND exact_draft.document_id = document.id
        WHERE document.id = ?
          AND document.revision = ?
          AND document.draft_version_id = ?
          AND document.approved_version_id = ?
          AND document.last_operation_key = ?
          AND exact_draft.approved_by_user_id = ?
          AND exact_draft.approved_at = ?
          AND exact_draft.setup_answers_json = ?
      ) AND ${authority.sql}`,
      [
        documentId,
        result.revision,
        expectedDraftVersionId,
        expectedDraftVersionId,
        mutation.namespacedKey,
        context.actorUserId,
        approvedAt,
        aggregate.draft_setup_answers_json,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      changedRows(results[2]) !== 1
    ) {
      throw staleMutation("legal document approval");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function publishLegalDocument(
  binding: D1Database,
  documentId: LegalDocumentId,
  expectedDraftVersionId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<LegalPublicationResult>> {
  await requireLiveOwner(binding, context.actorUserId);
  const operation = "legal-document.publish";
  const mutation = await prepareMutation<LegalPublicationResult>(
    binding,
    operation,
    context,
    { documentId, expectedDraftVersionId, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAggregate(binding, documentId);
  if (
    aggregate.revision !== expectedRevision ||
    aggregate.draft_version_id !== expectedDraftVersionId
  ) {
    throw staleMutation("legal document publication");
  }
  if (
    aggregate.approved_version_id !== expectedDraftVersionId ||
    aggregate.draft_approved_at === null ||
    parseStoredLegalSetupAnswers(aggregate.draft_setup_answers_json) === null
  ) {
    approvalRequired();
  }
  if (aggregate.published_version_id === expectedDraftVersionId) {
    throw new RuntimeError(
      "LEGAL_ALREADY_PUBLISHED",
      "The exact legal draft is already public.",
      {
        status: 409,
        publicMessage: "This exact legal draft is already published.",
      },
    );
  }

  const publishedAt = new Date().toISOString();
  const result: LegalPublicationResult = Object.freeze({
    documentId,
    publishedVersionId: expectedDraftVersionId,
    version: aggregate.current_version,
    revision: expectedRevision + 1,
    publishedAt,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE legal_documents AS document
         SET published_version_id = ?1,
             published_at = ?2,
             revision = revision + 1,
             last_operation_key = ?3,
             updated_at = CURRENT_TIMESTAMP
         WHERE document.id = ?4
           AND document.revision = ?5
           AND document.current_version = ?6
           AND document.draft_version_id = ?1
           AND document.approved_version_id = ?1
           AND (document.published_version_id IS NULL OR document.published_version_id != ?1)
           AND EXISTS (
             SELECT 1 FROM legal_document_versions AS exact_draft
             WHERE exact_draft.id = ?1
               AND exact_draft.document_id = document.id
               AND exact_draft.version = document.current_version
               AND exact_draft.approved_by_user_id IS NOT NULL
               AND exact_draft.approved_at IS NOT NULL
               AND exact_draft.setup_answers_json = ?7
           )
           AND ${authority.sql}`,
      )
      .bind(
        expectedDraftVersionId,
        publishedAt,
        mutation.namespacedKey,
        documentId,
        expectedRevision,
        aggregate.current_version,
        aggregate.draft_setup_answers_json,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "legal-document",
        subjectId: documentId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          version: aggregate.current_version,
          publishedVersionId: expectedDraftVersionId,
          previousPublishedVersionId: aggregate.published_version_id,
          stripeEnvironment: "test",
          realPaymentsAccepted: false,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1
        FROM legal_documents AS document
        JOIN legal_document_versions AS exact_publication
          ON exact_publication.id = document.published_version_id
         AND exact_publication.document_id = document.id
        WHERE document.id = ?
          AND document.revision = ?
          AND document.draft_version_id = ?
          AND document.approved_version_id = ?
          AND document.published_version_id = ?
          AND document.published_at = ?
          AND document.last_operation_key = ?
          AND exact_publication.approved_at IS NOT NULL
          AND exact_publication.setup_answers_json = ?
      ) AND ${authority.sql}`,
      [
        documentId,
        result.revision,
        expectedDraftVersionId,
        expectedDraftVersionId,
        expectedDraftVersionId,
        publishedAt,
        mutation.namespacedKey,
        aggregate.draft_setup_answers_json,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("legal document publication");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
