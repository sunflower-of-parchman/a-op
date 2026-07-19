import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeCustomerCondition,
  activeOwnerCondition,
  activePageEditorCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import { prepareServerTelemetryEvent } from "./telemetry-server.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type {
  UpdateDraftInput,
  UpdateResourceType,
} from "@/lib/updates/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface UpdateAggregateRow {
  id: string;
  state: "draft" | "published" | "archived";
  revision: number;
  resource_type: UpdateResourceType | null;
  resource_id: string | null;
}

interface ExistsRow {
  present: number;
}

export interface UpdateDraftResult {
  readonly id: string;
  readonly slug: string;
  readonly revision: number;
  readonly state: "draft";
  readonly created: boolean;
}

export interface UpdatePublicationResult {
  readonly id: string;
  readonly slug: string;
  readonly revision: number;
  readonly state: "published";
}

export interface UpdateArchiveResult {
  readonly id: string;
  readonly slug: string;
  readonly revision: number;
  readonly state: "archived";
}

export interface MarkUpdateReadResult {
  readonly updateId: string;
  readonly userId: string;
  readonly read: true;
}

async function readAggregate(
  binding: D1Database,
  slug: string,
): Promise<UpdateAggregateRow | null> {
  return binding
    .prepare(
      `SELECT id, state, revision, resource_type, resource_id
       FROM updates WHERE slug = ?1 LIMIT 1`,
    )
    .bind(slug)
    .first<UpdateAggregateRow>();
}

