import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { recordTelemetryEvent } from "@/db/telemetry-write.ts";
import { readJsonMutation } from "@/lib/auth/authorize-application.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import {
  readTelemetryConsent,
  readTelemetryPrivacySignal,
  readTelemetrySession,
  sessionCookie,
  validatePublicTelemetryEvent,
} from "@/lib/telemetry/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("telemetry.event_failed", async (requestId) => {
    const input = validatePublicTelemetryEvent(await readJsonMutation(request));
    const authenticatedUser = await getChatGPTUser();
    const identity = authenticatedUser
      ? await resolveApplicationIdentity(env.DB, authenticatedUser)
      : null;
    const existingSession = readTelemetrySession(request.headers);
    const sessionId = existingSession ?? crypto.randomUUID();
    const receipt = await recordTelemetryEvent(env.DB, input, {
      sessionId,
      userId: identity?.userId ?? null,
      consent: readTelemetryConsent(request.headers),
      privacySignal: readTelemetryPrivacySignal(request.headers),
      browserObserved: true,
    });
    const response = apiJson(
      { result: receipt },
      requestId,
      receipt.recorded ? 201 : 202,
    );
    if (receipt.recorded && !existingSession) {
      response.headers.append("set-cookie", sessionCookie(request, sessionId));
    }
    return response;
  });
}
