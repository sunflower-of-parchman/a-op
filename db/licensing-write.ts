import { changedRows } from "./audit-events.ts";
import {
  activeCustomerCondition,
  activeOwnerCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import { prepareServerTelemetryEvent } from "./telemetry-server.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
  type PreparedMutation,
} from "./mutation.ts";
import {
  freezeLicenseIntendedUseSnapshot,
  freezeLicenseTermsSnapshot,
  parseLicenseTermsSnapshotJson,
  serializeLicenseSnapshot,
} from "@/lib/licensing/snapshot.ts";
import {
  addLicenseTermMonths,
  licenseExpiryReached,
  LicenseStateTransitionError,
  transitionLicenseDefinitionState,
  transitionIssuedLicenseState,
  transitionLicenseRequestState,
} from "@/lib/licensing/state-machine.ts";
import type {
  IssuedLicenseState,
  IssuedLicenseTerminalReceipt,
  LicenseEventSource,
  LicenseIssuanceInput,
  LicenseIssuanceReceipt,
  LicenseOfferCreateInput,
  LicenseOfferMutationReceipt,
  LicenseOfferStateMutationReceipt,
  LicenseRequestMutationReceipt,
  LicenseRequestState,
  StripeTestLicenseFulfillmentInput,
  LicenseTermsDefinitionInput,
  LicenseTermsMutationReceipt,
  LicenseTermsSnapshot,
  LicenseTermsStateMutationReceipt,
} from "@/lib/licensing/types.ts";
import {
  isSafeLicenseId,
  validateLicenseDefinitionStateChangeInput,
  validateIssuedLicenseTerminalInput,
  validateLicenseIssuanceInput,
  validateLicenseOfferCreateInput,
  validateLicenseRequestDecisionInput,
  validateLicenseRequestSubmitInput,
  validateStripeTestLicenseFulfillmentInput,
  validateLicenseTermsCreateInput,
  validateLicenseTermsRevisionInput,
  type LicenseValidationIssue,
} from "@/lib/licensing/validation.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CountRow {
  count: number;
}

interface SqlLicenseCondition {
  readonly sql: string;
  readonly bindings: readonly (number | string)[];
}

interface LicenseTermsAggregateRow {
  id: string;
  slug: string;
  state: "draft" | "active" | "archived";
  current_version: number;
}

interface OfferReferenceRow {
  track_id: string;
  track_revision_id: string;
  track_slug: string;
  track_title: string;
  track_publication_state: "draft" | "published" | "unpublished";
  published_revision_id: string | null;
  terms_id: string;
  terms_slug: string;
  terms_state: "draft" | "active" | "archived";
  terms_version_id: string;
  terms_version: number;
  terms_name: string;
  terms_title: string;
  terms_introduction: string;
  terms_general_terms: string;
  terms_disclaimer: string;
  option_id: string;
  option_key: string;
  option_label: string;
  option_description: string;
  option_usage_category: string;
  option_allowed_media_json: string;
  option_audience_label: string | null;
  option_max_audience: number | null;
  option_distribution_label: string | null;
  option_max_copies: number | null;
  option_term_months: number | null;
  option_territory: string;
  option_attribution_required: number;
  option_attribution_text: string | null;
  option_exclusive: number;
  option_requires_approval: number;
  option_license_credit_cost: number;
  option_includes_track_download: number;
  product_id: string;
  product_type: string;
  product_resource_type: string | null;
  product_resource_id: string | null;
  product_state: "draft" | "active" | "archived";
  price_id: string;
  price_product_id: string;
  price_amount_minor: number;
  price_currency: string;
  price_billing_interval: string;
  price_active: number;
  price_environment: string;
  price_livemode: number;
}

interface LicenseOfferSnapshotRow extends OfferReferenceRow {
  offer_id: string;
  offer_slug: string;
  offer_state: "draft" | "active" | "archived";
  offer_revision: number;
}

interface LicenseRequestRow {
  id: string;
  customer_user_id: string;
  license_offer_id: string;
  license_offer_revision: number;
  track_id: string;
  license_terms_version_id: string;
  license_option_id: string;
  state: LicenseRequestState;
  approved_by_user_id: string | null;
  approved_at: string | null;
  terms_snapshot_json: string;
  intended_use_snapshot_json: string;
  revision: number;
}

interface IssuedLicenseRow {
  id: string;
  customer_user_id: string;
  state: IssuedLicenseState;
  expires_at: string | null;
  revision: number;
}

const STRIPE_TEST_LICENSE_FULFILLMENT_FROM = `FROM fulfillment_events AS fulfillment
  JOIN commerce_events AS event
    ON event.id = fulfillment.commerce_event_id
  JOIN orders AS provider_order
    ON provider_order.id = fulfillment.order_id
   AND provider_order.commerce_event_id = event.id
  JOIN checkout_sessions AS checkout
    ON checkout.id = fulfillment.checkout_session_id
   AND checkout.id = provider_order.checkout_session_id
   AND checkout.id = event.checkout_session_id
  JOIN order_items AS item
    ON item.order_id = provider_order.id
  JOIN commerce_products AS product
    ON product.id = item.commerce_product_id
  JOIN commerce_prices AS price
    ON price.id = item.commerce_price_id
   AND price.commerce_product_id = item.commerce_product_id
  JOIN license_requests AS request
    ON request.id = checkout.license_request_id
  JOIN license_offers AS offer
    ON offer.id = request.license_offer_id
   AND offer.revision = request.license_offer_revision`;

function invalidInput(issues: readonly LicenseValidationIssue[]): RuntimeError {
  return new RuntimeError(
    "LICENSE_INPUT_INVALID",
    "The licensing input did not satisfy its server contract.",
    {
      status: 400,
      publicMessage: "Review the licensing fields and try again.",
      details: { issues },
    },
  );
}

function invalidIdentifier(field: string): RuntimeError {
  return invalidInput([
    Object.freeze({
      field,
      message: `${field} must be a safe application identifier.`,
    }),
  ]);
}

function safeId(value: unknown, field: string): string {
  if (!isSafeLicenseId(value)) throw invalidIdentifier(field);
  return value;
}

function positiveRevision(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw invalidInput([
      Object.freeze({
        field,
        message: `${field} must be a positive revision.`,
      }),
    ]);
  }
  return value as number;
}

function notFound(
  subject: "offer" | "request" | "terms" | "license",
): RuntimeError {
  return new RuntimeError(
    `LICENSE_${subject.toUpperCase()}_NOT_FOUND`,
    `The license ${subject} was not found.`,
    { status: 404, publicMessage: `That license ${subject} was not found.` },
  );
}

function unavailable(message: string, publicMessage: string): RuntimeError {
  return new RuntimeError("LICENSE_STATE_UNAVAILABLE", message, {
    status: 409,
    publicMessage,
  });
}

function integrity(message: string): RuntimeError {
  return new RuntimeError("LICENSE_INTEGRITY", message, {
    status: 409,
    publicMessage:
      "The stored licensing definition is incomplete. Review it before continuing.",
  });
}

async function requireAuthority(
  binding: D1Database,
  authority: SqlAuthorityCondition,
  code: string,
  message: string,
  publicMessage: string,
): Promise<void> {
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(code, message, { status: 403, publicMessage });
}

async function requireActiveOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  return requireAuthority(
    binding,
    activeOwnerCondition(actorUserId),
    "LICENSE_OWNER_REQUIRED",
    "Licensing administration requires a live owner authority record.",
    "Owner access is required.",
  );
}

async function requireActiveCustomer(
  binding: D1Database,
  customerUserId: string,
): Promise<void> {
  return requireAuthority(
    binding,
    activeCustomerCondition(customerUserId),
    "LICENSE_CUSTOMER_REQUIRED",
    "Licensing requires a live customer authority record.",
    "An active customer account is required.",
  );
}

function prepareRequiredAuditEvent(
  binding: D1Database,
  input: {
    readonly actorUserId: string | null;
    readonly action: string;
    readonly subjectType: string;
    readonly subjectId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly requestId: string;
    readonly details?: Record<string, unknown>;
    readonly result: Record<string, unknown>;
  },
  conditionSql: string,
  conditionBindings: readonly (null | number | string)[],
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json,
         result_json)
       VALUES (?, ?, CASE WHEN (${conditionSql}) THEN ? ELSE NULL END,
               ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `audit_${crypto.randomUUID()}`,
      input.actorUserId,
      ...conditionBindings,
      input.action,
      input.subjectType,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details ?? {}),
      JSON.stringify(input.result),
    );
}

function isRequiredAuditGuardFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:NOT NULL|not-null).*audit_events\.action|audit_events\.action.*(?:NOT NULL|not-null)/i.test(
      error.message,
    )
  );
}

async function replayOrStale<T>(
  binding: D1Database,
  mutation: PreparedMutation<T>,
  error: unknown,
  subject: string,
): Promise<MutationResult<T>> {
  try {
    return await replayAfterMutationFailure(binding, mutation, error);
  } catch (replayError) {
    if (isRequiredAuditGuardFailure(replayError)) throw staleMutation(subject);
    throw replayError;
  }
}

async function readTermsAggregate(
  binding: D1Database,
  licenseTermsId: string,
): Promise<LicenseTermsAggregateRow | null> {
  return binding
    .prepare(
      `SELECT id, slug, state, current_version
       FROM license_terms WHERE id = ?1 LIMIT 1`,
    )
    .bind(licenseTermsId)
    .first<LicenseTermsAggregateRow>();
}

