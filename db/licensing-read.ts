import {
  activeCustomerCondition,
  activeOwnerCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import {
  freezeLicenseTermsSnapshot,
  parseLicenseIntendedUseSnapshotJson,
  parseLicenseTermsSnapshotJson,
} from "@/lib/licensing/snapshot.ts";
import type {
  CustomerLicenseHistoryDTO,
  IssuedLicenseDTO,
  IssuedLicenseState,
  LicenseAdministrationDTO,
  LicenseDocumentDTO,
  LicenseDocumentJobDTO,
  LicenseDocumentJobStatus,
  LicenseDocumentState,
  LicenseEventDTO,
  LicenseEventSource,
  LicenseEventType,
  LicenseIssuanceSource,
  LicenseOfferDTO,
  LicenseOfferState,
  LicenseOptionDefinitionInput,
  LicenseRequestDTO,
  LicenseRequestState,
  LicenseTermsDTO,
  LicenseTermsSnapshot,
  LicenseTermsState,
  LicenseTermsVersionDTO,
} from "@/lib/licensing/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

interface CountRow {
  count: number;
}

interface TermsVersionRow {
  terms_id: unknown;
  terms_slug: unknown;
  terms_state: unknown;
  terms_current_version: unknown;
  terms_created_at: unknown;
  terms_updated_at: unknown;
  version_id: unknown;
  version: unknown;
  name: unknown;
  title: unknown;
  introduction: unknown;
  general_terms: unknown;
  disclaimer: unknown;
  version_created_at: unknown;
}

interface OptionRow {
  id: unknown;
  option_key: unknown;
  label: unknown;
  description: unknown;
  usage_category: unknown;
  allowed_media_json: unknown;
  audience_label: unknown;
  max_audience: unknown;
  distribution_label: unknown;
  max_copies: unknown;
  term_months: unknown;
  territory: unknown;
  attribution_required: unknown;
  attribution_text: unknown;
  exclusive: unknown;
  requires_approval: unknown;
  license_credit_cost: unknown;
  includes_track_download: unknown;
  position: unknown;
}

interface OfferRow extends TermsVersionRow, OptionRow {
  offer_id: unknown;
  offer_slug: unknown;
  offer_state: unknown;
  offer_revision: unknown;
  offer_created_at: unknown;
  offer_updated_at: unknown;
  track_id: unknown;
  track_revision_id: unknown;
  track_slug: unknown;
  track_title: unknown;
  product_id: unknown;
  price_id: unknown;
  amount_minor: unknown;
  currency: unknown;
}

interface RequestRow {
  id: unknown;
  customer_user_id: unknown;
  license_offer_id: unknown;
  license_offer_revision: unknown;
  track_id: unknown;
  state: unknown;
  revision: unknown;
  approved_at: unknown;
  rejected_at: unknown;
  canceled_at: unknown;
  issued_at: unknown;
  terms_snapshot_json: unknown;
  intended_use_snapshot_json: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface IssuedRow {
  id: unknown;
  customer_user_id: unknown;
  license_request_id: unknown;
  track_id: unknown;
  source: unknown;
  order_id: unknown;
  credit_ledger_entry_id: unknown;
  fulfillment_event_id: unknown;
  state: unknown;
  issued_at: unknown;
  expires_at: unknown;
  revoked_at: unknown;
  expired_at: unknown;
  revision: unknown;
  terms_snapshot_json: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface DocumentRow {
  id: unknown;
  issued_license_id: unknown;
  customer_user_id: unknown;
  state: unknown;
  content_digest: unknown;
  byte_length: unknown;
  failure_category: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface EventRow {
  id: unknown;
  customer_user_id: unknown;
  license_request_id: unknown;
  issued_license_id: unknown;
  event_type: unknown;
  actor_user_id: unknown;
  source: unknown;
  order_id: unknown;
  credit_ledger_entry_id: unknown;
  fulfillment_event_id: unknown;
  details_json: unknown;
  created_at: unknown;
}

interface DocumentJobRow {
  id: unknown;
  license_document_id: unknown;
  status: unknown;
  attempts: unknown;
  failure_category: unknown;
  created_at: unknown;
  updated_at: unknown;
}

export class LicensingReadIntegrityError extends Error {
  override readonly name = "LicensingReadIntegrityError";
}

function integrity(message: string): never {
  throw new LicensingReadIntegrityError(message);
}

function safeInputId(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new TypeError(`${field} must be a safe application identifier.`);
  }
  return value;
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") integrity(`D1 returned an invalid ${label}.`);
  return value;
}

function nonBlank(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (parsed.trim() !== parsed || parsed.length === 0) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return parsed;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label, 1);
}

function boolean(value: unknown, label: string): boolean {
  if (value !== 0 && value !== 1) integrity(`D1 returned an invalid ${label}.`);
  return value === 1;
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !Number.isFinite(Date.parse(value))
  ) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function termsState(value: unknown): LicenseTermsState {
  if (value !== "draft" && value !== "active" && value !== "archived") {
    integrity("D1 returned an invalid license-terms state.");
  }
  return value;
}

function offerState(value: unknown): LicenseOfferState {
  return termsState(value);
}

function requestState(value: unknown): LicenseRequestState {
  if (
    value !== "draft" &&
    value !== "submitted" &&
    value !== "pending_approval" &&
    value !== "approved" &&
    value !== "rejected" &&
    value !== "canceled" &&
    value !== "issued"
  ) {
    integrity("D1 returned an invalid license-request state.");
  }
  return value;
}

function issuedState(value: unknown): IssuedLicenseState {
  if (value !== "active" && value !== "revoked" && value !== "expired") {
    integrity("D1 returned an invalid issued-license state.");
  }
  return value;
}

function issuanceSource(value: unknown): LicenseIssuanceSource {
  if (
    value !== "owner_approval" &&
    value !== "credit_redemption" &&
    value !== "stripe_test_order"
  ) {
    integrity("D1 returned an invalid issuance source.");
  }
  return value;
}

function documentState(value: unknown): LicenseDocumentState {
  if (
    value !== "queued" &&
    value !== "processing" &&
    value !== "ready" &&
    value !== "failed"
  ) {
    integrity("D1 returned an invalid license-document state.");
  }
  return value;
}

function documentJobStatus(value: unknown): LicenseDocumentJobStatus {
  if (
    value !== "queued" &&
    value !== "processing" &&
    value !== "complete" &&
    value !== "failed"
  ) {
    integrity("D1 returned an invalid license-document job status.");
  }
  return value;
}

function eventType(value: unknown): LicenseEventType {
  if (
    value !== "submitted" &&
    value !== "approved" &&
    value !== "rejected" &&
    value !== "canceled" &&
    value !== "issued" &&
    value !== "revoked" &&
    value !== "expired" &&
    value !== "document_ready" &&
    value !== "document_failed"
  ) {
    integrity("D1 returned an invalid license-event type.");
  }
  return value;
}

function eventSource(value: unknown): LicenseEventSource {
  if (
    value !== "customer" &&
    value !== "owner" &&
    value !== "credit" &&
    value !== "stripe_test" &&
    value !== "system"
  ) {
    integrity("D1 returned an invalid license-event source.");
  }
  return value;
}

function parseStringArray(value: unknown, label: string): readonly string[] {
  if (typeof value !== "string") integrity(`D1 returned invalid ${label}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity(`D1 returned invalid ${label} JSON.`);
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string" && item.length > 0)
  ) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return Object.freeze([...parsed]);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function parseDetails(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "string")
    integrity("D1 returned invalid event details.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity("D1 returned invalid event details JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    integrity("D1 returned invalid event details.");
  }
  return deepFreeze(parsed as Record<string, unknown>);
}

async function requireAuthority(
  binding: D1Database,
  authority: SqlAuthorityCondition,
  code: string,
  message: string,
): Promise<void> {
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(code, message, {
    status: 403,
    publicMessage: "That licensing history is not available.",
  });
}

function optionDefinition(row: OptionRow): LicenseOptionDefinitionInput {
  return Object.freeze({
    optionKey: nonBlank(row.option_key, "license option key"),
    label: nonBlank(row.label, "license option label"),
    description: string(row.description, "license option description"),
    usageCategory: nonBlank(row.usage_category, "usage category"),
    allowedMedia: parseStringArray(row.allowed_media_json, "allowed media"),
    audienceLabel:
      row.audience_label === null
        ? null
        : nonBlank(row.audience_label, "audience label"),
    maxAudience: nullableInteger(row.max_audience, "maximum audience"),
    distributionLabel:
      row.distribution_label === null
        ? null
        : nonBlank(row.distribution_label, "distribution label"),
    maxCopies: nullableInteger(row.max_copies, "maximum copies"),
    termMonths: nullableInteger(row.term_months, "term months"),
    territory: nonBlank(row.territory, "territory"),
    attributionRequired: boolean(
      row.attribution_required,
      "attribution requirement",
    ),
    attributionText:
      row.attribution_text === null
        ? null
        : nonBlank(row.attribution_text, "attribution text"),
    exclusive: boolean(row.exclusive, "exclusivity"),
    requiresApproval: boolean(row.requires_approval, "approval requirement"),
    licenseCreditCost: integer(
      row.license_credit_cost,
      "license credit cost",
      1,
    ),
    includesTrackDownload: boolean(
      row.includes_track_download,
      "track-download setting",
    ),
  });
}

function mapTermsVersion(
  row: TermsVersionRow,
  options: readonly OptionRow[],
): LicenseTermsDTO {
  const versionId = id(row.version_id, "license terms version ID");
  const licenseTermsId = id(row.terms_id, "license terms ID");
  const version: LicenseTermsVersionDTO = Object.freeze({
    id: versionId,
    licenseTermsId,
    version: integer(row.version, "license terms version", 1),
    name: nonBlank(row.name, "license terms name"),
    title: nonBlank(row.title, "license terms title"),
    introduction: string(row.introduction, "license terms introduction"),
    generalTerms: nonBlank(row.general_terms, "general terms"),
    disclaimer: string(row.disclaimer, "license disclaimer"),
    createdAt: timestamp(row.version_created_at, "license terms created time"),
    options: Object.freeze(
      options.map((option) =>
        Object.freeze({
          id: id(option.id, "license option ID"),
          position: integer(option.position, "license option position", 1),
          ...optionDefinition(option),
        }),
      ),
    ),
  });
  return Object.freeze({
    id: licenseTermsId,
    slug: nonBlank(row.terms_slug, "license terms slug"),
    state: termsState(row.terms_state),
    currentVersion: integer(
      row.terms_current_version,
      "current license terms version",
      1,
    ),
    createdAt: timestamp(row.terms_created_at, "license terms created time"),
    updatedAt: timestamp(row.terms_updated_at, "license terms updated time"),
    version,
  });
}

async function readTermsVersionInternal(
  binding: D1Database,
  licenseTermsId: string,
  version: number | null,
  activeOnly: boolean,
): Promise<LicenseTermsDTO | null> {
  const row = await binding
    .prepare(
      `SELECT lt.id AS terms_id, lt.slug AS terms_slug,
              lt.state AS terms_state,
              lt.current_version AS terms_current_version,
              lt.created_at AS terms_created_at,
              lt.updated_at AS terms_updated_at,
              ltv.id AS version_id, ltv.version, ltv.name, ltv.title,
              ltv.introduction, ltv.general_terms, ltv.disclaimer,
              ltv.created_at AS version_created_at
       FROM license_terms lt
       JOIN license_terms_versions ltv ON ltv.license_terms_id = lt.id
       WHERE lt.id = ?1
         AND ltv.version = COALESCE(?2, lt.current_version)
         AND (?3 = 0 OR lt.state = 'active')
       LIMIT 1`,
    )
    .bind(licenseTermsId, version, activeOnly ? 1 : 0)
    .first<TermsVersionRow>();
  if (!row) return null;
  const optionResult = await binding
    .prepare(
      `SELECT id, option_key, label, description, usage_category,
              allowed_media_json, audience_label, max_audience,
              distribution_label, max_copies, term_months, territory,
              attribution_required, attribution_text, exclusive,
              requires_approval, license_credit_cost,
              includes_track_download, position
       FROM license_options
       WHERE license_terms_version_id = ?1
       ORDER BY position, id`,
    )
    .bind(id(row.version_id, "license terms version ID"))
    .all<OptionRow>();
  if (!optionResult.success || optionResult.results.length < 1) {
    integrity("D1 returned license terms without options.");
  }
  return mapTermsVersion(row, optionResult.results);
}

export async function readLicenseTermsVersion(
  binding: D1Database,
  rawLicenseTermsId: string,
  rawVersion: number | null = null,
): Promise<LicenseTermsDTO | null> {
  const licenseTermsId = safeInputId(rawLicenseTermsId, "licenseTermsId");
  const version =
    rawVersion === null
      ? null
      : integer(rawVersion, "requested license terms version", 1);
  return readTermsVersionInternal(binding, licenseTermsId, version, true);
}

function offerSnapshot(row: OfferRow): LicenseTermsSnapshot {
  const definition = optionDefinition(row);
  return freezeLicenseTermsSnapshot({
    schemaVersion: 1,
    offer: {
      id: id(row.offer_id, "license offer ID"),
      revision: integer(row.offer_revision, "license offer revision", 1),
      slug: nonBlank(row.offer_slug, "license offer slug"),
      commerceProductId: id(row.product_id, "commerce product ID"),
      commercePriceId: id(row.price_id, "commerce price ID"),
    },
    track: {
      id: id(row.track_id, "track ID"),
      revisionId: id(row.track_revision_id, "track revision ID"),
      slug: nonBlank(row.track_slug, "track slug"),
      title: nonBlank(row.track_title, "track title"),
    },
    terms: {
      id: id(row.terms_id, "license terms ID"),
      versionId: id(row.version_id, "license terms version ID"),
      version: integer(row.version, "license terms version", 1),
      slug: nonBlank(row.terms_slug, "license terms slug"),
      name: nonBlank(row.name, "license terms name"),
      title: nonBlank(row.title, "license terms title"),
      introduction: string(row.introduction, "license terms introduction"),
      generalTerms: nonBlank(row.general_terms, "general terms"),
      disclaimer: string(row.disclaimer, "license disclaimer"),
    },
    option: {
      id: id(row.id, "license option ID"),
      ...definition,
    },
    testPrice: {
      id: id(row.price_id, "commerce price ID"),
      amountMinor: integer(row.amount_minor, "test price amount", 1),
      currency: nonBlank(row.currency, "test price currency"),
    },
  });
}

async function readOfferInternal(
  binding: D1Database,
  licenseOfferId: string,
  activeOnly: boolean,
): Promise<LicenseOfferDTO | null> {
  const row = await binding
    .prepare(
      `SELECT
         offer.id AS offer_id, offer.slug AS offer_slug,
         offer.state AS offer_state, offer.revision AS offer_revision,
         offer.created_at AS offer_created_at,
         offer.updated_at AS offer_updated_at,
         t.id AS track_id, t.slug AS track_slug,
         tr.id AS track_revision_id, tr.title AS track_title,
         lt.id AS terms_id, lt.slug AS terms_slug,
         lt.state AS terms_state,
         lt.current_version AS terms_current_version,
         lt.created_at AS terms_created_at,
         lt.updated_at AS terms_updated_at,
         ltv.id AS version_id, ltv.version, ltv.name, ltv.title,
         ltv.introduction, ltv.general_terms, ltv.disclaimer,
         ltv.created_at AS version_created_at,
         lo.id, lo.option_key, lo.label, lo.description, lo.usage_category,
         lo.allowed_media_json, lo.audience_label, lo.max_audience,
         lo.distribution_label, lo.max_copies, lo.term_months, lo.territory,
         lo.attribution_required, lo.attribution_text, lo.exclusive,
         lo.requires_approval, lo.license_credit_cost,
         lo.includes_track_download, lo.position,
         cp.id AS product_id, price.id AS price_id,
         price.amount_minor, price.currency
       FROM license_offers offer
       JOIN tracks t ON t.id = offer.track_id
       JOIN track_revisions tr
         ON tr.id = offer.track_revision_id AND tr.track_id = t.id
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
         AND (?2 = 0 OR (
           offer.state = 'active'
           AND t.publication_state = 'published'
           AND t.published_revision_id = offer.track_revision_id
           AND lt.state = 'active'
           AND cp.state = 'active' AND cp.product_type = 'license'
           AND cp.resource_type = 'track' AND cp.resource_id = t.id
           AND price.active = 1 AND price.billing_interval = 'one_time'
           AND price.stripe_environment = 'test' AND price.livemode = 0
         ))
       LIMIT 1`,
    )
    .bind(licenseOfferId, activeOnly ? 1 : 0)
    .first<OfferRow>();
  if (!row) return null;
  return Object.freeze({
    id: id(row.offer_id, "license offer ID"),
    slug: nonBlank(row.offer_slug, "license offer slug"),
    state: offerState(row.offer_state),
    revision: integer(row.offer_revision, "license offer revision", 1),
    snapshot: offerSnapshot(row),
    createdAt: timestamp(row.offer_created_at, "license offer created time"),
    updatedAt: timestamp(row.offer_updated_at, "license offer updated time"),
  });
}

export async function readActiveLicenseOffer(
  binding: D1Database,
  rawLicenseOfferId: string,
): Promise<LicenseOfferDTO | null> {
  return readOfferInternal(
    binding,
    safeInputId(rawLicenseOfferId, "licenseOfferId"),
    true,
  );
}

/** Lists only offers whose complete catalog, terms, product, and Test price remain active. */
export async function listActiveLicenseOffers(
  binding: D1Database,
): Promise<readonly LicenseOfferDTO[]> {
  const rows = await binding
    .prepare(
      `SELECT offer.id
       FROM license_offers offer
       JOIN tracks t ON t.id = offer.track_id
       JOIN license_terms lt ON lt.id = offer.license_terms_id
       JOIN commerce_products cp ON cp.id = offer.commerce_product_id
       JOIN commerce_prices price
         ON price.id = offer.commerce_price_id
        AND price.commerce_product_id = cp.id
       WHERE offer.state = 'active'
         AND t.publication_state = 'published'
         AND t.published_revision_id = offer.track_revision_id
         AND lt.state = 'active'
         AND cp.state = 'active' AND cp.product_type = 'license'
         AND cp.resource_type = 'track' AND cp.resource_id = t.id
         AND price.active = 1 AND price.billing_interval = 'one_time'
         AND price.stripe_environment = 'test' AND price.livemode = 0
       ORDER BY offer.updated_at DESC, offer.id
       LIMIT 100`,
    )
    .all<{ id: unknown }>();
  if (!rows.success) integrity("D1 did not return active license offers.");
  const offers = await Promise.all(
    rows.results.map(async (row) => {
      const result = await readOfferInternal(
        binding,
        id(row.id, "license offer ID"),
        true,
      );
      if (!result) integrity("An active license offer changed while reading.");
      return result;
    }),
  );
  return Object.freeze(offers);
}

function mapRequest(row: RequestRow): LicenseRequestDTO {
  return Object.freeze({
    id: id(row.id, "license request ID"),
    customerUserId: id(row.customer_user_id, "license customer ID"),
    licenseOfferId: id(row.license_offer_id, "license offer ID"),
    licenseOfferRevision: integer(
      row.license_offer_revision,
      "license offer revision",
      1,
    ),
    trackId: id(row.track_id, "track ID"),
    state: requestState(row.state),
    revision: integer(row.revision, "license request revision", 1),
    approvedAt: nullableTimestamp(row.approved_at, "license approval time"),
    rejectedAt: nullableTimestamp(row.rejected_at, "license rejection time"),
    canceledAt: nullableTimestamp(row.canceled_at, "license cancellation time"),
    issuedAt: nullableTimestamp(row.issued_at, "license issuance time"),
    termsSnapshot: parseLicenseTermsSnapshotJson(
      string(row.terms_snapshot_json, "license terms snapshot"),
    ),
    intendedUseSnapshot: parseLicenseIntendedUseSnapshotJson(
      string(row.intended_use_snapshot_json, "intended-use snapshot"),
    ),
    createdAt: timestamp(row.created_at, "license request created time"),
    updatedAt: timestamp(row.updated_at, "license request updated time"),
  });
}

function mapIssued(row: IssuedRow): IssuedLicenseDTO {
  return Object.freeze({
    id: id(row.id, "issued license ID"),
    customerUserId: id(row.customer_user_id, "license customer ID"),
    licenseRequestId: id(row.license_request_id, "license request ID"),
    trackId: id(row.track_id, "track ID"),
    source: issuanceSource(row.source),
    orderId: nullableId(row.order_id, "order ID"),
    creditLedgerEntryId: nullableId(
      row.credit_ledger_entry_id,
      "credit ledger entry ID",
    ),
    fulfillmentEventId: nullableId(
      row.fulfillment_event_id,
      "fulfillment event ID",
    ),
    state: issuedState(row.state),
    issuedAt: timestamp(row.issued_at, "license issuance time"),
    expiresAt: nullableTimestamp(row.expires_at, "license expiry time"),
    revokedAt: nullableTimestamp(row.revoked_at, "license revocation time"),
    expiredAt: nullableTimestamp(row.expired_at, "license expiration time"),
    revision: integer(row.revision, "issued license revision", 1),
    termsSnapshot: parseLicenseTermsSnapshotJson(
      string(row.terms_snapshot_json, "issued license terms snapshot"),
    ),
    createdAt: timestamp(row.created_at, "issued license created time"),
    updatedAt: timestamp(row.updated_at, "issued license updated time"),
  });
}

function mapDocument(row: DocumentRow): LicenseDocumentDTO {
  return Object.freeze({
    id: id(row.id, "license document ID"),
    issuedLicenseId: id(row.issued_license_id, "issued license ID"),
    customerUserId: id(row.customer_user_id, "license customer ID"),
    state: documentState(row.state),
    contentDigest:
      row.content_digest === null
        ? null
        : nonBlank(row.content_digest, "document content digest"),
    byteLength:
      row.byte_length === null
        ? null
        : integer(row.byte_length, "document byte length", 1),
    failureCategory:
      row.failure_category === null
        ? null
        : nonBlank(row.failure_category, "document failure category"),
    revision: integer(row.revision, "license document revision", 1),
    createdAt: timestamp(row.created_at, "license document created time"),
    updatedAt: timestamp(row.updated_at, "license document updated time"),
  });
}

function mapDocumentJob(row: DocumentJobRow): LicenseDocumentJobDTO {
  return Object.freeze({
    id: id(row.id, "license document job ID"),
    licenseDocumentId: id(
      row.license_document_id,
      "license document job document ID",
    ),
    status: documentJobStatus(row.status),
    attempts: integer(row.attempts, "license document job attempts"),
    failureCategory:
      row.failure_category === null
        ? null
        : nonBlank(row.failure_category, "document job failure category"),
    createdAt: timestamp(row.created_at, "license document job created time"),
    updatedAt: timestamp(row.updated_at, "license document job updated time"),
  });
}

function mapEvent(row: EventRow): LicenseEventDTO {
  return Object.freeze({
    id: id(row.id, "license event ID"),
    customerUserId: id(row.customer_user_id, "license customer ID"),
    licenseRequestId: nullableId(row.license_request_id, "license request ID"),
    issuedLicenseId: nullableId(row.issued_license_id, "issued license ID"),
    eventType: eventType(row.event_type),
    actorUserId: nullableId(row.actor_user_id, "event actor ID"),
    source: eventSource(row.source),
    orderId: nullableId(row.order_id, "order ID"),
    creditLedgerEntryId: nullableId(
      row.credit_ledger_entry_id,
      "credit ledger entry ID",
    ),
    fulfillmentEventId: nullableId(
      row.fulfillment_event_id,
      "fulfillment event ID",
    ),
    details: parseDetails(row.details_json),
    createdAt: timestamp(row.created_at, "license event created time"),
  });
}

async function readHistory(
  binding: D1Database,
  customerUserId: string | null,
): Promise<CustomerLicenseHistoryDTO> {
  const where = customerUserId === null ? "" : "WHERE customer_user_id = ?1";
  const bindings = customerUserId === null ? [] : [customerUserId];
  const [requests, licenses, documents, events] = await Promise.all([
    binding
      .prepare(
        `SELECT id, customer_user_id, license_offer_id,
                license_offer_revision, track_id, state, revision,
                approved_at, rejected_at, canceled_at, issued_at,
                terms_snapshot_json, intended_use_snapshot_json,
                created_at, updated_at
         FROM license_requests ${where}
         ORDER BY created_at DESC, id DESC LIMIT 200`,
      )
      .bind(...bindings)
      .all<RequestRow>(),
    binding
      .prepare(
        `SELECT id, customer_user_id, license_request_id, track_id, source,
                order_id, credit_ledger_entry_id, fulfillment_event_id,
                state, issued_at, expires_at, revoked_at, expired_at,
                revision, terms_snapshot_json, created_at, updated_at
         FROM issued_licenses ${where}
         ORDER BY issued_at DESC, id DESC LIMIT 200`,
      )
      .bind(...bindings)
      .all<IssuedRow>(),
    binding
      .prepare(
        `SELECT id, issued_license_id, customer_user_id, state,
                content_digest, byte_length, failure_category, revision,
                created_at, updated_at
         FROM license_documents ${where}
         ORDER BY created_at DESC, id DESC LIMIT 200`,
      )
      .bind(...bindings)
      .all<DocumentRow>(),
    binding
      .prepare(
        `SELECT id, customer_user_id, license_request_id, issued_license_id,
                event_type, actor_user_id, source, order_id,
                credit_ledger_entry_id, fulfillment_event_id, details_json,
                created_at
         FROM license_events ${where}
         ORDER BY rowid LIMIT 500`,
      )
      .bind(...bindings)
      .all<EventRow>(),
  ]);
  if (
    !requests.success ||
    !licenses.success ||
    !documents.success ||
    !events.success
  ) {
    integrity("D1 did not return complete licensing history.");
  }
  return Object.freeze({
    requests: Object.freeze(requests.results.map(mapRequest)),
    licenses: Object.freeze(licenses.results.map(mapIssued)),
    documents: Object.freeze(documents.results.map(mapDocument)),
    events: Object.freeze(events.results.map(mapEvent)),
  });
}

export async function readCustomerLicenseHistory(
  binding: D1Database,
  rawCustomerUserId: string,
): Promise<CustomerLicenseHistoryDTO> {
  const customerUserId = safeInputId(rawCustomerUserId, "customerUserId");
  await requireAuthority(
    binding,
    activeCustomerCondition(customerUserId),
    "LICENSE_CUSTOMER_REQUIRED",
    "Customer licensing history requires a live customer authority record.",
  );
  return readHistory(binding, customerUserId);
}

export async function readLicenseAdministration(
  binding: D1Database,
  rawActorUserId: string,
): Promise<LicenseAdministrationDTO> {
  const actorUserId = safeInputId(rawActorUserId, "actorUserId");
  await requireAuthority(
    binding,
    activeOwnerCondition(actorUserId),
    "LICENSE_OWNER_REQUIRED",
    "Licensing administration requires a live owner authority record.",
  );
  const [termsRows, offerRows, documentJobRows, history] = await Promise.all([
    binding
      .prepare("SELECT id FROM license_terms ORDER BY updated_at DESC, id")
      .all<{ id: unknown }>(),
    binding
      .prepare("SELECT id FROM license_offers ORDER BY updated_at DESC, id")
      .all<{ id: unknown }>(),
    binding
      .prepare(
        `SELECT id, license_document_id, status, attempts,
                failure_category, created_at, updated_at
         FROM license_document_jobs
         ORDER BY created_at DESC, id
         LIMIT 200`,
      )
      .all<DocumentJobRow>(),
    readHistory(binding, null),
  ]);
  if (!termsRows.success || !offerRows.success || !documentJobRows.success) {
    integrity("D1 did not return complete licensing administration state.");
  }
  const terms = await Promise.all(
    termsRows.results.map(async (row) => {
      const result = await readTermsVersionInternal(
        binding,
        id(row.id, "license terms ID"),
        null,
        false,
      );
      if (!result) integrity("D1 returned a missing license terms aggregate.");
      return result;
    }),
  );
  const offers = await Promise.all(
    offerRows.results.map(async (row) => {
      const result = await readOfferInternal(
        binding,
        id(row.id, "license offer ID"),
        false,
      );
      if (!result) integrity("D1 returned a missing license offer aggregate.");
      return result;
    }),
  );
  return Object.freeze({
    terms: Object.freeze(terms),
    offers: Object.freeze(offers),
    documentJobs: Object.freeze(documentJobRows.results.map(mapDocumentJob)),
    ...history,
  });
}