export async function saveUpdateDraft(
  binding: D1Database,
  input: UpdateDraftInput,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<UpdateDraftResult>> {
  if (input.resource?.type === "order" && input.audience !== "account") {
    throw new RuntimeError(
      "UPDATE_ORDER_AUDIENCE_INVALID",
      "Order activity is private to the customer account audience.",
      {
        status: 400,
        publicMessage:
          "Order activity must use the signed-in account audience.",
      },
    );
  }
  const operation = "update.draft.save";
  const mutation = await prepareMutation<UpdateDraftResult>(
    binding,
    operation,
    context,
    { expectedRevision, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readAggregate(binding, input.slug);
  if (!aggregate && expectedRevision !== 0) throw staleMutation("update draft");
  if (aggregate && aggregate.revision !== expectedRevision) {
    throw staleMutation("update draft");
  }
  if (aggregate?.state === "published") {
    throw new RuntimeError(
      "UPDATE_PUBLISHED_IMMUTABLE",
      "Published updates are immutable.",
      {
        status: 409,
        publicMessage:
          "Published updates stay frozen. Create a new update for a correction or follow-up.",
      },
    );
  }
  if (aggregate?.state === "archived") {
    throw new RuntimeError(
      "UPDATE_ARCHIVED",
      "Archived updates cannot be edited.",
      {
        status: 409,
        publicMessage: "This update is archived.",
      },
    );
  }

  const updateId = aggregate?.id ?? `update_${crypto.randomUUID()}`;
  const result: UpdateDraftResult = Object.freeze({
    id: updateId,
    slug: input.slug,
    revision: aggregate ? expectedRevision + 1 : 1,
    state: "draft",
    created: aggregate === null,
  });
  const authority = activePageEditorCondition(context.actorUserId, input.slug);
  const resourceType = input.resource?.type ?? null;
  const resourceId = input.resource?.id ?? null;
  const statement = aggregate
    ? binding
        .prepare(
          `UPDATE updates
           SET title = ?1, summary = ?2, body_json = ?3, audience = ?4,
               resource_type = ?5, resource_id = ?6,
               revision = revision + 1, last_operation_key = ?7,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?8 AND revision = ?9 AND state = 'draft'
             AND ${authority.sql}`,
        )
        .bind(
          input.title,
          input.summary,
          JSON.stringify(input.body),
          input.audience,
          resourceType,
          resourceId,
          mutation.namespacedKey,
          updateId,
          expectedRevision,
          ...authority.bindings,
        )
    : binding
        .prepare(
          `INSERT INTO updates
            (id, slug, title, summary, body_json, audience,
             resource_type, resource_id, state, revision, last_operation_key)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'draft', 1, ?9
           WHERE NOT EXISTS (SELECT 1 FROM updates WHERE slug = ?2)
             AND ${authority.sql}`,
        )
        .bind(
          updateId,
          input.slug,
          input.title,
          input.summary,
          JSON.stringify(input.body),
          input.audience,
          resourceType,
          resourceId,
          mutation.namespacedKey,
          ...authority.bindings,
        );
  const statements = [
    statement,
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "update",
        subjectId: updateId,
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
        SELECT 1 FROM updates
        WHERE id = ? AND slug = ? AND revision = ? AND state = 'draft'
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        updateId,
        input.slug,
        result.revision,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("update draft");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function linkedResourcePublished(
  binding: D1Database,
  type: UpdateResourceType | null,
  resourceId: string | null,
): Promise<boolean> {
  const row = await binding
    .prepare(
      `SELECT 1 AS present
       WHERE ${linkedResourcePublicationCondition("?1", "?2")}
       LIMIT 1`,
    )
    .bind(type, resourceId)
    .first<ExistsRow>();
  return row?.present === 1;
}

function linkedResourcePublicationCondition(
  typeExpression: string,
  idExpression: string,
): string {
  return `(
    (${typeExpression} IS NULL AND ${idExpression} IS NULL)
    OR (
      ${typeExpression} = 'track'
      AND EXISTS (
        SELECT 1 FROM tracks AS linked_track
        WHERE linked_track.id = ${idExpression}
          AND linked_track.publication_state = 'published'
      )
    )
    OR (
      ${typeExpression} = 'release'
      AND EXISTS (
        SELECT 1 FROM releases AS linked_release
        WHERE linked_release.id = ${idExpression}
          AND linked_release.publication_state = 'published'
      )
    )
    OR (
      ${typeExpression} = 'collection'
      AND EXISTS (
        SELECT 1 FROM collections AS linked_collection
        WHERE linked_collection.id = ${idExpression}
          AND linked_collection.publication_state = 'published'
      )
    )
    OR (
      ${typeExpression} = 'course'
      AND EXISTS (
        SELECT 1 FROM courses AS linked_course
        WHERE linked_course.id = ${idExpression}
          AND linked_course.publication_state = 'published'
      )
      AND EXISTS (
        SELECT 1 FROM artist_modules AS linked_course_module
        WHERE linked_course_module.module_key = 'courses'
          AND linked_course_module.active = 1
      )
    )
    OR (
      ${typeExpression} = 'video'
      AND EXISTS (
        SELECT 1 FROM videos AS linked_video
        WHERE linked_video.id = ${idExpression}
          AND linked_video.publication_state = 'published'
      )
      AND EXISTS (
        SELECT 1 FROM artist_modules AS linked_video_module
        WHERE linked_video_module.module_key = 'video'
          AND linked_video_module.active = 1
      )
    )
    OR (
      ${typeExpression} = 'page'
      AND EXISTS (
        SELECT 1 FROM pages AS linked_page
        WHERE linked_page.id = ${idExpression}
          AND linked_page.publication_state = 'published'
          AND (
            linked_page.module_key IS NULL
            OR EXISTS (
              SELECT 1 FROM artist_modules AS linked_page_module
              WHERE linked_page_module.module_key = linked_page.module_key
                AND linked_page_module.active = 1
            )
          )
      )
    )
    OR (
      ${typeExpression} = 'license'
      AND EXISTS (
        SELECT 1
        FROM license_offers AS linked_license
        JOIN tracks AS linked_license_track
          ON linked_license_track.id = linked_license.track_id
         AND linked_license_track.published_revision_id = linked_license.track_revision_id
         AND linked_license_track.publication_state = 'published'
        WHERE linked_license.id = ${idExpression}
          AND linked_license.state = 'active'
      )
      AND EXISTS (
        SELECT 1 FROM artist_modules AS linked_license_module
        WHERE linked_license_module.module_key = 'licensing'
          AND linked_license_module.active = 1
      )
    )
    OR (
      ${typeExpression} = 'membership'
      AND EXISTS (
        SELECT 1
        FROM membership_plans AS linked_membership
        JOIN membership_plan_revisions AS linked_membership_revision
          ON linked_membership_revision.membership_plan_id = linked_membership.id
         AND linked_membership_revision.revision = linked_membership.current_revision
        WHERE linked_membership.id = ${idExpression}
          AND linked_membership.state = 'active'
      )
      AND EXISTS (
        SELECT 1 FROM artist_modules AS linked_membership_module
        WHERE linked_membership_module.module_key = 'memberships'
          AND linked_membership_module.active = 1
      )
    )
    OR (
      ${typeExpression} = 'subscription'
      AND EXISTS (
        SELECT 1 FROM subscription_plans AS linked_subscription
        WHERE linked_subscription.id = ${idExpression}
          AND linked_subscription.state = 'active'
      )
      AND EXISTS (
        SELECT 1 FROM artist_modules AS linked_subscription_module
        WHERE linked_subscription_module.module_key = 'subscriptions'
          AND linked_subscription_module.active = 1
      )
      AND EXISTS (
        SELECT 1 FROM artist_modules AS linked_membership_module
        WHERE linked_membership_module.module_key = 'memberships'
          AND linked_membership_module.active = 1
      )
    )
    OR (
      ${typeExpression} = 'order'
      AND EXISTS (
        SELECT 1 FROM orders AS linked_order
        WHERE linked_order.id = ${idExpression}
          AND linked_order.status = 'fulfilled'
          AND linked_order.stripe_environment = 'test'
          AND linked_order.livemode = 0
      )
    )
  )`;
}

export async function publishUpdate(
  binding: D1Database,
  slug: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<UpdatePublicationResult>> {
  const operation = "update.publish";
  const mutation = await prepareMutation<UpdatePublicationResult>(
    binding,
    operation,
    context,
    { slug, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readAggregate(binding, slug);
  if (!aggregate) {
    throw new RuntimeError("UPDATE_NOT_FOUND", "Update does not exist.", {
      status: 404,
      publicMessage: "That update was not found.",
    });
  }
  if (aggregate.revision !== expectedRevision || aggregate.state !== "draft") {
    throw staleMutation("update publication");
  }
  if (
    !(await linkedResourcePublished(
      binding,
      aggregate.resource_type,
      aggregate.resource_id,
    ))
  ) {
    throw new RuntimeError(
      "UPDATE_RESOURCE_NOT_PUBLISHED",
      "The linked resource is not currently published and active.",
      {
        status: 409,
        publicMessage:
          "Publish and activate the linked resource before publishing this update.",
      },
    );
  }
  const authority = activeOwnerCondition(context.actorUserId);
  const result: UpdatePublicationResult = Object.freeze({
    id: aggregate.id,
    slug,
    revision: expectedRevision + 1,
    state: "published",
  });
  const statements = [
    binding
      .prepare(
        `UPDATE updates
         SET state = 'published', published_at = CURRENT_TIMESTAMP,
             revision = revision + 1, last_operation_key = ?1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND revision = ?3 AND state = 'draft'
           AND resource_type IS ?4 AND resource_id IS ?5
           AND ${linkedResourcePublicationCondition(
             "updates.resource_type",
             "updates.resource_id",
           )}
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        expectedRevision,
        aggregate.resource_type,
        aggregate.resource_id,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "update",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM updates AS published_update
        WHERE published_update.id = ? AND published_update.revision = ?
          AND published_update.state = 'published'
          AND published_update.last_operation_key = ?
          AND published_update.resource_type IS ?
          AND published_update.resource_id IS ?
          AND ${linkedResourcePublicationCondition(
            "published_update.resource_type",
            "published_update.resource_id",
          )}
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.revision,
        mutation.namespacedKey,
        aggregate.resource_type,
        aggregate.resource_id,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1)
      throw staleMutation("update publication");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function archiveUpdate(
  binding: D1Database,
  slug: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<UpdateArchiveResult>> {
  const operation = "update.archive";
  const mutation = await prepareMutation<UpdateArchiveResult>(
    binding,
    operation,
    context,
    { slug, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readAggregate(binding, slug);
  if (
    !aggregate ||
    aggregate.revision !== expectedRevision ||
    aggregate.state === "archived"
  ) {
    throw staleMutation("update archive state");
  }
  const authority = activeOwnerCondition(context.actorUserId);
  const result: UpdateArchiveResult = Object.freeze({
    id: aggregate.id,
    slug,
    revision: expectedRevision + 1,
    state: "archived",
  });
  const statements = [
    binding
      .prepare(
        `UPDATE updates
         SET state = 'archived', revision = revision + 1,
             last_operation_key = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND revision = ?3 AND state != 'archived'
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        expectedRevision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "update",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM updates
        WHERE id = ? AND revision = ? AND state = 'archived'
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.revision,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1)
      throw staleMutation("update archive state");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function markUpdateRead(
  binding: D1Database,
  updateId: string,
  context: MutationContext,
): Promise<MutationResult<MarkUpdateReadResult>> {
  const operation = "update.read.mark";
  const mutation = await prepareMutation<MarkUpdateReadResult>(
    binding,
    operation,
    context,
    { updateId },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const result: MarkUpdateReadResult = Object.freeze({
    updateId,
    userId: context.actorUserId,
    read: true,
  });
  const customer = activeCustomerCondition(context.actorUserId);
  const receiptId = `update_read_${crypto.randomUUID()}`;
  const accessible = `EXISTS (
    SELECT 1 FROM updates AS accessible_update
    WHERE accessible_update.id = ?
      AND accessible_update.state = 'published'
      AND accessible_update.audience IN ('public', 'account')
      AND (
        accessible_update.resource_type IS NOT 'order'
        OR EXISTS (
          SELECT 1 FROM orders AS accessible_order
          WHERE accessible_order.id = accessible_update.resource_id
            AND accessible_order.customer_user_id = ?
            AND accessible_order.status = 'fulfilled'
            AND accessible_order.stripe_environment = 'test'
            AND accessible_order.livemode = 0
        )
      )
  ) AND ${customer.sql}`;
  const statements = [
    binding
      .prepare(
        `INSERT INTO update_reads
          (id, update_id, user_id, read_at, last_operation_key)
         SELECT ?1, ?2, ?3, CURRENT_TIMESTAMP, ?4
         WHERE ${accessible}
           AND NOT EXISTS (
             SELECT 1 FROM update_reads
             WHERE update_id = ?2 AND user_id = ?3
           )`,
      )
      .bind(
        receiptId,
        updateId,
        context.actorUserId,
        mutation.namespacedKey,
        updateId,
        context.actorUserId,
        ...customer.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "update",
        subjectId: updateId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `${accessible} AND EXISTS (
        SELECT 1 FROM update_reads
        WHERE update_id = ? AND user_id = ?
      )`,
      [
        updateId,
        context.actorUserId,
        ...customer.bindings,
        updateId,
        context.actorUserId,
      ],
    ),
  ];
  statements.push(
    await prepareServerTelemetryEvent(binding, {
      eventName: "update-read",
      resourceType: "update",
      resourceId: updateId,
      sourceOperationKey: mutation.namespacedKey,
      userId: context.actorUserId,
      requestContext: context.telemetry,
      durableCondition: {
        sql: `EXISTS (
          SELECT 1 FROM update_reads
          WHERE update_id = ? AND user_id = ? AND last_operation_key = ?
        )`,
        bindings: [updateId, context.actorUserId, mutation.namespacedKey],
      },
    }),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[1]) !== 1) {
      throw new RuntimeError(
        "UPDATE_NOT_AVAILABLE",
        "Update is not available.",
        {
          status: 404,
          publicMessage: "That update was not found.",
        },
      );
    }
    return { value: result, replayed: changedRows(results[0]) === 0 };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
