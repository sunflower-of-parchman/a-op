import {
  PORTABLE_ENTITY_CONTRACTS,
  type PortableFieldContract,
} from "./contract.ts";
import { PORTABILITY_ERROR_CODES, PortabilityError } from "./errors.ts";
import {
  PORTABLE_DOCUMENT_NAMES,
  PORTABLE_ENTITY_KINDS,
  type ArtistInstallationSnapshot,
  type PortableDocumentName,
  type PortableEntityKind,
  type PortableField,
  type PortableRecord,
  type PortableRelation,
  type PortableValue,
} from "./types.ts";

const MODULE_KEYS = new Set([
  "downloads",
  "customer-library",
  "licensing",
  "memberships",
  "subscriptions",
  "courses",
  "video",
  "whats-new",
  "contact",
  "telemetry",
]);
const ACCESS_ACTIONS = new Set(["view", "stream", "download"]);
const SHA256 = /^[a-f0-9]{64}$/;
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PORTABLE_ENTITY_SET = new Set<string>(PORTABLE_ENTITY_KINDS);
const PORTABLE_DOCUMENT_SET = new Set<string>(PORTABLE_DOCUMENT_NAMES);
const PROHIBITED_FIELD_NAMES = new Set([
  "userid",
  "owneruserid",
  "editoruserid",
  "customerid",
  "createdbyuserid",
  "updatedbyuserid",
  "approvedbyuserid",
  "assignedbyuserid",
  "submitteruserid",
  "roleassignment",
  "favorite",
  "playlist",
  "listeninghistory",
  "accessgrant",
  "entitlement",
  "deliveryevent",
  "order",
  "checkoutsession",
  "commerceevent",
  "fulfillmentevent",
  "customermembership",
  "customersubscription",
  "creditaccount",
  "creditgrant",
  "creditreservation",
  "creditledgerentry",
  "licenserequest",
  "issuedlicense",
  "courseprogress",
  "updateread",
  "contactsubmission",
  "contactnote",
  "telemetryevent",
  "telemetryaggregate",
  "auditevent",
  "operationalfailure",
  "setupapplication",
  "setupstate",
  "exporthistory",
  "stripepriceid",
  "stripeproductid",
  "stripecustomerid",
  "stripeeventid",
  "stripecheckoutsessionid",
  "providerid",
  "providerpayload",
  "paymentmethod",
  ["card", "number"].join(""),
  "cardexpiry",
  "cardcvc",
  "securitycode",
  "apikey",
  "secretkey",
  "webhooksecret",
  "objectkey",
  "localpath",
  "machinepath",
]);
const PROHIBITED_ENTITY_WORDS =
  /^(?:user|profile|role|role-assignment|favorite|playlist|listening-history|access-grant|entitlement|download-event|checkout-session|commerce-event|order|order-item|fulfillment-event|membership|subscription|subscription-event|credit-account|credit-grant|credit-reservation|credit-ledger-entry|license-request|issued-license|license-document|course-progress|update-read|contact-submission|contact-note|telemetry-event|telemetry-aggregate|audit-event|operational-failure|setup-state|setup-application|export-manifest)$/;
const CREDENTIAL_PATTERN =
  /\b(?:pk|sk|rk)_(?:test|live)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}/i;
const PROVIDER_ID_PATTERN =
  /\b(?:price|prod|cus|evt|sub|ch|pm|pi|seti|src|tok|card|cs_(?:test|live))_[A-Za-z0-9]{6,}\b/;
const OBJECT_KEY_PATTERN = /(?:^|\s)(?:originals|derivatives|exports)\//i;
const MACHINE_PATH_PATTERN =
  /(?:file:\/\/|(?:^|\s)(?:~\/|\/Users\/|\/home\/|\/private\/|\/var\/|\/tmp\/)|(?<![A-Za-z0-9])[A-Za-z]:\\)/i;

function fail(
  code: (typeof PORTABILITY_ERROR_CODES)[keyof typeof PORTABILITY_ERROR_CODES],
  message: string,
  location: string,
): never {
  throw new PortabilityError(code, message, location);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  location: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (PROHIBITED_FIELD_NAMES.has(normalized)) {
      fail(
        PORTABILITY_ERROR_CODES.PROHIBITED_DATA,
        "The artist installation export contains a prohibited field.",
        `${location}.${key}`,
      );
    }
    if (!allowedSet.has(key)) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "The artist installation export contains an unknown field.",
        `${location}.${key}`,
      );
    }
  }
  for (const key of allowed) {
    if (!(key in value)) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "The artist installation export is missing a required structural field.",
        `${location}.${key}`,
      );
    }
  }
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function containsPanLikeValue(value: string): boolean {
  const matches = value.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return matches.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  });
}

