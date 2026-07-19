export const PORTABILITY_ERROR_CODES = Object.freeze({
  FORMAT_INVALID: "PORTABILITY_FORMAT_INVALID",
  SCHEMA_INVALID: "PORTABILITY_SCHEMA_INVALID",
  PROHIBITED_DATA: "PORTABILITY_PROHIBITED_DATA",
  ENTRY_PATH_INVALID: "PORTABILITY_ENTRY_PATH_INVALID",
  ENTRY_KIND_INVALID: "PORTABILITY_ENTRY_KIND_INVALID",
  ENTRY_SET_INVALID: "PORTABILITY_ENTRY_SET_INVALID",
  CHECKSUM_INVALID: "PORTABILITY_CHECKSUM_INVALID",
  FINGERPRINT_INVALID: "PORTABILITY_FINGERPRINT_INVALID",
  DUPLICATE_RECORD: "PORTABILITY_DUPLICATE_RECORD",
  RESTORE_CONFLICT: "PORTABILITY_RESTORE_CONFLICT",
} as const);

export type PortabilityErrorCode =
  (typeof PORTABILITY_ERROR_CODES)[keyof typeof PORTABILITY_ERROR_CODES];

export class PortabilityError extends Error {
  readonly code: PortabilityErrorCode;
  readonly location: string;

  constructor(code: PortabilityErrorCode, message: string, location = "$") {
    super(message);
    this.name = "PortabilityError";
    this.code = code;
    this.location = location;
  }
}
