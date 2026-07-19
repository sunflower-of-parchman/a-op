import { canonicalSha256, isSha256 } from "./canonical.ts";
import { SetupContractError, type SetupValidationIssue } from "./errors.ts";
import {
  EXTERNAL_ACTION_APPROVAL_SCHEMA_VERSION,
  SETUP_APPROVAL_SCHEMA_VERSION,
  SETUP_APPROVAL_SCOPES,
  type ExternalActionApproval,
  type ExternalActionProposal,
  type SetupApproval,
  type SetupApprovalScope,
  type SetupProposal,
  type SetupProposalArtifact,
} from "./types.ts";

const SAFE_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function issue(
  issues: SetupValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function exact(
  value: unknown,
  keys: readonly string[],
  path: string,
  issues: SetupValidationIssue[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    issue(issues, path, "object-required", "Use a JSON object.");
    return {};
  }
  const object = value as Record<string, unknown>;
  const expected = new Set(keys);
  for (const key of Object.keys(object)) {
    if (!expected.has(key)) {
      issue(issues, `${path}.${key}`, "unknown-field", "Remove this field.");
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) {
      issue(issues, `${path}.${key}`, "required-field", "Provide this field.");
    }
  }
  return object;
}

function stableKey(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 100 ||
    !SAFE_KEY.test(value)
  ) {
    issue(
      issues,
      path,
      "stable-key",
      "Use lowercase words separated by single hyphens.",
    );
    return "invalid";
  }
  return value;
}

