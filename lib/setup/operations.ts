import { isSha256, sha256 } from "./canonical.ts";
import {
  assertExternalActionApprovalMatches,
  assertSetupApprovalMatches,
  requiredApprovalScopes,
  validateExternalActionApproval,
  validateSetupApproval,
} from "./approval.ts";
import { SetupContractError } from "./errors.ts";
import { createProposalArtifact } from "./proposal.ts";
import {
  SETUP_OPERATION_PLAN_SCHEMA_VERSION,
  type ExternalActionApproval,
  type SetupApproval,
  type SetupApprovalScope,
  type SetupMutationBoundary,
  type SetupOperation,
  type SetupOperationPlan,
  type SetupProposalArtifact,
  type SetupTopicKey,
} from "./types.ts";

interface OperationSeed {
  readonly topic: SetupTopicKey | "media" | "source" | "external";
  readonly action: string;
  readonly target: string;
  readonly mutationBoundary: SetupMutationBoundary;
  readonly requiredApproval: SetupApprovalScope | "external-action";
  readonly externalActionId?: string;
}

const TOPIC_OPERATION_SEEDS = Object.freeze([
  {
    topic: "artist",
    action: "upsert-artist-draft",
    target: "artist",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "capabilities-navigation",
    action: "reconcile-modules-navigation",
    target: "module-registry",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "rights-media",
    action: "record-media-rights-intent",
    target: "media-rights",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "catalog-releases",
    action: "reconcile-catalog-drafts",
    target: "catalog",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "streaming-downloads",
    action: "reconcile-track-availability",
    target: "track-availability",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "courses-video",
    action: "reconcile-courses-video-foundation",
    target: "courses-video-foundation",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "customer-access",
    action: "reconcile-access-definitions",
    target: "access-definitions",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "memberships-subscriptions",
    action: "reconcile-membership-definitions",
    target: "membership-definitions",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "credits",
    action: "reconcile-credit-rules",
    target: "credit-rules",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "licensing",
    action: "reconcile-licensing-definitions",
    target: "licensing-definitions",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "courses-video",
    action: "reconcile-courses-video-drafts",
    target: "courses-video",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "editorial-presentation",
    action: "reconcile-editorial-presentation",
    target: "editorial-presentation",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "contact-consent",
    action: "reconcile-contact-consent",
    target: "contact-consent",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "telemetry-retention",
    action: "reconcile-telemetry-settings",
    target: "telemetry-settings",
    mutationBoundary: "d1",
    requiredApproval: "configuration",
  },
  {
    topic: "privacy-terms",
    action: "save-legal-drafts",
    target: "legal-documents",
    mutationBoundary: "d1",
    requiredApproval: "legal-drafts",
  },
  {
    topic: "accounts-publication",
    action: "reconcile-account-authority",
    target: "account-authority",
    mutationBoundary: "d1",
    requiredApproval: "account-authority",
  },
] satisfies readonly OperationSeed[]);

export interface CompileSetupOperationPlanInput {
  readonly proposal: unknown;
  readonly approval?: unknown;
  readonly externalApprovals?: readonly unknown[];
  readonly currentSourceStateFingerprint?: string;
}

async function operationIdentity(
  artifact: SetupProposalArtifact,
  seed: OperationSeed,
): Promise<Pick<SetupOperation, "operationId" | "idempotencyKey">> {
  const digest = await sha256(
    [
      artifact.proposalHash,
      seed.topic,
      seed.action,
      seed.target,
      seed.externalActionId ?? "",
    ].join("\n"),
  );
  const suffix = digest.slice("sha256:".length);
  return {
    operationId: `op-${suffix.slice(0, 24)}`,
    idempotencyKey: `setup-${suffix.slice(0, 32)}`,
  };
}

function publicationRequested(artifact: SetupProposalArtifact): boolean {
  const publication = artifact.proposal.topics.accountsPublication.publication;
  return (
    publication.artist === "publish" ||
    publication.navigation === "publish" ||
    publication.catalog === "publish" ||
    publication.content === "publish"
  );
}

function operationSeeds(artifact: SetupProposalArtifact): OperationSeed[] {
  const seeds: OperationSeed[] = [...TOPIC_OPERATION_SEEDS];
  if (publicationRequested(artifact)) {
    seeds.push({
      topic: "accounts-publication",
      action: "publish-approved-internal-state",
      target: "internal-publication",
      mutationBoundary: "d1",
      requiredApproval: "internal-publication",
    });
  }
  for (const action of artifact.proposal.mediaActions) {
    seeds.push({
      topic: "media",
      action: action.operation,
      target: action.actionId,
      mutationBoundary:
        action.operation === "publish-approved" ? "r2-d1" : "local-workspace",
      requiredApproval:
        action.operation === "publish-approved"
          ? "media-publication"
          : "media-preparation",
    });
  }
  for (const change of artifact.proposal.sourceChanges) {
    seeds.push({
      topic: "source",
      action: "apply-artist-requested-source-change",
      target: change.changeId,
      mutationBoundary: "git",
      requiredApproval: "source-changes",
    });
  }
  for (const action of artifact.proposal.externalActions) {
    seeds.push({
      topic: "external",
      action: action.kind,
      target: action.actionId,
      mutationBoundary: "external",
      requiredApproval: "external-action",
      externalActionId: action.actionId,
    });
  }
  return seeds;
}

