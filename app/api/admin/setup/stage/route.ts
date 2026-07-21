import { env } from "cloudflare:workers";
import { requireMutationObject } from "@/app/api/admin/mutation-input.ts";
import { readSetupSourceState } from "@/db/setup-source-state.ts";
import {
  beginSetupApplication,
  readSetupApplicationByProposalHash,
} from "@/db/setup-state.ts";
import {
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import {
  canonicalSha256,
  compileSetupOperationPlan,
  createProposalArtifact,
  validateSetupApproval,
} from "@/lib/setup/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { readSetupJsonMutation, runSetupContract } from "../setup-route.ts";

export const dynamic = "force-dynamic";

function requireReady(
  plan: Awaited<ReturnType<typeof compileSetupOperationPlan>>,
) {
  if (!plan.readyForApply || plan.blockers.length > 0) {
    throw new RuntimeError(
      "SETUP_PLAN_BLOCKED",
      `The setup plan is blocked: ${plan.blockers.join(", ") || "approval required"}.`,
      {
        status: 409,
        publicMessage:
          "The setup proposal, current state, and exact approval are not ready to stage.",
        details: { blockers: plan.blockers },
      },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.setup_stage_failed", async (requestId) => {
    const raw = await readSetupJsonMutation(request);
    const input = requireMutationObject(
      raw,
      ["proposal", "approval", "externalApprovals"],
      "Setup stage request",
    );
    if (!("proposal" in input) || !("approval" in input)) {
      throw new RuntimeError(
        "INVALID_INPUT",
        "Setup staging requires a proposal and its separate exact approval.",
        {
          status: 400,
          publicMessage:
            "Provide the complete setup proposal and its exact approval.",
        },
      );
    }
    if (
      input.externalApprovals !== undefined &&
      (!Array.isArray(input.externalApprovals) ||
        input.externalApprovals.length > 0)
    ) {
      throw new RuntimeError(
        "SETUP_EXTERNAL_APPROVAL_REQUIRED",
        "Staging currently accepts protected media only.",
        {
          status: 409,
          publicMessage:
            "Public media actions require the complete action-specific approval workflow.",
        },
      );
    }

    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
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
        externalApprovals: [],
        currentSourceStateFingerprint:
          existing === null
            ? current.fingerprint
            : artifact.proposal.sourceStateFingerprint,
      }),
    );
    requireReady(plan);
    const approvalHash = await canonicalSha256(approval);
    const staged = await beginSetupApplication(
      env.DB,
      {
        proposalHash: artifact.proposalHash,
        proposalSchemaVersion: 1,
        sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
        approvalHash,
        approvedAt: approval.approvedAt,
        operationCount: plan.operations.length,
      },
      {
        actorUserId: owner.userId,
        idempotencyKey,
        requestId,
      },
    );

    return apiJson(
      {
        result: {
          status:
            staged.application.status === "applied"
              ? "applied"
              : "awaiting-media",
          applicationId: staged.application.id,
          applicationKey: staged.application.applicationKey,
          proposalHash: artifact.proposalHash,
          approvalHash,
          operationCount: plan.operations.length,
          mediaActions: artifact.proposal.mediaActions.map((action) => ({
            actionId: action.actionId,
            mediaKey: action.mediaKey,
            operation: action.operation,
            derivatives: action.derivatives,
          })),
        },
        replayed: staged.replayed,
      },
      requestId,
      staged.replayed ? 200 : 201,
    );
  });
}