function optionInsert(
  binding: D1Database,
  input: LicenseTermsDefinitionInput["options"][number],
  optionId: string,
  licenseTermsId: string,
  versionId: string,
  version: number,
  position: number,
  authority: SqlAuthorityCondition,
  expectedCurrentVersion: number,
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO license_options
        (id, license_terms_id, license_terms_version_id,
         license_terms_version, option_key, label, description,
         usage_category, allowed_media_json, audience_label, max_audience,
         distribution_label, max_copies, term_months, territory,
         attribution_required, attribution_text, exclusive,
         requires_approval, license_credit_cost, includes_track_download,
         position)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM license_terms
         WHERE id = ? AND current_version = ? AND state <> 'archived'
       )
         AND EXISTS (
           SELECT 1 FROM license_terms_versions
           WHERE id = ? AND license_terms_id = ? AND version = ?
         )
         AND ${authority.sql}`,
    )
    .bind(
      optionId,
      licenseTermsId,
      versionId,
      version,
      input.optionKey,
      input.label,
      input.description,
      input.usageCategory,
      JSON.stringify(input.allowedMedia),
      input.audienceLabel,
      input.maxAudience,
      input.distributionLabel,
      input.maxCopies,
      input.termMonths,
      input.territory,
      input.attributionRequired ? 1 : 0,
      input.attributionText,
      input.exclusive ? 1 : 0,
      input.requiresApproval ? 1 : 0,
      input.licenseCreditCost,
      input.includesTrackDownload ? 1 : 0,
      position,
      licenseTermsId,
      expectedCurrentVersion,
      versionId,
      licenseTermsId,
      version,
      ...authority.bindings,
    );
}

export async function createLicenseTerms(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<LicenseTermsMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateLicenseTermsCreateInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "license.terms.create";
  const mutation = await prepareMutation<LicenseTermsMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const duplicate = await binding
    .prepare("SELECT id FROM license_terms WHERE slug = ?1 LIMIT 1")
    .bind(input.slug)
    .first<{ id: string }>();
  if (duplicate) {
    throw unavailable(
      "A license terms set already uses this slug.",
      "Choose a different license-terms slug.",
    );
  }

  const licenseTermsId = `license_terms_${crypto.randomUUID()}`;
  const versionId = `license_terms_version_${crypto.randomUUID()}`;
  const optionIds = Object.freeze(
    input.options.map(() => `license_option_${crypto.randomUUID()}`),
  );
  const result: LicenseTermsMutationReceipt = Object.freeze({
    licenseTermsId,
    slug: input.slug,
    state: input.state,
    versionId,
    version: 1,
    optionIds,
    created: true,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO license_terms
          (id, slug, state, current_version, created_by_user_id,
           last_operation_key)
         SELECT ?, ?, ?, 1, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM license_terms WHERE slug = ?)
           AND ${authority.sql}`,
      )
      .bind(
        licenseTermsId,
        input.slug,
        input.state,
        context.actorUserId,
        mutation.namespacedKey,
        input.slug,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO license_terms_versions
          (id, license_terms_id, version, name, title, introduction,
           general_terms, disclaimer, created_by_user_id)
         SELECT ?, ?, 1, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM license_terms
           WHERE id = ? AND current_version = 1 AND state = ?
             AND last_operation_key = ?
         )
           AND ${authority.sql}`,
      )
      .bind(
        versionId,
        licenseTermsId,
        input.name,
        input.title,
        input.introduction,
        input.generalTerms,
        input.disclaimer,
        context.actorUserId,
        licenseTermsId,
        input.state,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
  ];
  input.options.forEach((licenseOption, index) => {
    statements.push(
      optionInsert(
        binding,
        licenseOption,
        optionIds[index],
        licenseTermsId,
        versionId,
        1,
        index + 1,
        authority,
        1,
      ),
    );
  });
  const exactSql = `EXISTS (
    SELECT 1 FROM license_terms
    WHERE id = ? AND slug = ? AND state = ? AND current_version = 1
      AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM license_terms_versions
    WHERE id = ? AND license_terms_id = ? AND version = 1
  ) AND (
    SELECT COUNT(*) FROM license_options
    WHERE license_terms_version_id = ?
  ) = ? AND ${authority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    licenseTermsId,
    input.slug,
    input.state,
    mutation.namespacedKey,
    versionId,
    licenseTermsId,
    versionId,
    input.options.length,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "license-terms",
        subjectId: licenseTermsId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { version: 1, optionCount: input.options.length },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      results.slice(0, auditIndex).some((entry) => changedRows(entry) !== 1) ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("license terms");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "license terms");
  }
}