export function assertPortableSafeString(
  value: string,
  location: string,
): void {
  if (
    value.includes("\u0000") ||
    CREDENTIAL_PATTERN.test(value) ||
    PROVIDER_ID_PATTERN.test(value) ||
    OBJECT_KEY_PATTERN.test(value) ||
    MACHINE_PATH_PATTERN.test(value) ||
    containsPanLikeValue(value)
  ) {
    fail(
      PORTABILITY_ERROR_CODES.PROHIBITED_DATA,
      "The artist installation export contains prohibited private, provider, payment, or machine-local data.",
      location,
    );
  }
}

function readString(value: unknown, location: string): string {
  if (typeof value !== "string" || value.length > 100_000) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Expected a bounded string.",
      location,
    );
  }
  assertPortableSafeString(value, location);
  return value;
}

function validateFieldValue(
  value: unknown,
  contract: PortableFieldContract,
  location: string,
): PortableValue {
  if (value === null) {
    if (
      contract.kind === "nullable-string" ||
      contract.kind === "nullable-number"
    ) {
      return null;
    }
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "This field cannot be null.",
      location,
    );
  }

  if (contract.kind === "string" || contract.kind === "nullable-string") {
    const result = readString(value, location);
    if (contract.values && !contract.values.includes(result)) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "The field value is not allowed.",
        location,
      );
    }
    return result;
  }

  if (contract.kind === "number" || contract.kind === "nullable-number") {
    if (!Number.isSafeInteger(value)) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Expected a safe integer.",
        location,
      );
    }
    const result = value as number;
    if (
      (contract.minimum !== undefined && result < contract.minimum) ||
      (contract.maximum !== undefined && result > contract.maximum) ||
      (contract.values && !contract.values.includes(result))
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "The numeric field value is outside its contract.",
        location,
      );
    }
    return result;
  }

  if (contract.kind === "boolean") {
    if (
      typeof value !== "boolean" ||
      (contract.values && !contract.values.includes(value))
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Expected an allowed boolean.",
        location,
      );
    }
    return value;
  }

  if (!Array.isArray(value) || value.length > 1_000) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Expected a bounded string list.",
      location,
    );
  }
  const result = value.map((item, index) =>
    readString(item, `${location}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "String lists cannot contain duplicates.",
      location,
    );
  }
  return result;
}

function readField(
  value: unknown,
  entity: PortableEntityKind,
  location: string,
): PortableField {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Expected a portable field object.",
      location,
    );
  }
  assertExactKeys(value, ["name", "value"], location);
  const name = readString(value.name, `${location}.name`);
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (PROHIBITED_FIELD_NAMES.has(normalized)) {
    fail(
      PORTABILITY_ERROR_CODES.PROHIBITED_DATA,
      "The artist installation export contains a prohibited domain field.",
      `${location}.name`,
    );
  }
  const contract = PORTABLE_ENTITY_CONTRACTS[entity].fields[name];
  if (!contract) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The field is not part of this portable entity contract.",
      `${location}.name`,
    );
  }
  const fieldValue =
    name === "contentSha256"
      ? value.value === null
        ? null
        : typeof value.value === "string" && SHA256.test(value.value)
          ? value.value
          : fail(
              PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
              "Media checksums must be lowercase SHA-256 values.",
              `${location}.value`,
            )
      : validateFieldValue(value.value, contract, `${location}.value`);
  return {
    name,
    value: fieldValue,
  };
}

function readRelation(
  value: unknown,
  entity: PortableEntityKind,
  location: string,
): PortableRelation {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Expected a portable relation object.",
      location,
    );
  }
  assertExactKeys(value, ["name", "targetEntity", "targetId"], location);
  const name = readString(value.name, `${location}.name`);
  const contract = PORTABLE_ENTITY_CONTRACTS[entity].relations[name];
  if (!contract) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The relation is not part of this portable entity contract.",
      `${location}.name`,
    );
  }
  const targetEntity = readString(
    value.targetEntity,
    `${location}.targetEntity`,
  );
  if (
    !PORTABLE_ENTITY_SET.has(targetEntity) ||
    PROHIBITED_ENTITY_WORDS.test(targetEntity)
  ) {
    fail(
      PORTABILITY_ERROR_CODES.PROHIBITED_DATA,
      "The relation targets prohibited or unsupported installation state.",
      `${location}.targetEntity`,
    );
  }
  if (!contract.targets.includes(targetEntity as PortableEntityKind)) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The relation target does not match this entity contract.",
      `${location}.targetEntity`,
    );
  }
  const targetId = readString(value.targetId, `${location}.targetId`);
  if (!RECORD_ID.test(targetId)) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The relation target id is invalid.",
      `${location}.targetId`,
    );
  }
  return { name, targetEntity: targetEntity as PortableEntityKind, targetId };
}

function validateEntitySpecific(
  record: PortableRecord,
  location: string,
): void {
  const fields = Object.fromEntries(
    record.fields.map(({ name, value }) => [name, value]),
  );

  for (const timestamp of ["publishedAt", "approvedAt", "effectiveAt"]) {
    const value = fields[timestamp];
    if (typeof value === "string" && !ISO_INSTANT.test(value)) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Portable timestamps must be UTC ISO instants.",
        `${location}.fields.${timestamp}`,
      );
    }
  }

  if (
    typeof fields.moduleKey === "string" &&
    !MODULE_KEYS.has(fields.moduleKey)
  ) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The module key is not supported.",
      `${location}.fields.moduleKey`,
    );
  }
  if (record.entity === "module" && !MODULE_KEYS.has(String(fields.key))) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The module key is not supported.",
      `${location}.fields.key`,
    );
  }
  if (record.entity === "access-plan-item") {
    const actions = fields.actions;
    if (
      !Array.isArray(actions) ||
      actions.length < 1 ||
      actions.some((action) => !ACCESS_ACTIONS.has(action))
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Access definitions require portable protected-delivery actions.",
        `${location}.fields.actions`,
      );
    }
  }
  if (record.entity === "commerce-price-definition") {
    if (!/^[A-Z]{3}$/.test(String(fields.currency))) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Currency must be a three-letter uppercase code.",
        `${location}.fields.currency`,
      );
    }
    if (fields.bindingState !== "pending") {
      fail(
        PORTABILITY_ERROR_CODES.PROHIBITED_DATA,
        "Commerce bindings must be pending in portable exports.",
        `${location}.fields.bindingState`,
      );
    }
  }
  if (record.entity === "membership-credit-rule") {
    const relations = new Set(record.relations.map(({ name }) => name));
    const subjectKind = fields.subjectKind;
    const cadence = fields.cadence;
    const expected =
      subjectKind === "membership"
        ? new Set(["membershipPlan", "membershipPlanRevision"])
        : subjectKind === "subscription"
          ? new Set(["subscriptionPlan"])
          : new Set<string>();
    if (
      relations.size !== expected.size ||
      [...relations].some((name) => !expected.has(name)) ||
      (subjectKind === "membership" && cadence !== "once") ||
      (subjectKind === "subscription" &&
        cadence !== "month" &&
        cadence !== "year")
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "A membership credit rule requires its exact plan subject and cadence.",
        `${location}.relations`,
      );
    }
  }
  if (record.entity === "commerce-binding-intent") {
    if (fields.bindingState !== "pending") {
      fail(
        PORTABILITY_ERROR_CODES.PROHIBITED_DATA,
        "Commerce binding intents must return to pending in portable exports.",
        `${location}.fields.bindingState`,
      );
    }
    const relations = new Set(record.relations.map(({ name }) => name));
    const intentKind = fields.intentKind;
    const expected =
      intentKind === "membership"
        ? new Set(["membershipPlan", "membershipPlanRevision"])
        : intentKind === "subscription"
          ? new Set(["subscriptionPlan"])
          : intentKind === "license"
            ? new Set([
                "track",
                "trackRevision",
                "licenseTermsVersion",
                "licenseOption",
              ])
            : new Set<string>();
    if (
      relations.size !== expected.size ||
      [...relations].some((name) => !expected.has(name))
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "A commerce binding intent requires the exact provider-neutral subject relations for its kind.",
        `${location}.relations`,
      );
    }
  }
  if (record.entity === "video-revision") {
    const relationNames = new Set(record.relations.map(({ name }) => name));
    if (
      fields.deliveryKind === "artist_hosted" &&
      !relationNames.has("hostedDerivative")
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Artist-hosted video requires logical media metadata.",
        location,
      );
    }
    if (
      fields.deliveryKind === "external" &&
      fields.bindingState !== "pending"
    ) {
      fail(
        PORTABILITY_ERROR_CODES.PROHIBITED_DATA,
        "External video bindings must be pending in portable exports.",
        `${location}.fields.bindingState`,
      );
    }
  }
  if (
    record.entity === "media-object" ||
    record.entity === "media-derivative"
  ) {
    const sha = fields.contentSha256;
    if (
      sha !== null &&
      sha !== undefined &&
      (typeof sha !== "string" || !SHA256.test(sha))
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Media checksums must be lowercase SHA-256 values.",
        `${location}.fields.contentSha256`,
      );
    }
  }
  if (record.entity === "navigation-item") {
    const href = String(fields.href);
    const external = fields.external === true;
    if (
      (external && !href.startsWith("https://")) ||
      (!external && !/^\/(?!\/)/.test(href))
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Navigation destinations must match their public route kind.",
        `${location}.fields.href`,
      );
    }
  }
}

function readRecord(
  value: unknown,
  document: PortableDocumentName,
  location: string,
): PortableRecord {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Expected a portable record object.",
      location,
    );
  }
  assertExactKeys(value, ["entity", "id", "fields", "relations"], location);
  const entityText = readString(value.entity, `${location}.entity`);
  if (PROHIBITED_ENTITY_WORDS.test(entityText)) {
    fail(
      PORTABILITY_ERROR_CODES.PROHIBITED_DATA,
      "Customer, provider, operational, or history records are not part of artist installation exports.",
      `${location}.entity`,
    );
  }
  if (!PORTABLE_ENTITY_SET.has(entityText)) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The portable entity kind is not supported.",
      `${location}.entity`,
    );
  }
  const entity = entityText as PortableEntityKind;
  if (PORTABLE_ENTITY_CONTRACTS[entity].document !== document) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The entity is in the wrong export document.",
      `${location}.entity`,
    );
  }
  const id = readString(value.id, `${location}.id`);
  if (!RECORD_ID.test(id)) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The portable record id is invalid.",
      `${location}.id`,
    );
  }
  if (!Array.isArray(value.fields) || value.fields.length > 200) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Expected a bounded field list.",
      `${location}.fields`,
    );
  }
  if (!Array.isArray(value.relations) || value.relations.length > 100) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Expected a bounded relation list.",
      `${location}.relations`,
    );
  }
  const fields = value.fields.map((field, index) =>
    readField(field, entity, `${location}.fields[${index}]`),
  );
  const relations = value.relations.map((relationValue, index) =>
    readRelation(relationValue, entity, `${location}.relations[${index}]`),
  );
  const fieldNames = fields.map(({ name }) => name);
  const relationNames = relations.map(({ name }) => name);
  if (
    new Set(fieldNames).size !== fieldNames.length ||
    new Set(relationNames).size !== relationNames.length
  ) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Portable fields and relations must be unique by name.",
      location,
    );
  }
  const contract = PORTABLE_ENTITY_CONTRACTS[entity];
  for (const [name, fieldContract] of Object.entries(contract.fields)) {
    if (fieldContract.required && !fieldNames.includes(name)) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "A required portable field is missing.",
        `${location}.fields.${name}`,
      );
    }
  }
  for (const [name, relationContract] of Object.entries(contract.relations)) {
    if (relationContract.required && !relationNames.includes(name)) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "A required portable relation is missing.",
        `${location}.relations.${name}`,
      );
    }
  }
  const record: PortableRecord = { entity, id, fields, relations };
  validateEntitySpecific(record, location);
  return record;
}

export function validateArtistInstallationSnapshot(
  value: unknown,
): ArtistInstallationSnapshot {
  if (!isPlainObject(value)) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "Expected an artist installation snapshot.",
      "$",
    );
  }
  assertExactKeys(value, PORTABLE_DOCUMENT_NAMES, "$");

  const recordsByDocument = {} as Record<
    PortableDocumentName,
    PortableRecord[]
  >;
  const recordKeys = new Set<string>();
  for (const document of PORTABLE_DOCUMENT_NAMES) {
    if (
      !PORTABLE_DOCUMENT_SET.has(document) ||
      !Array.isArray(value[document]) ||
      value[document].length > 100_000
    ) {
      fail(
        PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
        "Expected a bounded portable document list.",
        `$.${document}`,
      );
    }
    recordsByDocument[document] = value[document].map((record, index) => {
      const parsed = readRecord(record, document, `$.${document}[${index}]`);
      const key = `${parsed.entity}\u0000${parsed.id}`;
      if (recordKeys.has(key)) {
        fail(
          PORTABILITY_ERROR_CODES.DUPLICATE_RECORD,
          "Portable record identities must be unique.",
          `$.${document}[${index}]`,
        );
      }
      recordKeys.add(key);
      return parsed;
    });
  }

  if (
    recordsByDocument.artist.filter(({ entity }) => entity === "artist-config")
      .length !== 1
  ) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The export requires exactly one artist configuration.",
      "$.artist",
    );
  }
  if (
    recordsByDocument.telemetry.filter(
      ({ entity }) => entity === "telemetry-settings",
    ).length !== 1
  ) {
    fail(
      PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
      "The export requires exactly one telemetry configuration.",
      "$.telemetry",
    );
  }

  for (const document of PORTABLE_DOCUMENT_NAMES) {
    for (const [index, record] of recordsByDocument[document].entries()) {
      for (const relationValue of record.relations) {
        if (
          !recordKeys.has(
            `${relationValue.targetEntity}\u0000${relationValue.targetId}`,
          )
        ) {
          fail(
            PORTABILITY_ERROR_CODES.SCHEMA_INVALID,
            "A portable relation target is missing from the export.",
            `$.${document}[${index}].relations.${relationValue.name}`,
          );
        }
      }
    }
  }

  return recordsByDocument;
}