export async function compileSetupOperationPlan(
  input: CompileSetupOperationPlanInput,
): Promise<SetupOperationPlan> {
  const artifact = await createProposalArtifact(input.proposal);
  let approval: SetupApproval | undefined;
  if (input.approval !== undefined) {
    approval = validateSetupApproval(input.approval);
    assertSetupApprovalMatches(artifact, approval);
  }
  if (
    input.currentSourceStateFingerprint !== undefined &&
    !isSha256(input.currentSourceStateFingerprint)
  ) {
    throw new SetupContractError(
      "SETUP_INPUT_INVALID",
      "The current source-state fingerprint must be a canonical sha256 hash.",
    );
  }

  const externalApprovals = (input.externalApprovals ?? []).map(
    validateExternalActionApproval,
  );
  const externalApprovalByAction = new Map<string, ExternalActionApproval>();
  for (const externalApproval of externalApprovals) {
    if (externalApprovalByAction.has(externalApproval.actionId)) {
      throw new SetupContractError(
        "SETUP_INPUT_INVALID",
        "Provide one external approval for each action.",
      );
    }
    externalApprovalByAction.set(externalApproval.actionId, externalApproval);
  }
  for (const approvalActionId of externalApprovalByAction.keys()) {
    if (
      !artifact.proposal.externalActions.some(
        (action) => action.actionId === approvalActionId,
      )
    ) {
      throw new SetupContractError(
        "SETUP_EXTERNAL_APPROVAL_REQUIRED",
        "An external approval references no action in this proposal.",
      );
    }
  }

  const validExternalApprovals = new Set<string>();
  for (const action of artifact.proposal.externalActions) {
    const actionApproval = externalApprovalByAction.get(action.actionId);
    if (actionApproval) {
      await assertExternalActionApprovalMatches(
        artifact,
        action,
        actionApproval,
      );
      validExternalApprovals.add(action.actionId);
    }
  }

  const approvedScopes = new Set(approval?.approvedScopes ?? []);
  const operations = await Promise.all(
    operationSeeds(artifact).map(async (seed): Promise<SetupOperation> => {
      const identity = await operationIdentity(artifact, seed);
      const ready =
        seed.requiredApproval === "external-action"
          ? validExternalApprovals.has(seed.externalActionId ?? "")
          : approvedScopes.has(seed.requiredApproval);
      return Object.freeze({
        ...identity,
        topic: seed.topic,
        action: seed.action,
        target: seed.target,
        mutationBoundary: seed.mutationBoundary,
        requiredApproval: seed.requiredApproval,
        state: ready ? "ready" : "approval-required",
      });
    }),
  );

  const blockers: string[] = [];
  if (!approval) blockers.push("exact-proposal-approval-required");
  if (input.currentSourceStateFingerprint === undefined) {
    blockers.push("current-source-state-verification-required");
  } else if (
    input.currentSourceStateFingerprint !==
    artifact.proposal.sourceStateFingerprint
  ) {
    blockers.push("source-state-changed-create-a-new-proposal");
  }
  if (
    artifact.proposal.topics.accountsPublication.ownerAcknowledgement !==
    "artist-authorized"
  ) {
    blockers.push("artist-owner-authorization-required");
  }
  if (
    artifact.proposal.mediaActions.some((action) => {
      const media = artifact.proposal.topics.rightsMedia.media.find(
        (entry) => entry.mediaKey === action.mediaKey,
      );
      return media?.rights !== "confirmed";
    })
  ) {
    blockers.push("media-rights-confirmation-required");
  }
  for (const action of artifact.proposal.externalActions) {
    if (!validExternalApprovals.has(action.actionId)) {
      blockers.push(`external-action-approval-required:${action.actionId}`);
    }
  }
  if (operations.some((operation) => operation.state !== "ready")) {
    blockers.push("operation-approval-required");
  }

  return Object.freeze({
    schemaVersion: SETUP_OPERATION_PLAN_SCHEMA_VERSION,
    proposalId: artifact.proposal.proposalId,
    proposalHash: artifact.proposalHash,
    sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
    writesPerformed: 0,
    readyForApply: blockers.length === 0,
    requiredScopes: requiredApprovalScopes(artifact.proposal),
    blockers: Object.freeze([...new Set(blockers)]),
    operations: Object.freeze(operations),
  });
}
