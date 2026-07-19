export type SetupContractErrorCode =
  | "SETUP_INPUT_INVALID"
  | "SETUP_PROPOSAL_HASH_MISMATCH"
  | "SETUP_SOURCE_STATE_MISMATCH"
  | "SETUP_APPROVAL_REQUIRED"
  | "SETUP_EXTERNAL_APPROVAL_REQUIRED"
  | "SETUP_LIVE_CREDENTIAL_REJECTED"
  | "SETUP_STRIPE_CONFIGURATION_INVALID"
  | "SETUP_COMMERCE_CONFIGURATION_MISSING"
  | "SETUP_OWNER_BOOTSTRAP_CONFIGURATION_MISSING"
  | "SETUP_FILE_BOUNDARY_REJECTED"
  | "SETUP_FILE_INVALID";

export interface SetupValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export class SetupContractError extends Error {
  readonly code: SetupContractErrorCode;
  readonly issues: readonly SetupValidationIssue[];

  constructor(
    code: SetupContractErrorCode,
    message: string,
    issues: readonly SetupValidationIssue[] = [],
  ) {
    super(message);
    this.name = "SetupContractError";
    this.code = code;
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    );
  }
}