export async function reviseLicenseTerms(
  binding: D1Database,
  rawLicenseTermsId: string,
  rawInput: unknown,
  rawExpectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<LicenseTermsMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const licenseTermsId = safeId(rawLicenseTermsId, "licenseTermsId");
  const expectedVersion = positiveRevision(
    rawExpectedVersion,
    "expectedVersion",
  );
  const validated = validateLicenseTermsRevisionInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "license.terms.revise";
  const mutation = await prepareMutation<LicenseTermsMutationReceipt>(
    binding,
    operation,
    context,
    { licenseTermsId, expectedVersion, definition: input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readTermsAggregate(binding, licenseTermsId);
  if (!aggregate) throw notFound("terms");
  if (
    aggregate.state === "archived" ||
    aggregate.current_version !== expectedVersion
  ) {
    throw staleMutation("license terms");
  }
  const nextVersion = expectedVersion + 1;
  const versionId = `license_terms_version_${crypto.randomUUID()}`;
  const optionIds = Object.freeze(
    input.options.map(() => `license_option_${crypto.randomUUID()}`),
  );
  const result: LicenseTermsMutationReceipt = Object.freeze({
    licenseTermsId,
    slug: aggregate.slug,
    state: aggregate.state,
    versionId,
    version: nextVersion,
    optionIds,
    created: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO license_terms_versions
          (id, license_terms_id, version, name, title, introduction,
           general_terms, disclaimer, created_by_user_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM license_terms
           WHERE id = ? AND current_version = ? AND state <> 'archived'
         )
           AND ${authority.sql}`,
      )
      .bind(
        versionId,
        licenseTermsId,
        nextVersion,
        input.name,
        input.title,
        input.introduction,
        input.generalTerms,
        input.disclaimer,
        context.actorUserId,
        licenseTermsId,
        expectedVersion,
        ...authority.bindings,
      ),
  ];
  input.options.forEach((licenseOption, index) => {
    statements.push(
      optionInsert(
        binding,
        licenseOption,
        optionIds[index],
        licenseTermsId,
        versionId,
        nextVersion,
        index + 1,
        authority,
        expectedVersion,
      ),
    );
  });
  statements.push(
    binding
      .prepare(
        `UPDATE license_terms
         SET current_version = ?, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND current_version = ? AND state <> 'archived'
           AND (
             SELECT COUNT(*) FROM license_options
             WHERE license_terms_version_id = ?
           ) = ?
           AND ${authority.sql}`,
      )
      .bind(
        nextVersion,
        mutation.namespacedKey,
        licenseTermsId,
        expectedVersion,
        versionId,
        input.options.length,
        ...authority.bindings,
      ),
  );
  const exactSql = `EXISTS (
    SELECT 1 FROM license_terms
    WHERE id = ? AND current_version = ? AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM license_terms_versions
    WHERE id = ? AND license_terms_id = ? AND version = ?
  ) AND (
    SELECT COUNT(*) FROM license_options
    WHERE license_terms_version_id = ?
  ) = ? AND ${authority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    licenseTermsId,
    nextVersion,
    mutation.namespacedKey,
    versionId,
    licenseTermsId,
    nextVersion,
    versionId,
    input.options.length,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "license-terms",
        subjectId: licenseTermsId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          previousVersion: expectedVersion,
          optionCount: input.options.length,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      results.slice(0, auditIndex).some((entry) => changedRows(entry) !== 1) ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("license terms");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "license terms");
  }
}

export async function setLicenseTermsState(
  binding: D1Database,
  rawLicenseTermsId: string,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<LicenseTermsStateMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const licenseTermsId = safeId(rawLicenseTermsId, "licenseTermsId");
  const validated = validateLicenseDefinitionStateChangeInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "license.terms.state";
  const mutation = await prepareMutation<LicenseTermsStateMutationReceipt>(
    binding,
    operation,
    context,
    { licenseTermsId, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readTermsAggregate(binding, licenseTermsId);
  if (!aggregate) throw notFound("terms");
  if (aggregate.state !== input.expectedState) {
    throw staleMutation("license terms");
  }
  try {
    transitionLicenseDefinitionState(aggregate.state, input.nextState);
  } catch (error) {
    if (error instanceof LicenseStateTransitionError) {
      throw unavailable(
        error.message,
        "These license terms cannot make that transition.",
      );
    }
    throw error;
  }
  if (input.nextState === "active") {
    const optionCount = await binding
      .prepare(
        `SELECT COUNT(*) AS count
         FROM license_terms_versions version
         JOIN license_options option
           ON option.license_terms_version_id = version.id
         WHERE version.license_terms_id = ?1 AND version.version = ?2`,
      )
      .bind(licenseTermsId, aggregate.current_version)
      .first<CountRow>();
    if (!optionCount || optionCount.count < 1) {
      throw integrity(
        "Active license terms require a complete current version.",
      );
    }
  }
  const result: LicenseTermsStateMutationReceipt = Object.freeze({
    licenseTermsId,
    state: input.nextState,
    currentVersion: aggregate.current_version,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE license_terms
         SET state = ?, last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = ? AND current_version = ?
           AND EXISTS (
             SELECT 1 FROM license_terms_versions version
             WHERE version.license_terms_id = license_terms.id
               AND version.version = license_terms.current_version
               AND (? <> 'active' OR EXISTS (
                 SELECT 1 FROM license_options option
                 WHERE option.license_terms_version_id = version.id
               ))
           )
           AND ${authority.sql}`,
      )
      .bind(
        input.nextState,
        mutation.namespacedKey,
        licenseTermsId,
        input.expectedState,
        aggregate.current_version,
        input.nextState,
        ...authority.bindings,
      ),
  ];
  const exactSql = `EXISTS (
    SELECT 1 FROM license_terms
    WHERE id = ? AND state = ? AND current_version = ?
      AND last_operation_key = ?
  ) AND ${authority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    licenseTermsId,
    input.nextState,
    aggregate.current_version,
    mutation.namespacedKey,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "license-terms",
        subjectId: licenseTermsId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          previousState: input.expectedState,
          nextState: input.nextState,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("license terms");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "license terms");
  }
}

async function readOfferReferences(
  binding: D1Database,
  input: LicenseOfferCreateInput,
): Promise<OfferReferenceRow | null> {
  return binding
    .prepare(
      `SELECT
         t.id AS track_id, tr.id AS track_revision_id, t.slug AS track_slug,
         tr.title AS track_title, t.publication_state AS track_publication_state,
         t.published_revision_id,
         lt.id AS terms_id, lt.slug AS terms_slug, lt.state AS terms_state,
         ltv.id AS terms_version_id, ltv.version AS terms_version,
         ltv.name AS terms_name, ltv.title AS terms_title,
         ltv.introduction AS terms_introduction,
         ltv.general_terms AS terms_general_terms,
         ltv.disclaimer AS terms_disclaimer,
         lo.id AS option_id, lo.option_key, lo.label AS option_label,
         lo.description AS option_description,
         lo.usage_category AS option_usage_category,
         lo.allowed_media_json AS option_allowed_media_json,
         lo.audience_label AS option_audience_label,
         lo.max_audience AS option_max_audience,
         lo.distribution_label AS option_distribution_label,
         lo.max_copies AS option_max_copies,
         lo.term_months AS option_term_months,
         lo.territory AS option_territory,
         lo.attribution_required AS option_attribution_required,
         lo.attribution_text AS option_attribution_text,
         lo.exclusive AS option_exclusive,
         lo.requires_approval AS option_requires_approval,
         lo.license_credit_cost AS option_license_credit_cost,
         lo.includes_track_download AS option_includes_track_download,
         cp.id AS product_id, cp.product_type, cp.resource_type AS product_resource_type,
         cp.resource_id AS product_resource_id, cp.state AS product_state,
         price.id AS price_id, price.commerce_product_id AS price_product_id,
         price.amount_minor AS price_amount_minor,
         price.currency AS price_currency,
         price.billing_interval AS price_billing_interval,
         price.active AS price_active,
         price.stripe_environment AS price_environment,
         price.livemode AS price_livemode
       FROM tracks t
       JOIN track_revisions tr
         ON tr.track_id = t.id AND tr.id = ?2
       JOIN license_terms lt ON lt.id = ?3
       JOIN license_terms_versions ltv
         ON ltv.license_terms_id = lt.id AND ltv.version = ?4
       JOIN license_options lo
         ON lo.id = ?5 AND lo.license_terms_version_id = ltv.id
       JOIN commerce_products cp ON cp.id = ?6
       JOIN commerce_prices price
         ON price.id = ?7 AND price.commerce_product_id = cp.id
       WHERE t.id = ?1
       LIMIT 1`,
    )
    .bind(
      input.trackId,
      input.trackRevisionId,
      input.licenseTermsId,
      input.licenseTermsVersion,
      input.licenseOptionId,
      input.commerceProductId,
      input.commercePriceId,
    )
    .first<OfferReferenceRow>();
}

function assertOfferReferences(
  row: OfferReferenceRow | null,
  input: LicenseOfferCreateInput,
): asserts row is OfferReferenceRow {
  if (!row) {
    throw unavailable(
      "The license offer references an incomplete definition.",
      "Choose a complete track, terms version, option, product, and test price.",
    );
  }
  const productMatches =
    row.product_type === "license" &&
    row.product_resource_type === "track" &&
    row.product_resource_id === input.trackId &&
    row.price_product_id === input.commerceProductId &&
    row.price_billing_interval === "one_time" &&
    row.price_environment === "test" &&
    row.price_livemode === 0;
  if (!productMatches) {
    throw unavailable(
      "The commerce definition is not a test-only one-time track license.",
      "Choose a test-only one-time license product and price.",
    );
  }
  if (
    input.state === "active" &&
    (row.track_publication_state !== "published" ||
      row.published_revision_id !== input.trackRevisionId ||
      row.terms_state !== "active" ||
      row.product_state !== "active" ||
      row.price_active !== 1)
  ) {
    throw unavailable(
      "An active offer requires published music and active terms, product, and test price.",
      "Activate the complete license definition before publishing this offer.",
    );
  }
  if (
    row.terms_state === "archived" ||
    row.product_state === "archived" ||
    row.price_active !== 1
  ) {
    throw unavailable(
      "The license offer references an archived or inactive definition.",
      "Choose current license terms and an active test price.",
    );
  }
}

export async function createLicenseOffer(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<LicenseOfferMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateLicenseOfferCreateInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "license.offer.create";
  const mutation = await prepareMutation<LicenseOfferMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const duplicate = await binding
    .prepare("SELECT id FROM license_offers WHERE slug = ?1 LIMIT 1")
    .bind(input.slug)
    .first<{ id: string }>();
  if (duplicate) {
    throw unavailable(
      "A license offer already uses this slug.",
      "Choose a different license-offer slug.",
    );
  }
  const references = await readOfferReferences(binding, input);
  assertOfferReferences(references, input);

  const licenseOfferId = `license_offer_${crypto.randomUUID()}`;
  const result: LicenseOfferMutationReceipt = Object.freeze({
    licenseOfferId,
    slug: input.slug,
    state: input.state,
    revision: 1,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const activeTrackState =
    input.state === "active" ? "published" : references.track_publication_state;
  const activeTermsState =
    input.state === "active" ? "active" : references.terms_state;
  const activeProductState =
    input.state === "active" ? "active" : references.product_state;
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO license_offers
          (id, slug, track_id, track_revision_id, license_terms_id,
           license_terms_version_id, license_terms_version,
           license_option_id, commerce_product_id, commerce_price_id,
           state, revision, created_by_user_id, last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM license_offers WHERE slug = ?)
           AND EXISTS (
             SELECT 1 FROM tracks
             WHERE id = ? AND publication_state = ?
               AND (? <> 'active' OR published_revision_id = ?)
           )
           AND EXISTS (
             SELECT 1 FROM license_terms_versions
             WHERE id = ? AND license_terms_id = ? AND version = ?
           )
           AND EXISTS (
             SELECT 1 FROM license_terms
             WHERE id = ? AND state = ?
           )
           AND EXISTS (
             SELECT 1 FROM license_options
             WHERE id = ? AND license_terms_version_id = ?
           )
           AND EXISTS (
             SELECT 1 FROM commerce_products
             WHERE id = ? AND product_type = 'license'
               AND resource_type = 'track' AND resource_id = ? AND state = ?
           )
           AND EXISTS (
             SELECT 1 FROM commerce_prices
             WHERE id = ? AND commerce_product_id = ? AND active = 1
               AND billing_interval = 'one_time'
               AND stripe_environment = 'test' AND livemode = 0
           )
           AND ${authority.sql}`,
      )
      .bind(
        licenseOfferId,
        input.slug,
        input.trackId,
        input.trackRevisionId,
        input.licenseTermsId,
        references.terms_version_id,
        input.licenseTermsVersion,
        input.licenseOptionId,
        input.commerceProductId,
        input.commercePriceId,
        input.state,
        context.actorUserId,
        mutation.namespacedKey,
        input.slug,
        input.trackId,
        activeTrackState,
        input.state,
        input.trackRevisionId,
        references.terms_version_id,
        input.licenseTermsId,
        input.licenseTermsVersion,
        input.licenseTermsId,
        activeTermsState,
        input.licenseOptionId,
        references.terms_version_id,
        input.commerceProductId,
        input.trackId,
        activeProductState,
        input.commercePriceId,
        input.commerceProductId,
        ...authority.bindings,
      ),
  ];
  const exactSql = `EXISTS (
    SELECT 1 FROM license_offers
    WHERE id = ? AND slug = ? AND state = ? AND revision = 1
      AND last_operation_key = ?
  ) AND ${authority.sql}`;
  const exactBindings = [
    licenseOfferId,
    input.slug,
    input.state,
    mutation.namespacedKey,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "license-offer",
        subjectId: licenseOfferId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          trackId: input.trackId,
          licenseTermsId: input.licenseTermsId,
          licenseTermsVersion: input.licenseTermsVersion,
          licenseOptionId: input.licenseOptionId,
          commerceProductId: input.commerceProductId,
          commercePriceId: input.commercePriceId,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("license offer");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "license offer");
  }
}

interface LicenseOfferAggregateRow {
  id: string;
  slug: string;
  track_id: string;
  track_revision_id: string;
  license_terms_id: string;
  license_terms_version: number;
  license_option_id: string;
  commerce_product_id: string;
  commerce_price_id: string;
  state: "draft" | "active" | "archived";
  revision: number;
}

export async function setLicenseOfferState(
  binding: D1Database,
  rawLicenseOfferId: string,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<LicenseOfferStateMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const licenseOfferId = safeId(rawLicenseOfferId, "licenseOfferId");
  const validated = validateLicenseDefinitionStateChangeInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "license.offer.state";
  const mutation = await prepareMutation<LicenseOfferStateMutationReceipt>(
    binding,
    operation,
    context,
    { licenseOfferId, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const offer = await binding
    .prepare(
      `SELECT id, slug, track_id, track_revision_id, license_terms_id,
              license_terms_version, license_option_id, commerce_product_id,
              commerce_price_id, state, revision
       FROM license_offers WHERE id = ?1 LIMIT 1`,
    )
    .bind(licenseOfferId)
    .first<LicenseOfferAggregateRow>();
  if (!offer) throw notFound("offer");
  if (offer.state !== input.expectedState) throw staleMutation("license offer");
  try {
    transitionLicenseDefinitionState(offer.state, input.nextState);
  } catch (error) {
    if (error instanceof LicenseStateTransitionError) {
      throw unavailable(
        error.message,
        "This license offer cannot make that transition.",
      );
    }
    throw error;
  }
  if (input.nextState === "active") {
    const references = await readOfferReferences(binding, {
      slug: offer.slug,
      trackId: offer.track_id,
      trackRevisionId: offer.track_revision_id,
      licenseTermsId: offer.license_terms_id,
      licenseTermsVersion: offer.license_terms_version,
      licenseOptionId: offer.license_option_id,
      commerceProductId: offer.commerce_product_id,
      commercePriceId: offer.commerce_price_id,
      state: "active",
    });
    assertOfferReferences(references, {
      slug: offer.slug,
      trackId: offer.track_id,
      trackRevisionId: offer.track_revision_id,
      licenseTermsId: offer.license_terms_id,
      licenseTermsVersion: offer.license_terms_version,
      licenseOptionId: offer.license_option_id,
      commerceProductId: offer.commerce_product_id,
      commercePriceId: offer.commerce_price_id,
      state: "active",
    });
  }
  const result: LicenseOfferStateMutationReceipt = Object.freeze({
    licenseOfferId,
    state: input.nextState,
    revision: offer.revision,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE license_offers
         SET state = ?, last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = ? AND revision = ?
           AND (? <> 'active' OR (
             EXISTS (
               SELECT 1 FROM tracks
               WHERE id = ? AND publication_state = 'published'
                 AND published_revision_id = ?
             )
             AND EXISTS (
               SELECT 1 FROM license_terms
               WHERE id = ? AND state = 'active'
             )
             AND EXISTS (
               SELECT 1 FROM commerce_products
               WHERE id = ? AND state = 'active' AND product_type = 'license'
                 AND resource_type = 'track' AND resource_id = ?
             )
             AND EXISTS (
               SELECT 1 FROM commerce_prices
               WHERE id = ? AND commerce_product_id = ? AND active = 1
                 AND billing_interval = 'one_time'
                 AND stripe_environment = 'test' AND livemode = 0
             )
           ))
           AND ${authority.sql}`,
      )
      .bind(
        input.nextState,
        mutation.namespacedKey,
        licenseOfferId,
        input.expectedState,
        offer.revision,
        input.nextState,
        offer.track_id,
        offer.track_revision_id,
        offer.license_terms_id,
        offer.commerce_product_id,
        offer.track_id,
        offer.commerce_price_id,
        offer.commerce_product_id,
        ...authority.bindings,
      ),
  ];
  const exactSql = `EXISTS (
    SELECT 1 FROM license_offers
    WHERE id = ? AND state = ? AND revision = ? AND last_operation_key = ?
  ) AND ${authority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    licenseOfferId,
    input.nextState,
    offer.revision,
    mutation.namespacedKey,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "license-offer",
        subjectId: licenseOfferId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          previousState: input.expectedState,
          nextState: input.nextState,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("license offer");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "license offer");
  }
}

async function readActiveOfferSnapshotRow(
  binding: D1Database,
  licenseOfferId: string,
): Promise<LicenseOfferSnapshotRow | null> {
  return binding
    .prepare(
      `SELECT
         offer.id AS offer_id, offer.slug AS offer_slug,
         offer.state AS offer_state, offer.revision AS offer_revision,
         t.id AS track_id, tr.id AS track_revision_id, t.slug AS track_slug,
         tr.title AS track_title, t.publication_state AS track_publication_state,
         t.published_revision_id,
         lt.id AS terms_id, lt.slug AS terms_slug, lt.state AS terms_state,
         ltv.id AS terms_version_id, ltv.version AS terms_version,
         ltv.name AS terms_name, ltv.title AS terms_title,
         ltv.introduction AS terms_introduction,
         ltv.general_terms AS terms_general_terms,
         ltv.disclaimer AS terms_disclaimer,
         lo.id AS option_id, lo.option_key, lo.label AS option_label,
         lo.description AS option_description,
         lo.usage_category AS option_usage_category,
         lo.allowed_media_json AS option_allowed_media_json,
         lo.audience_label AS option_audience_label,
         lo.max_audience AS option_max_audience,
         lo.distribution_label AS option_distribution_label,
         lo.max_copies AS option_max_copies,
         lo.term_months AS option_term_months,
         lo.territory AS option_territory,
         lo.attribution_required AS option_attribution_required,
         lo.attribution_text AS option_attribution_text,
         lo.exclusive AS option_exclusive,
         lo.requires_approval AS option_requires_approval,
         lo.license_credit_cost AS option_license_credit_cost,
         lo.includes_track_download AS option_includes_track_download,
         cp.id AS product_id, cp.product_type, cp.resource_type AS product_resource_type,
         cp.resource_id AS product_resource_id, cp.state AS product_state,
         price.id AS price_id, price.commerce_product_id AS price_product_id,
         price.amount_minor AS price_amount_minor,
         price.currency AS price_currency,
         price.billing_interval AS price_billing_interval,
         price.active AS price_active,
         price.stripe_environment AS price_environment,
         price.livemode AS price_livemode
       FROM license_offers offer
       JOIN tracks t ON t.id = offer.track_id
       JOIN track_revisions tr
         ON tr.track_id = t.id AND tr.id = offer.track_revision_id
       JOIN license_terms lt ON lt.id = offer.license_terms_id
       JOIN license_terms_versions ltv
         ON ltv.id = offer.license_terms_version_id
        AND ltv.license_terms_id = lt.id
        AND ltv.version = offer.license_terms_version
       JOIN license_options lo
         ON lo.id = offer.license_option_id
        AND lo.license_terms_version_id = ltv.id
       JOIN commerce_products cp ON cp.id = offer.commerce_product_id
       JOIN commerce_prices price
         ON price.id = offer.commerce_price_id
        AND price.commerce_product_id = cp.id
       WHERE offer.id = ?1
         AND offer.state = 'active'
         AND t.publication_state = 'published'
         AND t.published_revision_id = offer.track_revision_id
         AND lt.state = 'active'
         AND cp.state = 'active'
         AND cp.product_type = 'license'
         AND cp.resource_type = 'track'
         AND cp.resource_id = t.id
         AND price.active = 1
         AND price.billing_interval = 'one_time'
         AND price.stripe_environment = 'test'
         AND price.livemode = 0
       LIMIT 1`,
    )
    .bind(licenseOfferId)
    .first<LicenseOfferSnapshotRow>();
}

function snapshotBoolean(value: number, label: string): boolean {
  if (value !== 0 && value !== 1) {
    throw integrity(`D1 returned an invalid ${label}.`);
  }
  return value === 1;
}

function snapshotAllowedMedia(value: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw integrity("D1 returned invalid allowed-media JSON.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    !parsed.every((item) => typeof item === "string" && item.length > 0)
  ) {
    throw integrity("D1 returned an invalid allowed-media definition.");
  }
  return Object.freeze([...parsed]);
}

function offerSnapshot(row: LicenseOfferSnapshotRow): LicenseTermsSnapshot {
  if (
    row.product_type !== "license" ||
    row.product_resource_type !== "track" ||
    row.product_resource_id !== row.track_id ||
    row.price_product_id !== row.product_id ||
    row.price_environment !== "test" ||
    row.price_livemode !== 0 ||
    !Number.isSafeInteger(row.offer_revision) ||
    row.offer_revision < 1 ||
    !Number.isSafeInteger(row.terms_version) ||
    row.terms_version < 1 ||
    !Number.isSafeInteger(row.option_license_credit_cost) ||
    row.option_license_credit_cost < 1 ||
    !Number.isSafeInteger(row.price_amount_minor) ||
    row.price_amount_minor < 1
  ) {
    throw integrity("D1 returned an invalid active license offer.");
  }
  return freezeLicenseTermsSnapshot({
    schemaVersion: 1,
    offer: {
      id: row.offer_id,
      revision: row.offer_revision,
      slug: row.offer_slug,
      commerceProductId: row.product_id,
      commercePriceId: row.price_id,
    },
    track: {
      id: row.track_id,
      revisionId: row.track_revision_id,
      slug: row.track_slug,
      title: row.track_title,
    },
    terms: {
      id: row.terms_id,
      versionId: row.terms_version_id,
      version: row.terms_version,
      slug: row.terms_slug,
      name: row.terms_name,
      title: row.terms_title,
      introduction: row.terms_introduction,
      generalTerms: row.terms_general_terms,
      disclaimer: row.terms_disclaimer,
    },
    option: {
      id: row.option_id,
      optionKey: row.option_key,
      label: row.option_label,
      description: row.option_description,
      usageCategory: row.option_usage_category,
      allowedMedia: snapshotAllowedMedia(row.option_allowed_media_json),
      audienceLabel: row.option_audience_label,
      maxAudience: row.option_max_audience,
      distributionLabel: row.option_distribution_label,
      maxCopies: row.option_max_copies,
      termMonths: row.option_term_months,
      territory: row.option_territory,
      attributionRequired: snapshotBoolean(
        row.option_attribution_required,
        "attribution requirement",
      ),
      attributionText: row.option_attribution_text,
      exclusive: snapshotBoolean(row.option_exclusive, "exclusivity"),
      requiresApproval: snapshotBoolean(
        row.option_requires_approval,
        "approval requirement",
      ),
      licenseCreditCost: row.option_license_credit_cost,
      includesTrackDownload: snapshotBoolean(
        row.option_includes_track_download,
        "track-download setting",
      ),
    },
    testPrice: {
      id: row.price_id,
      amountMinor: row.price_amount_minor,
      currency: row.price_currency,
    },
  });
}

function prepareLicenseEvent(
  binding: D1Database,
  input: {
    readonly id: string;
    readonly customerUserId: string;
    readonly licenseRequestId: string | null;
    readonly issuedLicenseId: string | null;
    readonly eventType: string;
    readonly actorUserId: string | null;
    readonly source: LicenseEventSource;
    readonly orderId?: string | null;
    readonly creditLedgerEntryId?: string | null;
    readonly fulfillmentEventId?: string | null;
    readonly details: Record<string, unknown>;
    readonly idempotencyKey: string;
  },
  conditionSql: string,
  conditionBindings: readonly (null | number | string)[],
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO license_events
        (id, customer_user_id, license_request_id, issued_license_id,
         event_type, actor_user_id, source, order_id, credit_ledger_entry_id,
         fulfillment_event_id, details_json, idempotency_key)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${conditionSql}`,
    )
    .bind(
      input.id,
      input.customerUserId,
      input.licenseRequestId,
      input.issuedLicenseId,
      input.eventType,
      input.actorUserId,
      input.source,
      input.orderId ?? null,
      input.creditLedgerEntryId ?? null,
      input.fulfillmentEventId ?? null,
      JSON.stringify(input.details),
      input.idempotencyKey,
      ...conditionBindings,
    );
}

export async function submitLicenseRequest(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<LicenseRequestMutationReceipt>> {
  await requireActiveCustomer(binding, context.actorUserId);
  const validated = validateLicenseRequestSubmitInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "license.request.submit";
  const mutation = await prepareMutation<LicenseRequestMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const offerRow = await readActiveOfferSnapshotRow(
    binding,
    input.licenseOfferId,
  );
  if (!offerRow) throw notFound("offer");
  const termsSnapshot = offerSnapshot(offerRow);
  const intendedUseSnapshot = freezeLicenseIntendedUseSnapshot({
    schemaVersion: 1,
    licenseeName: input.licenseeName,
    projectTitle: input.projectTitle,
    intendedUse: input.intendedUse,
    projectDescription: input.projectDescription,
  });
  const state: LicenseRequestState = termsSnapshot.option.requiresApproval
    ? "pending_approval"
    : "submitted";
  const licenseRequestId = `license_request_${crypto.randomUUID()}`;
  const eventId = `license_event_${crypto.randomUUID()}`;
  const result: LicenseRequestMutationReceipt = Object.freeze({
    licenseRequestId,
    state,
    revision: 1,
    requiresApproval: termsSnapshot.option.requiresApproval,
  });
  const authority = activeCustomerCondition(context.actorUserId);
  const requestCondition = `EXISTS (
    SELECT 1 FROM license_requests
    WHERE id = ? AND customer_user_id = ? AND state = ? AND revision = 1
      AND last_operation_key = ?
  ) AND ${authority.sql}`;
  const requestConditionBindings: readonly (number | string)[] = [
    licenseRequestId,
    context.actorUserId,
    state,
    mutation.namespacedKey,
    ...authority.bindings,
  ];
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO license_requests
          (id, customer_user_id, license_offer_id, license_offer_revision,
           track_id, license_terms_version_id, license_option_id,
           licensee_name, project_title, intended_use, project_description,
           intended_use_snapshot_json, terms_snapshot_json, state,
           revision, last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?
         WHERE EXISTS (
           SELECT 1
           FROM license_offers offer
           JOIN tracks t ON t.id = offer.track_id
           JOIN license_terms lt ON lt.id = offer.license_terms_id
           JOIN commerce_products cp ON cp.id = offer.commerce_product_id
           JOIN commerce_prices price
             ON price.id = offer.commerce_price_id
            AND price.commerce_product_id = cp.id
           WHERE offer.id = ? AND offer.revision = ? AND offer.state = 'active'
             AND t.publication_state = 'published'
             AND t.published_revision_id = offer.track_revision_id
             AND lt.state = 'active'
             AND cp.state = 'active' AND cp.product_type = 'license'
             AND cp.resource_type = 'track' AND cp.resource_id = t.id
             AND price.active = 1 AND price.billing_interval = 'one_time'
             AND price.stripe_environment = 'test' AND price.livemode = 0
         )
           AND ${authority.sql}`,
      )
      .bind(
        licenseRequestId,
        context.actorUserId,
        termsSnapshot.offer.id,
        termsSnapshot.offer.revision,
        termsSnapshot.track.id,
        termsSnapshot.terms.versionId,
        termsSnapshot.option.id,
        input.licenseeName,
        input.projectTitle,
        input.intendedUse,
        input.projectDescription,
        serializeLicenseSnapshot(intendedUseSnapshot),
        serializeLicenseSnapshot(termsSnapshot),
        state,
        mutation.namespacedKey,
        termsSnapshot.offer.id,
        termsSnapshot.offer.revision,
        ...authority.bindings,
      ),
    prepareLicenseEvent(
      binding,
      {
        id: eventId,
        customerUserId: context.actorUserId,
        licenseRequestId,
        issuedLicenseId: null,
        eventType: "submitted",
        actorUserId: context.actorUserId,
        source: "customer",
        details: {
          state,
          requiresApproval: termsSnapshot.option.requiresApproval,
          licenseOfferId: termsSnapshot.offer.id,
          licenseOfferRevision: termsSnapshot.offer.revision,
        },
        idempotencyKey: mutation.namespacedKey,
      },
      requestCondition,
      requestConditionBindings,
    ),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "license-request",
        subjectId: licenseRequestId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          licenseOfferId: termsSnapshot.offer.id,
          licenseOfferRevision: termsSnapshot.offer.revision,
          state,
        },
        result: { ...result },
      },
      `${requestCondition} AND EXISTS (
        SELECT 1 FROM license_events
        WHERE id = ? AND idempotency_key = ?
      )`,
      [...requestConditionBindings, eventId, mutation.namespacedKey],
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("license request");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "license request");
  }
}

async function readLicenseRequestRow(
  binding: D1Database,
  licenseRequestId: string,
): Promise<LicenseRequestRow | null> {
  return binding
    .prepare(
      `SELECT id, customer_user_id, license_offer_id,
              license_offer_revision, track_id, license_terms_version_id,
              license_option_id, state, approved_by_user_id, approved_at,
              terms_snapshot_json, intended_use_snapshot_json, revision
       FROM license_requests WHERE id = ?1 LIMIT 1`,
    )
    .bind(licenseRequestId)
    .first<LicenseRequestRow>();
}

async function decideLicenseRequest(
  binding: D1Database,
  rawLicenseRequestId: string,
  rawInput: unknown,
  decision: "approve" | "reject",
  context: MutationContext,
): Promise<MutationResult<LicenseRequestMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const licenseRequestId = safeId(rawLicenseRequestId, "licenseRequestId");
  const validated = validateLicenseRequestDecisionInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = `license.request.${decision}`;
  const mutation = await prepareMutation<LicenseRequestMutationReceipt>(
    binding,
    operation,
    context,
    { licenseRequestId, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const request = await readLicenseRequestRow(binding, licenseRequestId);
  if (!request) throw notFound("request");
  if (request.revision !== input.expectedRevision) {
    throw staleMutation("license request");
  }
  const snapshot = parseLicenseTermsSnapshotJson(request.terms_snapshot_json);
  let nextState: LicenseRequestState;
  try {
    nextState = transitionLicenseRequestState(
      request.state,
      decision,
      snapshot.option.requiresApproval,
    );
  } catch (error) {
    if (error instanceof LicenseStateTransitionError) {
      throw unavailable(
        error.message,
        "This license request cannot make that decision.",
      );
    }
    throw error;
  }
  const nextRevision = input.expectedRevision + 1;
  const result: LicenseRequestMutationReceipt = Object.freeze({
    licenseRequestId,
    state: nextState,
    revision: nextRevision,
    requiresApproval: snapshot.option.requiresApproval,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const eventId = `license_event_${crypto.randomUUID()}`;
  const update =
    decision === "approve"
      ? binding
          .prepare(
            `UPDATE license_requests
             SET state = 'approved', approved_by_user_id = ?, approved_at = ?,
                 revision = ?, last_operation_key = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND state = 'pending_approval' AND revision = ?
               AND ${authority.sql}`,
          )
          .bind(
            context.actorUserId,
            input.decidedAt,
            nextRevision,
            mutation.namespacedKey,
            licenseRequestId,
            input.expectedRevision,
            ...authority.bindings,
          )
      : binding
          .prepare(
            `UPDATE license_requests
             SET state = 'rejected', rejected_by_user_id = ?, rejected_at = ?,
                 revision = ?, last_operation_key = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND state = 'pending_approval' AND revision = ?
               AND ${authority.sql}`,
          )
          .bind(
            context.actorUserId,
            input.decidedAt,
            nextRevision,
            mutation.namespacedKey,
            licenseRequestId,
            input.expectedRevision,
            ...authority.bindings,
          );
  const requestCondition = `EXISTS (
    SELECT 1 FROM license_requests
    WHERE id = ? AND customer_user_id = ? AND state = ? AND revision = ?
      AND last_operation_key = ?
  ) AND ${authority.sql}`;
  const requestConditionBindings: readonly (number | string)[] = [
    licenseRequestId,
    request.customer_user_id,
    nextState,
    nextRevision,
    mutation.namespacedKey,
    ...authority.bindings,
  ];
  const statements: D1PreparedStatement[] = [
    update,
    prepareLicenseEvent(
      binding,
      {
        id: eventId,
        customerUserId: request.customer_user_id,
        licenseRequestId,
        issuedLicenseId: null,
        eventType: nextState,
        actorUserId: context.actorUserId,
        source: "owner",
        details: { reason: input.reason, previousState: request.state },
        idempotencyKey: mutation.namespacedKey,
      },
      requestCondition,
      requestConditionBindings,
    ),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "license-request",
        subjectId: licenseRequestId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { reason: input.reason, previousState: request.state },
        result: { ...result },
      },
      `${requestCondition} AND EXISTS (
        SELECT 1 FROM license_events WHERE id = ? AND idempotency_key = ?
      )`,
      [...requestConditionBindings, eventId, mutation.namespacedKey],
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("license request");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "license request");
  }
}

export async function approveLicenseRequest(
  binding: D1Database,
  licenseRequestId: string,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<LicenseRequestMutationReceipt>> {
  return decideLicenseRequest(
    binding,
    licenseRequestId,
    rawInput,
    "approve",
    context,
  );
}

export async function rejectLicenseRequest(
  binding: D1Database,
  licenseRequestId: string,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<LicenseRequestMutationReceipt>> {
  return decideLicenseRequest(
    binding,
    licenseRequestId,
    rawInput,
    "reject",
    context,
  );
}

function balancedSqlAnd(predicates: readonly string[]): string {
  if (predicates.length === 0) return "1 = 1";
  if (predicates.length === 1) return predicates[0];
  const midpoint = Math.floor(predicates.length / 2);
  return `(${balancedSqlAnd(predicates.slice(0, midpoint))}
    AND ${balancedSqlAnd(predicates.slice(midpoint))})`;
}

function stripeTestLicenseFulfillmentCondition(
  input: StripeTestLicenseFulfillmentInput,
  expectedRequest: LicenseRequestRow | null = null,
  issuedOperationKey: string | null = null,
): SqlLicenseCondition {
  const expectedRequestPredicates =
    expectedRequest === null
      ? ["request.state = 'approved'"]
      : [
          "request.id = ?",
          "request.terms_snapshot_json = ?",
          `(
            (request.state = 'approved' AND request.revision = ?)
            OR (
              request.state = 'issued'
              AND request.revision = ?
              AND request.last_operation_key = ?
            )
          )`,
        ];
  const expectedRequestBindings =
    expectedRequest === null
      ? []
      : [
          expectedRequest.id,
          expectedRequest.terms_snapshot_json,
          expectedRequest.revision,
          expectedRequest.revision + 1,
          issuedOperationKey ?? "",
        ];
  const predicates = [
    "fulfillment.id = ?",
    "fulfillment.commerce_event_id = ?",
    "fulfillment.order_id = ?",
    "fulfillment.customer_user_id = ?",
    "fulfillment.commerce_product_id = ?",
    "fulfillment.kind = 'one_time'",
    "fulfillment.provider_object_id = ?",
    "fulfillment.facts_fingerprint = ?",
    "fulfillment.stripe_environment = 'test'",
    "fulfillment.livemode = 0",
    "event.id = ?",
    "event.stripe_event_id = ?",
    `event.event_type IN (
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded'
    )`,
    "event.stripe_object_id = ?",
    "event.event_created_at = ?",
    "event.facts_fingerprint = ?",
    "event.stripe_environment = 'test'",
    "event.livemode = 0",
    "provider_order.id = ?",
    "provider_order.customer_user_id = ?",
    "provider_order.stripe_environment = 'test'",
    "provider_order.livemode = 0",
    `(
      (
        event.status = 'processing'
        AND fulfillment.status = 'processing'
        AND provider_order.status = 'pending'
      ) OR (
        event.status = 'completed'
        AND fulfillment.status = 'fulfilled'
        AND provider_order.status = 'fulfilled'
      )
    )`,
    "checkout.customer_user_id = ?",
    "checkout.commerce_product_id = ?",
    "checkout.commerce_price_id = ?",
    "checkout.mode = 'payment'",
    "checkout.status = 'completed'",
    "checkout.stripe_checkout_session_id = event.stripe_object_id",
    "checkout.stripe_checkout_session_id = fulfillment.provider_object_id",
    "checkout.stripe_environment = 'test'",
    "checkout.livemode = 0",
    "item.commerce_product_id = ?",
    "item.commerce_price_id = ?",
    "item.product_type = 'license'",
    "item.quantity = 1",
    "item.commerce_product_revision = product.revision",
    "item.product_name = product.name",
    "item.unit_amount_minor = price.amount_minor",
    "item.currency = price.currency",
    "item.stripe_environment = 'test'",
    "item.livemode = 0",
    "product.id = ?",
    "product.product_type = 'license'",
    "product.resource_type = 'track'",
    "product.resource_id = request.track_id",
    "product.state = 'active'",
    "price.id = ?",
    "price.active = 1",
    "price.billing_interval = 'one_time'",
    "price.interval_count = 1",
    "price.stripe_environment = 'test'",
    "price.livemode = 0",
    "provider_order.total_minor = item.unit_amount_minor",
    "provider_order.currency = item.currency",
    "checkout.amount_minor = item.unit_amount_minor",
    "checkout.currency = item.currency",
    "request.customer_user_id = ?",
    "request.stripe_environment = 'test'",
    "request.livemode = 0",
    "offer.state = 'active'",
    "offer.track_id = request.track_id",
    "offer.license_terms_version_id = request.license_terms_version_id",
    "offer.license_option_id = request.license_option_id",
    "offer.commerce_product_id = product.id",
    "offer.commerce_price_id = price.id",
    "json_extract(request.terms_snapshot_json, '$.offer.id') = offer.id",
    "json_extract(request.terms_snapshot_json, '$.offer.revision') = offer.revision",
    `json_extract(
      request.terms_snapshot_json,
      '$.offer.commerceProductId'
    ) = product.id`,
    `json_extract(
      request.terms_snapshot_json,
      '$.offer.commercePriceId'
    ) = price.id`,
    "json_extract(request.terms_snapshot_json, '$.track.id') = request.track_id",
    "json_extract(request.terms_snapshot_json, '$.testPrice.id') = price.id",
    `json_extract(
      request.terms_snapshot_json,
      '$.testPrice.amountMinor'
    ) = price.amount_minor`,
    `json_extract(
      request.terms_snapshot_json,
      '$.testPrice.currency'
    ) = price.currency`,
    `EXISTS (
      SELECT 1
      FROM users AS provider_customer
      JOIN role_assignments AS provider_customer_role
        ON provider_customer_role.user_id = provider_customer.id
       AND provider_customer_role.role_key = 'customer'
       AND provider_customer_role.revoked_at IS NULL
      WHERE provider_customer.id = ?
        AND provider_customer.status = 'active'
    )`,
    ...expectedRequestPredicates,
  ];
  return Object.freeze({
    sql: `EXISTS (
      SELECT 1
      ${STRIPE_TEST_LICENSE_FULFILLMENT_FROM}
      WHERE ${balancedSqlAnd(predicates)}
    )`,
    bindings: Object.freeze([
      input.fulfillmentEventId,
      input.commerceEventId,
      input.orderId,
      input.customerUserId,
      input.commerceProductId,
      input.fulfillmentProviderObjectId,
      input.factsFingerprint,
      input.commerceEventId,
      input.stripeEventId,
      input.stripeObjectId,
      input.providerEventCreatedAt,
      input.factsFingerprint,
      input.orderId,
      input.customerUserId,
      input.customerUserId,
      input.commerceProductId,
      input.commercePriceId,
      input.commerceProductId,
      input.commercePriceId,
      input.commerceProductId,
      input.commercePriceId,
      input.customerUserId,
      input.customerUserId,
      ...expectedRequestBindings,
    ]),
  });
}

function stripeTestLicenseFulfillmentUnavailable(): RuntimeError {
  return new RuntimeError(
    "LICENSE_PROVIDER_FULFILLMENT_REQUIRED",
    "The exact verified Stripe Test fulfillment is not ready for license issuance.",
    {
      status: 409,
      publicMessage:
        "The verified Stripe Test fulfillment is not ready for this license.",
    },
  );
}

async function readStripeTestLicenseFulfillmentRequest(
  binding: D1Database,
  input: StripeTestLicenseFulfillmentInput,
): Promise<LicenseRequestRow> {
  const condition = stripeTestLicenseFulfillmentCondition(input);
  const exact = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${condition.sql}`)
    .bind(...condition.bindings)
    .first<CountRow>();
  if (exact?.count !== 1) throw stripeTestLicenseFulfillmentUnavailable();
  const row = await binding
    .prepare(
      `SELECT request.id, request.customer_user_id,
              request.license_offer_id, request.license_offer_revision,
              request.track_id, request.license_terms_version_id,
              request.license_option_id, request.state,
              request.approved_by_user_id, request.approved_at,
              request.terms_snapshot_json,
              request.intended_use_snapshot_json, request.revision
       ${STRIPE_TEST_LICENSE_FULFILLMENT_FROM}
       WHERE fulfillment.id = ?1
         AND fulfillment.commerce_event_id = ?2
         AND fulfillment.order_id = ?3
         AND fulfillment.customer_user_id = ?4
         AND fulfillment.commerce_product_id = ?5
         AND checkout.commerce_price_id = ?6
       LIMIT 1`,
    )
    .bind(
      input.fulfillmentEventId,
      input.commerceEventId,
      input.orderId,
      input.customerUserId,
      input.commerceProductId,
      input.commercePriceId,
    )
    .first<LicenseRequestRow>();
  if (!row) throw stripeTestLicenseFulfillmentUnavailable();
  return row;
}

async function validateStripeIssuanceSource(
  binding: D1Database,
  input: Extract<LicenseIssuanceInput, { source: "stripe_test_order" }>,
  request: LicenseRequestRow,
  snapshot: LicenseTermsSnapshot,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       FROM orders o
       JOIN checkout_sessions checkout
         ON checkout.id = o.checkout_session_id
       JOIN order_items item ON item.order_id = o.id
       JOIN fulfillment_events fulfillment
         ON fulfillment.id = ?2
        AND fulfillment.order_id = o.id
       WHERE o.id = ?1
         AND o.customer_user_id = ?3
         AND o.status = 'fulfilled'
         AND o.stripe_environment = 'test' AND o.livemode = 0
         AND checkout.customer_user_id = ?3
         AND checkout.license_request_id = ?4
         AND checkout.status = 'completed'
         AND checkout.stripe_environment = 'test' AND checkout.livemode = 0
         AND item.product_type = 'license'
         AND item.commerce_product_id = ?5
         AND item.commerce_price_id = ?6
         AND item.stripe_environment = 'test' AND item.livemode = 0
         AND fulfillment.customer_user_id = ?3
         AND fulfillment.commerce_product_id = ?5
         AND fulfillment.status = 'fulfilled'
         AND fulfillment.stripe_environment = 'test'
         AND fulfillment.livemode = 0`,
    )
    .bind(
      input.orderId,
      input.fulfillmentEventId,
      request.customer_user_id,
      request.id,
      snapshot.offer.commerceProductId,
      snapshot.offer.commercePriceId,
    )
    .first<CountRow>();
  if (row?.count !== 1) {
    throw unavailable(
      "Stripe Test license issuance requires one verified fulfilled test order.",
      "The verified test order is not ready for license issuance.",
    );
  }
}

async function validateCreditIssuanceSource(
  binding: D1Database,
  input: Extract<LicenseIssuanceInput, { source: "credit_redemption" }>,
  request: LicenseRequestRow,
  snapshot: LicenseTermsSnapshot,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       FROM credit_ledger_entries ledger
       JOIN credit_reservations reservation
         ON reservation.id = ledger.credit_reservation_id
       WHERE ledger.id = ?1
         AND ledger.customer_user_id = ?2
         AND ledger.credit_kind = 'license'
         AND ledger.entry_type = 'consumption'
         AND ledger.consumed_delta = ?3
         AND ledger.origin_type = 'license'
         AND ledger.origin_id = ?4
         AND ledger.stripe_environment = 'test' AND ledger.livemode = 0
         AND reservation.customer_user_id = ?2
         AND reservation.credit_kind = 'license'
         AND reservation.purpose_type = 'license_request'
         AND reservation.purpose_id = ?4
         AND reservation.quantity = ?3
         AND reservation.state = 'consumed'
         AND reservation.stripe_environment = 'test'
         AND reservation.livemode = 0`,
    )
    .bind(
      input.creditLedgerEntryId,
      request.customer_user_id,
      snapshot.option.licenseCreditCost,
      request.id,
    )
    .first<CountRow>();
  if (row?.count !== 1) {
    throw unavailable(
      "Credit license issuance requires an exact consumed license-credit reservation.",
      "The consumed license credit is not ready for issuance.",
    );
  }
}

function issuanceAuthority(
  input: LicenseIssuanceInput,
  context: MutationContext,
): SqlAuthorityCondition {
  return input.source === "owner_approval"
    ? activeOwnerCondition(context.actorUserId)
    : activeCustomerCondition(context.actorUserId);
}

function issuanceEventSource(input: LicenseIssuanceInput): LicenseEventSource {
  if (input.source === "owner_approval") return "owner";
  if (input.source === "credit_redemption") return "credit";
  return "stripe_test";
}

function licenseAcquisitionExclusivityCondition(
  input: LicenseIssuanceInput,
  request: LicenseRequestRow,
): SqlLicenseCondition {
  const blocksCheckout = input.source !== "stripe_test_order";
  const blocksCredit = input.source !== "credit_redemption";
  const predicates: string[] = [];
  const bindings: string[] = [];
  if (blocksCheckout) {
    predicates.push(`NOT EXISTS (
      SELECT 1
      FROM checkout_sessions AS acquisition_checkout
      WHERE acquisition_checkout.license_request_id = ?
        AND acquisition_checkout.customer_user_id = ?
        AND acquisition_checkout.status IN ('creating', 'open', 'completed')
        AND acquisition_checkout.stripe_environment = 'test'
        AND acquisition_checkout.livemode = 0
    )`);
    bindings.push(request.id, request.customer_user_id);
  }
  if (blocksCredit) {
    predicates.push(`NOT EXISTS (
      SELECT 1
      FROM credit_reservations AS acquisition_reservation
      WHERE acquisition_reservation.purpose_type = 'license_request'
        AND acquisition_reservation.purpose_id = ?
        AND acquisition_reservation.customer_user_id = ?
        AND acquisition_reservation.credit_kind = 'license'
        AND acquisition_reservation.state IN ('reserved', 'consumed')
        AND acquisition_reservation.stripe_environment = 'test'
        AND acquisition_reservation.livemode = 0
    )`);
    bindings.push(request.id, request.customer_user_id);
  }
  return Object.freeze({
    sql: predicates.length === 0 ? "1 = 1" : predicates.join(" AND "),
    bindings: Object.freeze(bindings),
  });
}

async function issueLicenseInternal(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
  providerInput: StripeTestLicenseFulfillmentInput | null,
): Promise<MutationResult<LicenseIssuanceReceipt>> {
  let input: LicenseIssuanceInput;
  let request: LicenseRequestRow | null;
  let operation: string;
  let mutation: PreparedMutation<LicenseIssuanceReceipt>;
  if (providerInput === null) {
    const validated = validateLicenseIssuanceInput(rawInput);
    if (!validated.ok) throw invalidInput(validated.issues);
    input = validated.value;
    if (input.source === "owner_approval") {
      await requireActiveOwner(binding, context.actorUserId);
    } else {
      await requireActiveCustomer(binding, context.actorUserId);
    }
    operation = `license.issue.${input.source}`;
    mutation = await prepareMutation<LicenseIssuanceReceipt>(
      binding,
      operation,
      context,
      input,
    );
    if (mutation.replayValue) {
      return { value: mutation.replayValue, replayed: true };
    }
    request = await readLicenseRequestRow(binding, input.licenseRequestId);
  } else {
    operation = "license.issue.stripe-test-fulfillment";
    mutation = await prepareMutation<LicenseIssuanceReceipt>(
      binding,
      operation,
      context,
      providerInput,
    );
    if (mutation.replayValue) {
      return { value: mutation.replayValue, replayed: true };
    }
    request = await readStripeTestLicenseFulfillmentRequest(
      binding,
      providerInput,
    );
    input = Object.freeze({
      source: "stripe_test_order",
      licenseRequestId: request.id,
      expectedRevision: request.revision,
      issuedAt: providerInput.providerEventCreatedAt,
      orderId: providerInput.orderId,
      fulfillmentEventId: providerInput.fulfillmentEventId,
    });
  }
  if (!request) throw notFound("request");
  if (request.revision !== input.expectedRevision) {
    throw staleMutation("license request");
  }
  if (
    providerInput === null &&
    input.source !== "owner_approval" &&
    context.actorUserId !== request.customer_user_id
  ) {
    throw new RuntimeError(
      "LICENSE_CUSTOMER_MISMATCH",
      "A customer may issue only their own prepared license request.",
      { status: 403, publicMessage: "That license request is not available." },
    );
  }
  const snapshot = parseLicenseTermsSnapshotJson(request.terms_snapshot_json);
  if (input.source === "owner_approval" && request.state !== "approved") {
    throw unavailable(
      "Owner issuance requires an approved license request.",
      "Approve this license request before issuing it.",
    );
  }
  try {
    transitionLicenseRequestState(
      request.state,
      "issue",
      snapshot.option.requiresApproval,
    );
  } catch (error) {
    if (error instanceof LicenseStateTransitionError) {
      throw unavailable(
        error.message,
        "This license request is not ready to issue.",
      );
    }
    throw error;
  }
  if (input.source === "stripe_test_order" && providerInput === null) {
    await validateStripeIssuanceSource(binding, input, request, snapshot);
  } else if (input.source === "credit_redemption") {
    await validateCreditIssuanceSource(binding, input, request, snapshot);
  }

  const expiresAt = addLicenseTermMonths(
    input.issuedAt,
    snapshot.option.termMonths,
  );
  const issuedLicenseId = `issued_license_${crypto.randomUUID()}`;
  const documentId = `license_document_${crypto.randomUUID()}`;
  const documentJobId = `license_document_job_${crypto.randomUUID()}`;
  const documentEntitlementId = `entitlement_${crypto.randomUUID()}`;
  const trackEntitlementId = snapshot.option.includesTrackDownload
    ? `entitlement_${crypto.randomUUID()}`
    : null;
  const entitlementIds = Object.freeze(
    trackEntitlementId === null
      ? [documentEntitlementId]
      : [trackEntitlementId, documentEntitlementId],
  );
  const eventId = `license_event_${crypto.randomUUID()}`;
  const orderId = input.source === "stripe_test_order" ? input.orderId : null;
  const fulfillmentEventId =
    input.source === "stripe_test_order" ? input.fulfillmentEventId : null;
  const creditLedgerEntryId =
    input.source === "credit_redemption" ? input.creditLedgerEntryId : null;
  const result: LicenseIssuanceReceipt = Object.freeze({
    issuedLicenseId,
    licenseRequestId: request.id,
    customerUserId: request.customer_user_id,
    source: input.source,
    state: "active",
    issuedAt: input.issuedAt,
    expiresAt,
    documentId,
    documentJobId,
    entitlementIds,
  });
  const authority: SqlLicenseCondition =
    providerInput === null
      ? issuanceAuthority(input, context)
      : Object.freeze({ sql: "1 = 1", bindings: Object.freeze([]) });
  const issueStateSql = snapshot.option.requiresApproval
    ? "state = 'approved'"
    : "state = 'submitted'";
  let sourceConditionSql = "1 = 1";
  let sourceConditionBindings: readonly (number | string)[] = [];
  if (input.source === "stripe_test_order") {
    if (providerInput === null) {
      sourceConditionSql = `EXISTS (
        SELECT 1
        FROM orders o
        JOIN checkout_sessions checkout ON checkout.id = o.checkout_session_id
        JOIN order_items item ON item.order_id = o.id
        JOIN fulfillment_events fulfillment
          ON fulfillment.id = ? AND fulfillment.order_id = o.id
        WHERE o.id = ? AND o.customer_user_id = ? AND o.status = 'fulfilled'
          AND o.stripe_environment = 'test' AND o.livemode = 0
          AND checkout.license_request_id = ? AND checkout.status = 'completed'
          AND checkout.stripe_environment = 'test' AND checkout.livemode = 0
          AND item.product_type = 'license'
          AND item.commerce_product_id = ? AND item.commerce_price_id = ?
          AND item.stripe_environment = 'test' AND item.livemode = 0
          AND fulfillment.customer_user_id = ?
          AND fulfillment.commerce_product_id = ?
          AND fulfillment.status = 'fulfilled'
          AND fulfillment.stripe_environment = 'test'
          AND fulfillment.livemode = 0
      )`;
      sourceConditionBindings = [
        input.fulfillmentEventId,
        input.orderId,
        request.customer_user_id,
        request.id,
        snapshot.offer.commerceProductId,
        snapshot.offer.commercePriceId,
        request.customer_user_id,
        snapshot.offer.commerceProductId,
      ];
    } else {
      const providerCondition = stripeTestLicenseFulfillmentCondition(
        providerInput,
        request,
        mutation.namespacedKey,
      );
      sourceConditionSql = providerCondition.sql;
      sourceConditionBindings = providerCondition.bindings;
    }
  } else if (input.source === "credit_redemption") {
    sourceConditionSql = `EXISTS (
      SELECT 1
      FROM credit_ledger_entries ledger
      JOIN credit_reservations reservation
        ON reservation.id = ledger.credit_reservation_id
      WHERE ledger.id = ? AND ledger.customer_user_id = ?
        AND ledger.credit_kind = 'license'
        AND ledger.entry_type = 'consumption'
        AND ledger.consumed_delta = ?
        AND ledger.origin_type = 'license' AND ledger.origin_id = ?
        AND ledger.stripe_environment = 'test' AND ledger.livemode = 0
        AND reservation.customer_user_id = ?
        AND reservation.credit_kind = 'license'
        AND reservation.purpose_type = 'license_request'
        AND reservation.purpose_id = ? AND reservation.quantity = ?
        AND reservation.state = 'consumed'
        AND reservation.stripe_environment = 'test'
        AND reservation.livemode = 0
    )`;
    sourceConditionBindings = [
      input.creditLedgerEntryId,
      request.customer_user_id,
      snapshot.option.licenseCreditCost,
      request.id,
      request.customer_user_id,
      request.id,
      snapshot.option.licenseCreditCost,
    ];
  }
  const acquisitionExclusivity = licenseAcquisitionExclusivityCondition(
    input,
    request,
  );
  sourceConditionSql = `(${sourceConditionSql}) AND (${acquisitionExclusivity.sql})`;
  sourceConditionBindings = [
    ...sourceConditionBindings,
    ...acquisitionExclusivity.bindings,
  ];
  const issuanceGateSql = `(${sourceConditionSql}) AND (${authority.sql})`;
  const issuanceGateBindings: readonly (number | string)[] = [
    ...sourceConditionBindings,
    ...authority.bindings,
  ];

  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE license_requests
         SET state = 'issued', issued_at = ?, revision = ?,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND ${issueStateSql}
           AND revision = ? AND ${issuanceGateSql}`,
      )
      .bind(
        input.issuedAt,
        input.expectedRevision + 1,
        mutation.namespacedKey,
        request.id,
        request.customer_user_id,
        input.expectedRevision,
        ...issuanceGateBindings,
      ),
    binding
      .prepare(
        `INSERT INTO issued_licenses
          (id, customer_user_id, license_request_id, track_id,
           license_terms_version_id, license_option_id, source, order_id,
           credit_ledger_entry_id, fulfillment_event_id, terms_snapshot_json,
           state, issued_at, expires_at, stripe_environment, livemode,
           revision, last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 'test', 0,
                1, ?
         WHERE EXISTS (
           SELECT 1 FROM license_requests
           WHERE id = ? AND customer_user_id = ? AND state = 'issued'
             AND revision = ? AND last_operation_key = ?
         )
           AND ${issuanceGateSql}`,
      )
      .bind(
        issuedLicenseId,
        request.customer_user_id,
        request.id,
        request.track_id,
        request.license_terms_version_id,
        request.license_option_id,
        input.source,
        orderId,
        creditLedgerEntryId,
        fulfillmentEventId,
        request.terms_snapshot_json,
        input.issuedAt,
        expiresAt,
        mutation.namespacedKey,
        request.id,
        request.customer_user_id,
        input.expectedRevision + 1,
        mutation.namespacedKey,
        ...issuanceGateBindings,
      ),
    binding
      .prepare(
        `INSERT INTO license_documents
          (id, issued_license_id, customer_user_id, state,
           stripe_environment, livemode, revision, last_operation_key)
         SELECT ?, ?, ?, 'queued', 'test', 0, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM issued_licenses
           WHERE id = ? AND customer_user_id = ? AND state = 'active'
             AND last_operation_key = ?
         ) AND ${issuanceGateSql}`,
      )
      .bind(
        documentId,
        issuedLicenseId,
        request.customer_user_id,
        `${mutation.namespacedKey}:document`,
        issuedLicenseId,
        request.customer_user_id,
        mutation.namespacedKey,
        ...issuanceGateBindings,
      ),
    binding
      .prepare(
        `INSERT INTO license_document_jobs
          (id, license_document_id, status, attempts, last_operation_key)
         SELECT ?, ?, 'queued', 0, ?
         WHERE EXISTS (
           SELECT 1 FROM license_documents
           WHERE id = ? AND issued_license_id = ? AND state = 'queued'
         ) AND ${issuanceGateSql}`,
      )
      .bind(
        documentJobId,
        documentId,
        `${mutation.namespacedKey}:document-job`,
        documentId,
        issuedLicenseId,
        ...issuanceGateBindings,
      ),
    binding
      .prepare(
        `INSERT INTO entitlements
          (id, user_id, source_type, source_id, resource_type, resource_id,
           actions_json, state, starts_at, expires_at, download_disposition,
           stripe_environment, livemode, fulfillment_event_id, revision,
           last_operation_key)
         SELECT ?, ?, 'license', ?, 'license-document', ?, '["view","download"]',
                'active', ?, ?, 'attachment', 'test', 0, ?, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM license_documents
           WHERE id = ? AND issued_license_id = ? AND customer_user_id = ?
         ) AND ${issuanceGateSql}`,
      )
      .bind(
        documentEntitlementId,
        request.customer_user_id,
        issuedLicenseId,
        documentId,
        input.issuedAt,
        expiresAt,
        fulfillmentEventId,
        `${mutation.namespacedKey}:document-entitlement`,
        documentId,
        issuedLicenseId,
        request.customer_user_id,
        ...issuanceGateBindings,
      ),
  ];
  if (trackEntitlementId !== null) {
    statements.push(
      binding
        .prepare(
          `INSERT INTO entitlements
            (id, user_id, source_type, source_id, resource_type, resource_id,
             actions_json, state, starts_at, expires_at, download_disposition,
             stripe_environment, livemode, fulfillment_event_id, revision,
             last_operation_key)
           SELECT ?, ?, 'license', ?, 'track', ?, '["view","stream","download"]',
                  'active', ?, ?, 'attachment', 'test', 0, ?, 1, ?
           WHERE EXISTS (
             SELECT 1 FROM issued_licenses
             WHERE id = ? AND customer_user_id = ? AND state = 'active'
           ) AND ${issuanceGateSql}`,
        )
        .bind(
          trackEntitlementId,
          request.customer_user_id,
          issuedLicenseId,
          request.track_id,
          input.issuedAt,
          expiresAt,
          fulfillmentEventId,
          `${mutation.namespacedKey}:track-entitlement`,
          issuedLicenseId,
          request.customer_user_id,
          ...issuanceGateBindings,
        ),
    );
  }
  const issuedCondition = `EXISTS (
    SELECT 1 FROM issued_licenses
    WHERE id = ? AND customer_user_id = ? AND license_request_id = ?
      AND source = ? AND state = 'active' AND last_operation_key = ?
  ) AND ${issuanceGateSql}`;
  const issuedConditionBindings: readonly (number | string)[] = [
    issuedLicenseId,
    request.customer_user_id,
    request.id,
    input.source,
    mutation.namespacedKey,
    ...issuanceGateBindings,
  ];
  const eventIndex = statements.length;
  statements.push(
    prepareLicenseEvent(
      binding,
      {
        id: eventId,
        customerUserId: request.customer_user_id,
        licenseRequestId: request.id,
        issuedLicenseId,
        eventType: "issued",
        actorUserId: providerInput === null ? context.actorUserId : null,
        source: issuanceEventSource(input),
        orderId,
        creditLedgerEntryId,
        fulfillmentEventId,
        details: {
          source: input.source,
          issuedAt: input.issuedAt,
          expiresAt,
          documentId,
          ...(providerInput === null
            ? {}
            : {
                commerceEventId: providerInput.commerceEventId,
                stripeEventId: providerInput.stripeEventId,
                stripeObjectId: providerInput.stripeObjectId,
                factsFingerprint: providerInput.factsFingerprint,
                fulfillmentProviderObjectId:
                  providerInput.fulfillmentProviderObjectId,
              }),
        },
        idempotencyKey: mutation.namespacedKey,
      },
      issuedCondition,
      issuedConditionBindings,
    ),
  );
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: providerInput === null ? context.actorUserId : null,
        action: operation,
        subjectType: "issued-license",
        subjectId: issuedLicenseId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          licenseRequestId: request.id,
          source: input.source,
          orderId,
          creditLedgerEntryId,
          fulfillmentEventId,
          ...(providerInput === null
            ? {}
            : {
                commerceEventId: providerInput.commerceEventId,
                commerceProductId: providerInput.commerceProductId,
                commercePriceId: providerInput.commercePriceId,
                stripeEventId: providerInput.stripeEventId,
                stripeObjectId: providerInput.stripeObjectId,
                factsFingerprint: providerInput.factsFingerprint,
                fulfillmentProviderObjectId:
                  providerInput.fulfillmentProviderObjectId,
              }),
        },
        result: { ...result },
      },
      `${issuedCondition} AND EXISTS (
        SELECT 1 FROM license_documents
        WHERE id = ? AND issued_license_id = ? AND state = 'queued'
      ) AND EXISTS (
        SELECT 1 FROM license_document_jobs
        WHERE id = ? AND license_document_id = ? AND status = 'queued'
      ) AND (
        SELECT COUNT(*) FROM entitlements
        WHERE source_type = 'license' AND source_id = ? AND state = 'active'
      ) = ? AND EXISTS (
        SELECT 1 FROM license_events WHERE id = ? AND idempotency_key = ?
      )`,
      [
        ...issuedConditionBindings,
        documentId,
        issuedLicenseId,
        documentJobId,
        documentId,
        issuedLicenseId,
        entitlementIds.length,
        eventId,
        mutation.namespacedKey,
      ],
    ),
  );
  statements.push(
    await prepareServerTelemetryEvent(binding, {
      eventName: "license-issued",
      resourceType: "license",
      resourceId: issuedLicenseId,
      sourceOperationKey: mutation.namespacedKey,
      userId: request.customer_user_id,
      requestContext:
        context.actorUserId === request.customer_user_id
          ? context.telemetry
          : undefined,
      occurredAt: new Date(input.issuedAt),
      durableCondition: {
        sql: issuedCondition,
        bindings: issuedConditionBindings,
      },
    }),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      results.slice(0, auditIndex).some((entry) => changedRows(entry) !== 1) ||
      changedRows(results[eventIndex]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("license issuance");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "license issuance");
  }
}

export async function issueLicense(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<LicenseIssuanceReceipt>> {
  return issueLicenseInternal(binding, rawInput, context, null);
}

/**
 * Projects one signature-verified Stripe Test fulfillment into the licensing
 * domain. Caller identity is intentionally absent. Exact provider, commerce,
 * customer, request, product, price, test-mode, and lifecycle facts are
 * derived from and rechecked in D1 inside every statement in the atomic batch.
 */
export async function issueLicenseFromVerifiedStripeTestFulfillment(
  binding: D1Database,
  rawInput: unknown,
): Promise<MutationResult<LicenseIssuanceReceipt>> {
  const validated = validateStripeTestLicenseFulfillmentInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const internalContext: MutationContext = Object.freeze({
    actorUserId: input.fulfillmentEventId,
    idempotencyKey: input.stripeEventId,
    requestId: input.requestId,
  });
  return issueLicenseInternal(binding, null, internalContext, input);
}

async function readIssuedLicenseRow(
  binding: D1Database,
  issuedLicenseId: string,
): Promise<IssuedLicenseRow | null> {
  return binding
    .prepare(
      `SELECT id, customer_user_id, state, expires_at, revision
       FROM issued_licenses WHERE id = ?1 LIMIT 1`,
    )
    .bind(issuedLicenseId)
    .first<IssuedLicenseRow>();
}

async function transitionIssuedLicense(
  binding: D1Database,
  rawIssuedLicenseId: string,
  rawInput: unknown,
  event: "revoke" | "expire",
  context: MutationContext,
): Promise<MutationResult<IssuedLicenseTerminalReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const issuedLicenseId = safeId(rawIssuedLicenseId, "issuedLicenseId");
  const validated = validateIssuedLicenseTerminalInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = `license.${event}`;
  const mutation = await prepareMutation<IssuedLicenseTerminalReceipt>(
    binding,
    operation,
    context,
    { issuedLicenseId, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const license = await readIssuedLicenseRow(binding, issuedLicenseId);
  if (!license) throw notFound("license");
  if (license.revision !== input.expectedRevision) {
    throw staleMutation("issued license");
  }
  let nextState: Extract<IssuedLicenseState, "revoked" | "expired">;
  try {
    nextState = transitionIssuedLicenseState(
      license.state,
      event,
    ) as typeof nextState;
  } catch (error) {
    if (error instanceof LicenseStateTransitionError) {
      throw unavailable(
        error.message,
        "This license is already in a terminal state.",
      );
    }
    throw error;
  }
  if (
    event === "expire" &&
    (license.expires_at === null ||
      !licenseExpiryReached(input.effectiveAt, license.expires_at))
  ) {
    throw unavailable(
      "A license can expire only at or after its recorded expiry boundary.",
      "This license has not reached its expiry boundary.",
    );
  }
  const entitlementCountRow = await binding
    .prepare(
      `SELECT COUNT(*) AS count FROM entitlements
       WHERE source_type = 'license' AND source_id = ?1 AND state = 'active'`,
    )
    .bind(issuedLicenseId)
    .first<CountRow>();
  const entitlementCount = entitlementCountRow?.count ?? 0;
  if (entitlementCount < 1) {
    throw integrity(
      "An active issued license has no active entitlement records.",
    );
  }
  const nextRevision = input.expectedRevision + 1;
  const result: IssuedLicenseTerminalReceipt = Object.freeze({
    issuedLicenseId,
    state: nextState,
    revision: nextRevision,
    effectiveAt: input.effectiveAt,
    entitlementCount,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const eventId = `license_event_${crypto.randomUUID()}`;
  const terminalColumn = event === "revoke" ? "revoked_at" : "expired_at";
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE issued_licenses
         SET state = ?, ${terminalColumn} = ?, revision = ?,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = 'active' AND revision = ?
           AND ${authority.sql}`,
      )
      .bind(
        nextState,
        input.effectiveAt,
        nextRevision,
        mutation.namespacedKey,
        issuedLicenseId,
        input.expectedRevision,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE entitlements
         SET state = ?, revision = revision + 1, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE source_type = 'license' AND source_id = ? AND state = 'active'
           AND EXISTS (
             SELECT 1 FROM issued_licenses
             WHERE id = ? AND state = ? AND revision = ?
               AND last_operation_key = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        nextState,
        `${mutation.namespacedKey}:entitlements`,
        issuedLicenseId,
        issuedLicenseId,
        nextState,
        nextRevision,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
  ];
  const licenseCondition = `EXISTS (
    SELECT 1 FROM issued_licenses
    WHERE id = ? AND customer_user_id = ? AND state = ? AND revision = ?
      AND last_operation_key = ?
  ) AND (
    SELECT COUNT(*) FROM entitlements
    WHERE source_type = 'license' AND source_id = ? AND state = ?
  ) = ? AND ${authority.sql}`;
  const licenseConditionBindings: readonly (number | string)[] = [
    issuedLicenseId,
    license.customer_user_id,
    nextState,
    nextRevision,
    mutation.namespacedKey,
    issuedLicenseId,
    nextState,
    entitlementCount,
    ...authority.bindings,
  ];
  const eventIndex = statements.length;
  statements.push(
    prepareLicenseEvent(
      binding,
      {
        id: eventId,
        customerUserId: license.customer_user_id,
        licenseRequestId: null,
        issuedLicenseId,
        eventType: nextState,
        actorUserId: context.actorUserId,
        source: "owner",
        details: { reason: input.reason, effectiveAt: input.effectiveAt },
        idempotencyKey: mutation.namespacedKey,
      },
      licenseCondition,
      licenseConditionBindings,
    ),
  );
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "issued-license",
        subjectId: issuedLicenseId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { reason: input.reason, effectiveAt: input.effectiveAt },
        result: { ...result },
      },
      `${licenseCondition} AND EXISTS (
        SELECT 1 FROM license_events WHERE id = ? AND idempotency_key = ?
      )`,
      [...licenseConditionBindings, eventId, mutation.namespacedKey],
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== entitlementCount ||
      changedRows(results[eventIndex]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("issued license");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "issued license");
  }
}

export async function revokeIssuedLicense(
  binding: D1Database,
  issuedLicenseId: string,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<IssuedLicenseTerminalReceipt>> {
  return transitionIssuedLicense(
    binding,
    issuedLicenseId,
    rawInput,
    "revoke",
    context,
  );
}

export async function expireIssuedLicense(
  binding: D1Database,
  issuedLicenseId: string,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<IssuedLicenseTerminalReceipt>> {
  return transitionIssuedLicense(
    binding,
    issuedLicenseId,
    rawInput,
    "expire",
    context,
  );
}
