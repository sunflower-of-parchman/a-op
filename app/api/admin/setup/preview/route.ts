import { env } from "cloudflare:workers";
import { requireMutationObject } from "@/app/api/admin/mutation-input.ts";
import { readSetupSourceState } from "@/db/setup-source-state.ts";
import { requireApplicationAuthority } from "@/lib/auth/authorize-application.ts";
import { compileSetupOperationPlan } from "@/lib/setup/operations.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
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

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.setup_preview_failed", async (requestId) => {
    const raw = await readSetupJsonMutation(request);
    const input = requireMutationObject(
      raw,
      ["proposal", "approval", "externalApprovals"],
      "Setup preview request",
    );
    if (!("proposal" in input)) {
      throw new RuntimeError(
        "INVALID_INPUT",
        "Setup preview requires a proposal.",
        {
          status: 400,
          publicMessage: "Provide the setup proposal to preview.",
        },
      );
    }
    await requireApplicationAuthority(env.DB, ["owner"]);
    const current = await readSetupSourceState(env.DB);
    const plan = await runSetupContract(() =>
      compileSetupOperationPlan({
        proposal: input.proposal,
        ...(input.approval === undefined ? {} : { approval: input.approval }),
        externalApprovals: readExternalApprovals(input.externalApprovals),
        currentSourceStateFingerprint: current.fingerprint,
      }),
    );
    if (plan.writesPerformed !== 0) {
      throw new Error("Setup preview violated its zero-write contract.");
    }
    return apiJson(
      {
        plan,
        currentSourceStateFingerprint: current.fingerprint,
      },
      requestId,
    );
  });
}
