import { env } from "cloudflare:workers";
import { requireMutationObject } from "@/app/api/admin/mutation-input.ts";
import { applySetupOperationPlan } from "@/db/setup-apply.ts";
import { readSetupSourceState } from "@/db/setup-source-state.ts";
import {
  beginSetupApplication,
  completeSetupApplication,
  failSetupApplication,
  readSetupApplicationByProposalHash,
} from "@/db/setup-state.ts";
import {
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import {
  assertExternalActionApprovalMatches,
  canonicalSha256,
  compileSetupOperationPlan,
  createExternalActionHash,
  createProposalArtifact,
  createSourceStateFingerprint,
  validateExternalActionApproval,
  validateSetupApproval,
  type SetupProposalArtifact,
  type SetupOperationPlan,
} from "@/lib/setup/index.ts";
import type { SetupExternalActionApprovalReceipt } from "@/db/setup-state.ts";
import { readSetupJsonMutation, runSetupContract } from "../setup-route.ts";

export const dynamic = "force-dynamic";

function readExternalApprovals(value: unknown): readonly unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) {
    throw new RuntimeError(
      "INVALID_INPUT",
      "Setup external approvals must be an array with at most 32 entries.",
      {
        status: 400,
        publicMessage: "Provide valid setup external approvals.",
      },
    );
  }
  return value;
}

function d1Plan(plan: SetupOperationPlan): SetupOperationPlan {
  return Object.freeze({
    ...plan,
    operations: Object.freeze(
      plan.operations.filter(
        (operation) => operation.mutationBoundary === "d1",
      ),
    ),
  });
}

function requireReady(plan: SetupOperationPlan): void {
  if (!plan.readyForApply || plan.blockers.length > 0) {
    throw new RuntimeError(
      "SETUP_PLAN_BLOCKED",
      `The setup plan is blocked: ${plan.blockers.join(", ") || "approval required"}.`,
      {
        status: 409,
        publicMessage:
          "The setup proposal, current state, and exact approvals are not ready to apply.",
        details: { blockers: plan.blockers },
      },
    );
  }
}

async function externalActionApprovalReceipts(
  artifact: SetupProposalArtifact,
  values: readonly unknown[],
): Promise<readonly SetupExternalActionApprovalReceipt[]> {
  const receipts: SetupExternalActionApprovalReceipt[] = [];
  for (const value of values) {
    const approval = validateExternalActionApproval(value);
    const action = artifact.proposal.externalActions.find(
      (candidate) => candidate.actionId === approval.actionId,
    );
    if (!action) {
      throw new RuntimeError(
        "SETUP_EXTERNAL_APPROVAL_REQUIRED",
        "An external approval references no action in the exact setup proposal.",
        {
          status: 409,
          publicMessage:
            "Provide action-specific approvals for this exact setup proposal.",
        },
      );
    }
    await assertExternalActionApprovalMatches(artifact, action, approval);
    receipts.push(
      Object.freeze({
        actionId: action.actionId,
        kind: action.kind,
        target: action.target,
        actionHash: await createExternalActionHash(action),
        approvalHash: await canonicalSha256(approval),
        approvedAt: approval.approvedAt,
        approvedBy: "michael" as const,
      }),
    );
  }
  return Object.freeze(receipts);
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.setup_apply_failed", async (requestId) => {
    const raw = await readSetupJsonMutation(request);
    const input = requireMutationObject(
      raw,
      ["proposal", "approval", "externalApprovals"],
      "Setup apply request",
    );
    if (!("proposal" in input) || !("approval" in input)) {
      throw new RuntimeError(
        "INVALID_INPUT",
        "Setup apply requires a proposal and its separate exact approval.",
        {
          status: 400,
          publicMessage:
            "Provide the setup proposal and its separate exact approval.",
        },
      );
    }

    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const context = {
      actorUserId: owner.userId,
      idempotencyKey,
      requestId,
    } as const;

    let applicationKey: string | null = null;
    try {
      const rawExternalApprovals = readExternalApprovals(
        input.externalApprovals,
      );
      const [artifact, approval, current] = await Promise.all([
        runSetupContract(() => createProposalArtifact(input.proposal)),
        runSetupContract(async () => validateSetupApproval(input.approval)),
        readSetupSourceState(env.DB),
      ]);
      const existing = await readSetupApplicationByProposalHash(
        env.DB,
        artifact.proposalHash,
        owner.userId,
      );
      const plan = await runSetupContract(() =>
        compileSetupOperationPlan({
          proposal: artifact.proposal,
          approval,
          externalApprovals: rawExternalApprovals,
          currentSourceStateFingerprint:
            existing === null
              ? current.fingerprint
              : artifact.proposal.sourceStateFingerprint,
        }),
      );
      requireReady(plan);
      const externalApprovalReceipts = await runSetupContract(() =>
        externalActionApprovalReceipts(artifact, rawExternalApprovals),
      );

      const approvalHash = await canonicalSha256(approval);
      const begun = await beginSetupApplication(
        env.DB,
        {
          proposalHash: artifact.proposalHash,
          proposalSchemaVersion: 1,
          sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
          approvalHash,
          approvedAt: approval.approvedAt,
          operationCount: plan.operations.length,
        },
        context,
      );
      applicationKey = begun.application.applicationKey;

      const deferred = Object.freeze(
        plan.operations
          .filter((operation) => operation.mutationBoundary !== "d1")
          .map((operation) =>
            Object.freeze({
              operationId: operation.operationId,
              topic: operation.topic,
              action: operation.action,
              mutationBoundary: operation.mutationBoundary,
              state: "deferred" as const,
            }),
          ),
      );

      if (begun.application.status === "applied") {
        return apiJson(
          {
            result: {
              status: begun.application.status,
              operationCount: begun.application.operationCount,
              stateFingerprint: begun.application.resultStateFingerprint,
            },
            replayed: true,
            deferred,
          },
          requestId,
        );
      }

      const receipt = await applySetupOperationPlan(
        env.DB,
        artifact.proposal,
        d1Plan(plan),
        context,
      );
      const afterOperations = await readSetupSourceState(env.DB);
      const resultStateFingerprint = await createSourceStateFingerprint({
        ...afterOperations.snapshot,
        setupRevision: afterOperations.snapshot.setupRevision + 1,
      });
      const completed = await completeSetupApplication(
        env.DB,
        {
          applicationKey,
          resultStateFingerprint,
          operationCount: plan.operations.length,
          mediaObjectCount: 0,
          mediaByteCount: 0,
          externalActionApprovals: externalApprovalReceipts,
        },
        context,
      );
      const verified = await readSetupSourceState(env.DB);
      if (verified.fingerprint !== resultStateFingerprint) {
        throw new RuntimeError(
          "SETUP_RESULT_STATE_MISMATCH",
          "The completed setup fingerprint differs from the stored installation state.",
          {
            status: 500,
            publicMessage: "The setup result could not be verified.",
          },
        );
      }

      return apiJson(
        {
          result: {
            status: completed.status,
            operationCount: completed.operationCount,
            stateFingerprint: completed.resultStateFingerprint,
          },
          replayed: begun.replayed,
          receipt,
          deferred,
        },
        requestId,
        begun.replayed ? 200 : 201,
      );
    } catch (error) {
      if (applicationKey !== null) {
        await failSetupApplication(
          env.DB,
          applicationKey,
          "SETUP_OPERATION_FAILED",
          owner.userId,
        );
      }
      throw error;
    }
  });
}
