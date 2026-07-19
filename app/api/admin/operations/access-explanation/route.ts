import { env } from "cloudflare:workers";
import { readOwnerAccessExplanation } from "@/db/operations-read.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
} from "@/lib/auth/authorize-application.ts";
import { requireAccessExplanationInput } from "@/lib/operations/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(
    "admin.operations_access_explanation_failed",
    async (requestId) => {
      const input = requireAccessExplanationInput(
        await readJsonMutation(request),
      );
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      const result = await readOwnerAccessExplanation(
        env.DB,
        owner.userId,
        input,
      );
      return apiJson({ result }, requestId);
    },
  );
}