function hash(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string {
  if (!isSha256(value)) {
    issue(issues, path, "sha256", "Use a canonical sha256 hash.");
    return "sha256:".padEnd(71, "0");
  }
  return value;
}

function instant(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string {
  if (
    typeof value !== "string" ||
    !ISO_INSTANT.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    issue(issues, path, "instant", "Use a UTC ISO 8601 timestamp.");
    return "1970-01-01T00:00:00Z";
  }
  return value;
}

function finish<T>(value: T, issues: SetupValidationIssue[], label: string): T {
  if (issues.length > 0) {
    throw new SetupContractError(
      "SETUP_INPUT_INVALID",
      `${label} has ${issues.length} validation issue${issues.length === 1 ? "" : "s"}.`,
      issues,
    );
  }
  return Object.freeze(value);
}

export function validateSetupApproval(value: unknown): SetupApproval {
  const issues: SetupValidationIssue[] = [];
  const object = exact(
    value,
    [
      "schemaVersion",
      "approvalId",
      "proposalId",
      "proposalHash",
      "sourceStateFingerprint",
      "approvedAt",
      "approvedBy",
      "approvedScopes",
      "statement",
    ],
    "$",
    issues,
  );
  if (object.schemaVersion !== SETUP_APPROVAL_SCHEMA_VERSION) {
    issue(
      issues,
      "$.schemaVersion",
      "schema-version",
      `Use ${SETUP_APPROVAL_SCHEMA_VERSION}.`,
    );
  }
  const approvedBy = exact(
    object.approvedBy,
    ["authority", "accountAlias"],
    "$.approvedBy",
    issues,
  );
  if (approvedBy.authority !== "artist-owner") {
    issue(
      issues,
      "$.approvedBy.authority",
      "artist-owner-required",
      "The artist owner approves setup proposals.",
    );
  }
  const rawScopes = Array.isArray(object.approvedScopes)
    ? object.approvedScopes
    : [];
  if (!Array.isArray(object.approvedScopes)) {
    issue(issues, "$.approvedScopes", "array-required", "Use an array.");
  }
  const approvedScopes: SetupApprovalScope[] = [];
  for (const [index, scope] of rawScopes.entries()) {
    if (
      typeof scope !== "string" ||
      !SETUP_APPROVAL_SCOPES.includes(scope as SetupApprovalScope)
    ) {
      issue(
        issues,
        `$.approvedScopes[${index}]`,
        "approval-scope",
        "Use a supported setup approval scope.",
      );
    } else approvedScopes.push(scope as SetupApprovalScope);
  }
  if (new Set(approvedScopes).size !== approvedScopes.length) {
    issue(
      issues,
      "$.approvedScopes",
      "duplicate-scope",
      "List each approval scope once.",
    );
  }
  approvedScopes.sort(
    (left, right) =>
      SETUP_APPROVAL_SCOPES.indexOf(left) -
      SETUP_APPROVAL_SCOPES.indexOf(right),
  );
  if (object.statement !== "I approve this exact proposal hash.") {
    issue(
      issues,
      "$.statement",
      "approval-statement",
      "Use the exact setup approval statement.",
    );
  }
  return finish(
    {
      schemaVersion: SETUP_APPROVAL_SCHEMA_VERSION,
      approvalId: stableKey(object.approvalId, "$.approvalId", issues),
      proposalId: stableKey(object.proposalId, "$.proposalId", issues),
      proposalHash: hash(object.proposalHash, "$.proposalHash", issues),
      sourceStateFingerprint: hash(
        object.sourceStateFingerprint,
        "$.sourceStateFingerprint",
        issues,
      ),
      approvedAt: instant(object.approvedAt, "$.approvedAt", issues),
      approvedBy: Object.freeze({
        authority: "artist-owner" as const,
        accountAlias: stableKey(
          approvedBy.accountAlias,
          "$.approvedBy.accountAlias",
          issues,
        ),
      }),
      approvedScopes: Object.freeze(approvedScopes),
      statement: "I approve this exact proposal hash." as const,
    },
    issues,
    "The setup approval",
  );
}

export function validateExternalActionApproval(
  value: unknown,
): ExternalActionApproval {
  const issues: SetupValidationIssue[] = [];
  const object = exact(
    value,
    [
      "schemaVersion",
      "approvalId",
      "proposalId",
      "proposalHash",
      "sourceStateFingerprint",
      "actionId",
      "actionHash",
      "approvedAt",
      "approvedBy",
      "statement",
    ],
    "$",
    issues,
  );
  if (object.schemaVersion !== EXTERNAL_ACTION_APPROVAL_SCHEMA_VERSION) {
    issue(
      issues,
      "$.schemaVersion",
      "schema-version",
      `Use ${EXTERNAL_ACTION_APPROVAL_SCHEMA_VERSION}.`,
    );
  }
  if (object.approvedBy !== "michael") {
    issue(
      issues,
      "$.approvedBy",
      "michael-approval-required",
      "Michael provides action-specific external approval.",
    );
  }
  if (object.statement !== "I approve this exact external action hash.") {
    issue(
      issues,
      "$.statement",
      "approval-statement",
      "Use the exact external-action approval statement.",
    );
  }
  return finish(
    {
      schemaVersion: EXTERNAL_ACTION_APPROVAL_SCHEMA_VERSION,
      approvalId: stableKey(object.approvalId, "$.approvalId", issues),
      proposalId: stableKey(object.proposalId, "$.proposalId", issues),
      proposalHash: hash(object.proposalHash, "$.proposalHash", issues),
      sourceStateFingerprint: hash(
        object.sourceStateFingerprint,
        "$.sourceStateFingerprint",
        issues,
      ),
      actionId: stableKey(object.actionId, "$.actionId", issues),
      actionHash: hash(object.actionHash, "$.actionHash", issues),
      approvedAt: instant(object.approvedAt, "$.approvedAt", issues),
      approvedBy: "michael" as const,
      statement: "I approve this exact external action hash." as const,
    },
    issues,
    "The external-action approval",
  );
}

export function requiredApprovalScopes(
  proposal: SetupProposal,
): readonly SetupApprovalScope[] {
  const required = new Set<SetupApprovalScope>([
    "configuration",
    "legal-drafts",
    "account-authority",
  ]);
  const publication = proposal.topics.accountsPublication.publication;
  if (
    publication.artist === "publish" ||
    publication.navigation === "publish" ||
    publication.catalog === "publish" ||
    publication.content === "publish"
  ) {
    required.add("internal-publication");
  }
  if (proposal.mediaActions.length > 0) required.add("media-preparation");
  if (
    publication.media === "publish-approved" ||
    proposal.mediaActions.some(
      (action) => action.operation === "publish-approved",
    )
  ) {
    required.add("media-publication");
  }
  if (proposal.sourceChanges.length > 0) required.add("source-changes");
  return Object.freeze(
    SETUP_APPROVAL_SCOPES.filter((scope) => required.has(scope)),
  );
}

export function assertSetupApprovalMatches(
  artifact: SetupProposalArtifact,
  approval: SetupApproval,
): void {
  if (
    approval.proposalId !== artifact.proposal.proposalId ||
    approval.proposalHash !== artifact.proposalHash
  ) {
    throw new SetupContractError(
      "SETUP_PROPOSAL_HASH_MISMATCH",
      "The approval does not match this exact proposal hash.",
    );
  }
  if (
    approval.sourceStateFingerprint !== artifact.proposal.sourceStateFingerprint
  ) {
    throw new SetupContractError(
      "SETUP_SOURCE_STATE_MISMATCH",
      "The approval does not match this source-state fingerprint.",
    );
  }
  const approved = new Set(approval.approvedScopes);
  const missing = requiredApprovalScopes(artifact.proposal).filter(
    (scope) => !approved.has(scope),
  );
  if (missing.length > 0) {
    throw new SetupContractError(
      "SETUP_APPROVAL_REQUIRED",
      `The exact proposal approval is missing required scope${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
    );
  }
}

export async function createExternalActionHash(
  action: ExternalActionProposal,
): Promise<string> {
  return canonicalSha256(action);
}

export async function assertExternalActionApprovalMatches(
  artifact: SetupProposalArtifact,
  action: ExternalActionProposal,
  approval: ExternalActionApproval,
): Promise<void> {
  if (
    approval.proposalId !== artifact.proposal.proposalId ||
    approval.proposalHash !== artifact.proposalHash ||
    approval.sourceStateFingerprint !==
      artifact.proposal.sourceStateFingerprint ||
    approval.actionId !== action.actionId ||
    approval.actionHash !== (await createExternalActionHash(action))
  ) {
    throw new SetupContractError(
      "SETUP_EXTERNAL_APPROVAL_REQUIRED",
      "The external approval does not match this exact proposal and action hash.",
    );
  }
}
