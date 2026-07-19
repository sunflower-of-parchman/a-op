import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeOwnerCondition,
  activePageEditorCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type { EditorialDraftInput } from "@/lib/updates/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface EditorialRow {
  id: string;
  state: "draft" | "published" | "archived";
  revision: number;
}

export interface EditorialDraftResult {
  readonly id: string;
  readonly slug: string;
  readonly revision: number;
  readonly state: "draft";
  readonly created: boolean;
}

export interface EditorialStateResult {
  readonly id: string;
  readonly slug: string;
  readonly revision: number;
  readonly state: "published" | "archived";
}

async function readRow(
  binding: D1Database,
  slug: string,
): Promise<EditorialRow | null> {
  return binding
    .prepare(
      "SELECT id, state, revision FROM editorial_posts WHERE slug = ?1 LIMIT 1",
    )
    .bind(slug)
    .first<EditorialRow>();
}

export async function saveEditorialDraft(
  binding: D1Database,
  input: EditorialDraftInput,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<EditorialDraftResult>> {
  const operation = "editorial.draft.save";
  const mutation = await prepareMutation<EditorialDraftResult>(
    binding,
    operation,
    context,
    { expectedRevision, ...input },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const current = await readRow(binding, input.slug);
  if (!current && expectedRevision !== 0)
    throw staleMutation("editorial draft");
  if (current && current.revision !== expectedRevision) {
    throw staleMutation("editorial draft");
  }
  if (current?.state === "published") {
    throw new RuntimeError(
      "EDITORIAL_PUBLISHED_IMMUTABLE",
      "Published editorial posts are immutable.",
      {
        status: 409,
        publicMessage:
          "Published editorial posts stay frozen. Create a new post for a correction or follow-up.",
      },
    );
  }
  if (current?.state === "archived") {
    throw new RuntimeError(
      "EDITORIAL_ARCHIVED",
      "Archived editorial cannot be edited.",
      {
        status: 409,
        publicMessage: "This editorial post is archived.",
      },
    );
  }
  const postId = current?.id ?? `editorial_${crypto.randomUUID()}`;
  const result: EditorialDraftResult = Object.freeze({
    id: postId,
    slug: input.slug,
    revision: current ? expectedRevision + 1 : 1,
    state: "draft",
    created: current === null,
  });
  const authority = activePageEditorCondition(context.actorUserId, input.slug);
  const write = current
    ? binding
        .prepare(
          `UPDATE editorial_posts
           SET title = ?1, excerpt = ?2, body_json = ?3,
               revision = revision + 1, last_operation_key = ?4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?5 AND revision = ?6 AND state = 'draft'
             AND ${authority.sql}`,
        )
        .bind(
          input.title,
          input.excerpt,
          JSON.stringify(input.body),
          mutation.namespacedKey,
          postId,
          expectedRevision,
          ...authority.bindings,
        )
    : binding
        .prepare(
          `INSERT INTO editorial_posts
            (id, slug, title, excerpt, body_json, state, revision,
             last_operation_key)
           SELECT ?1, ?2, ?3, ?4, ?5, 'draft', 1, ?6
           WHERE NOT EXISTS (SELECT 1 FROM editorial_posts WHERE slug = ?2)
             AND ${authority.sql}`,
        )
        .bind(
          postId,
          input.slug,
          input.title,
          input.excerpt,
          JSON.stringify(input.body),
          mutation.namespacedKey,
          ...authority.bindings,
        );
  const statements = [
    write,
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "editorial-post",
        subjectId: postId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          revision: result.revision,
          created: result.created,
          draftSnapshot: input as unknown as Record<string, unknown>,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM editorial_posts
        WHERE id = ? AND revision = ? AND state = 'draft'
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [postId, result.revision, mutation.namespacedKey, ...authority.bindings],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("editorial draft");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function changeEditorialState(
  binding: D1Database,
  slug: string,
  expectedRevision: number,
  target: "published" | "archived",
  context: MutationContext,
): Promise<MutationResult<EditorialStateResult>> {
  const operation = `editorial.${target === "published" ? "publish" : "archive"}`;
  const mutation = await prepareMutation<EditorialStateResult>(
    binding,
    operation,
    context,
    { slug, expectedRevision },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const current = await readRow(binding, slug);
  if (
    !current ||
    current.revision !== expectedRevision ||
    (target === "published"
      ? current.state !== "draft"
      : current.state === "archived")
  ) {
    throw staleMutation("editorial publication state");
  }
  const authority = activeOwnerCondition(context.actorUserId);
  const result: EditorialStateResult = Object.freeze({
    id: current.id,
    slug,
    revision: expectedRevision + 1,
    state: target,
  });
  const publicationAssignment =
    target === "published" ? ", published_at = CURRENT_TIMESTAMP" : "";
  const requiredState =
    target === "published" ? "state = 'draft'" : "state != 'archived'";
  const statements = [
    binding
      .prepare(
        `UPDATE editorial_posts
         SET state = ?1, revision = revision + 1,
             last_operation_key = ?2, updated_at = CURRENT_TIMESTAMP
             ${publicationAssignment}
         WHERE id = ?3 AND revision = ?4 AND ${requiredState}
           AND ${authority.sql}`,
      )
      .bind(
        target,
        mutation.namespacedKey,
        current.id,
        expectedRevision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "editorial-post",
        subjectId: current.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM editorial_posts
        WHERE id = ? AND revision = ? AND state = ?
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        current.id,
        result.revision,
        target,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1)
      throw staleMutation("editorial publication state");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export function publishEditorialPost(
  binding: D1Database,
  slug: string,
  expectedRevision: number,
  context: MutationContext,
) {
  return changeEditorialState(
    binding,
    slug,
    expectedRevision,
    "published",
    context,
  );
}

export function archiveEditorialPost(
  binding: D1Database,
  slug: string,
  expectedRevision: number,
  context: MutationContext,
) {
  return changeEditorialState(
    binding,
    slug,
    expectedRevision,
    "archived",
    context,
  );
}
