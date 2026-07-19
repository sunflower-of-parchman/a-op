import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { deliverLicenseDocument } from "@/lib/licensing/document-delivery.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

export const dynamic = "force-dynamic";

interface LicenseDocumentRouteContext {
  readonly params: Promise<{ licenseDocumentId: string }>;
}

export async function GET(
  request: Request,
  context: LicenseDocumentRouteContext,
): Promise<Response> {
  return runApiRoute(
    "licensing.document_delivery_failed",
    async (requestId) => {
      await requireActiveModule(env.DB, "licensing");
      const identity = await resolveApplicationIdentity(
        env.DB,
        await getChatGPTUser(),
      );
      return deliverLicenseDocument({
        binding: env.DB,
        bucket: env.MEDIA,
        requestId,
        licenseDocumentId: (await context.params).licenseDocumentId,
        identity,
        telemetry: telemetryMutationRequestContext(request),
      });
    },
  );
}
