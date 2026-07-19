import {
  REQUEST_ID_HEADER,
  createErrorResponse,
  createRequestId,
} from "./index.ts";
import { runtimeLogger } from "./server-logger.ts";

export function apiJson(
  body: unknown,
  requestId: string,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function runApiRoute(
  event: string,
  handler: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = createRequestId();

  try {
    return await handler(requestId);
  } catch (error) {
    runtimeLogger.write({
      level: "error",
      event,
      requestId,
      error,
    });
    return createErrorResponse(error, requestId);
  }
}
