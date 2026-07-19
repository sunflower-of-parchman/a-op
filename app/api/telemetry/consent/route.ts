import { env } from "cloudflare:workers";
import { readTelemetryPublicConfiguration } from "@/db/telemetry-read.ts";
import { readJsonMutation } from "@/lib/auth/authorize-application.ts";
import {
  clearSessionCookie,
  consentCookie,
  sessionCookie,
  validateTelemetryConsent,
} from "@/lib/telemetry/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("telemetry.consent_failed", async (requestId) => {
    const input = validateTelemetryConsent(await readJsonMutation(request));
    const configuration = await readTelemetryPublicConfiguration(
      env.DB,
      request.headers,
      input.decision,
    );
    const response = apiJson({ configuration }, requestId);
    response.headers.append(
      "set-cookie",
      consentCookie(request, input.decision),
    );
    response.headers.append(
      "set-cookie",
      configuration.collecting
        ? sessionCookie(request, crypto.randomUUID())
        : clearSessionCookie(request),
    );
    return response;
  });
}
