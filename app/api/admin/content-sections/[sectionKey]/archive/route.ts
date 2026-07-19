import { env } from "cloudflare:workers";
import { archiveContentSection } from "@/db/content-section-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateContentSectionKey } from "@/lib/content-sections/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  throwValidationIssues,
} from "../../../mutation-input.ts";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ sectionKey: string }> },
): Promise<Response> {
  return runApiRoute(
    "admin.content_section_archive_failed",
    async (requestId) => {
      const requestInput = await readJsonMutation(request);
      const idempotencyKey = requireIdempotencyKey(request);
      const input = requireMutationObject(
        requestInput,
        ["expectedVersion"],
        "Content section archive request",
      );
      const expectedVersion = requireExpectedVersion(input.expectedVersion, {
        allowZero: false,
      });
      const keyResult = validateContentSectionKey(
        (await context.params).sectionKey,
      );
      if (!keyResult.ok) {
        throwValidationIssues("Content section key", keyResult.issues);
      }
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      const result = await archiveContentSection(
        env.DB,
        keyResult.value,
        expectedVersion,
        {
          actorUserId: owner.userId,
          idempotencyKey,
          requestId,
        },
      );
      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
      );
    },
  );
}
