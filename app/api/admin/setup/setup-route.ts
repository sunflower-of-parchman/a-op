import { SetupContractError } from "@/lib/setup/errors.ts";
import { requireSameOrigin } from "@/lib/auth/authorize-application.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const MAXIMUM_SETUP_BYTES = 1_048_576;

function invalidSetupInput(message: string, status = 400): RuntimeError {
  return new RuntimeError(
    status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
    message,
    {
      status,
      publicMessage:
        status === 413
          ? "The setup artifact is too large to submit."
          : "Provide valid setup JSON.",
    },
  );
}

export async function readSetupJsonMutation(
  request: Request,
): Promise<unknown> {
  requireSameOrigin(request);
  if (
    request.headers.get("content-type")?.split(";", 1)[0] !== "application/json"
  ) {
    throw new RuntimeError(
      "CONTENT_TYPE_REQUIRED",
      "Setup mutations require application/json.",
      { status: 415, publicMessage: "Submit setup as application JSON." },
    );
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAXIMUM_SETUP_BYTES) {
    throw invalidSetupInput("Setup mutation input is too large.", 413);
  }
  if (!request.body) throw invalidSetupInput("Setup mutation JSON is missing.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAXIMUM_SETUP_BYTES) {
        await reader.cancel();
        throw invalidSetupInput("Setup mutation input is too large.", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw invalidSetupInput("Setup mutation JSON is invalid.");
  }
}

function publicMessage(code: SetupContractError["code"]): string {
  if (
    code === "SETUP_PROPOSAL_HASH_MISMATCH" ||
    code === "SETUP_SOURCE_STATE_MISMATCH" ||
    code === "SETUP_APPROVAL_REQUIRED" ||
    code === "SETUP_EXTERNAL_APPROVAL_REQUIRED"
  ) {
    return "The setup proposal, current state, and approval must match exactly.";
  }
  if (
    code === "SETUP_LIVE_CREDENTIAL_REJECTED" ||
    code === "SETUP_STRIPE_CONFIGURATION_INVALID" ||
    code === "SETUP_COMMERCE_CONFIGURATION_MISSING"
  ) {
    return "Stripe Test Mode setup is incomplete or invalid.";
  }
  return "Provide a valid setup proposal and exact approval.";
}

function status(code: SetupContractError["code"]): number {
  return code.includes("MISMATCH") || code.includes("APPROVAL") ? 409 : 400;
}

export async function runSetupContract<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SetupContractError) {
      throw new RuntimeError(error.code, error.message, {
        status: status(error.code),
        publicMessage: publicMessage(error.code),
        details: {
          issueCount: error.issues.length,
          issues: error.issues,
        },
      });
    }
    throw error;
  }
}
