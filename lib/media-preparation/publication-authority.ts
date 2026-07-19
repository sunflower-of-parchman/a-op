import { validateExternalActionApproval } from "../setup/index.ts";
import { requireContractSha256 } from "./validation.ts";

const SAFE_LOGICAL_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface SafeExternalPublicationAuthority {
  readonly actionId: string;
  readonly actionSha256: string;
}

export function requirePublicationMediaKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !SAFE_LOGICAL_KEY.test(value)
  ) {
    throw new TypeError(
      "Media key must use lowercase words separated by single hyphens.",
    );
  }
  return value;
}

export function resolveExternalPublicationAuthority(input: {
  readonly visibility: "public" | "protected";
  readonly manifestProposalSha256: unknown;
  readonly externalApproval?: unknown;
}): SafeExternalPublicationAuthority | null {
  if (input.visibility === "protected") {
    if (input.externalApproval !== undefined) {
      throw new TypeError(
        "Protected publication accepts no external-action approval.",
      );
    }
    return null;
  }

  if (input.externalApproval === undefined) {
    throw new TypeError(
      "Public publication requires an external-action approval.",
    );
  }
  const manifestProposalSha256 = requireContractSha256(
    input.manifestProposalSha256,
    "Media manifest proposal SHA-256",
  );
  const approval = validateExternalActionApproval(input.externalApproval);
  if (approval.proposalHash !== manifestProposalSha256) {
    throw new TypeError(
      "External-action approval does not match the approved media manifest proposal.",
    );
  }
  return Object.freeze({
    actionId: approval.actionId,
    actionSha256: approval.actionHash,
  });
}
