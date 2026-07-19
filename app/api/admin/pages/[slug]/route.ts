import { env } from "cloudflare:workers";
import { savePageDraft } from "@/db/page-write.ts";
import { readAdminPageDraftBySlug } from "@/db/site-read.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { validatePageDraftInput } from "@/lib/site/validation.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
  throwValidationIssues,
} from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface PageRouteContext {
  readonly params: Promise<{ slug: string }>;
}

export async function PUT(
  request: Request,
  context: PageRouteContext,
): Promise<Response> {
  return runApiRoute("admin.page_draft_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedVersion", "page"],
      "Page draft request",
    );
    const expectedVersion = requireExpectedVersion(input.expectedVersion, {
      allowZero: true,
    });
    const page = validatePageDraftInput(input.page);
    if (!page.ok) throwValidationIssues("Page draft", page.issues);

    const slug = requireRouteSlug((await context.params).slug);
    if (page.value.slug !== slug) {
      throwValidationIssues("Page draft", [
        {
          code: "site-page-slug-mismatch",
          field: "page.slug",
          message: "Page slug must match the requested route.",
        },
      ]);
    }

    const identity = await requireApplicationAuthority(
      env.DB,
      ["owner", "editor"],
      { permissionKey: "pages.write", scopeId: slug },
    );
    if (!identity.roles.includes("owner")) {
      const current =
        expectedVersion === 0
          ? null
          : await readAdminPageDraftBySlug(env.DB, slug, identity.userId);
      const structureChanged = current
        ? current.moduleKey !== page.value.moduleKey ||
          current.kind !== page.value.kind
        : page.value.moduleKey !== null || page.value.kind !== "standard";
      if (structureChanged) {
        throw new RuntimeError(
          "STRUCTURE_OWNER_REQUIRED",
          "Only the owner can change page kind or module ownership.",
          {
            status: 403,
            publicMessage:
              "Only the owner can change this page's kind or required module.",
          },
        );
      }
    }
    const result = await savePageDraft(env.DB, page.value, expectedVersion, {
      actorUserId: identity.userId,
      idempotencyKey,
      requestId,
    });

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.value.created && !result.replayed ? 201 : 200,
    );
  });
}
