export type CommerceAdapterErrorCode =
  | "STRIPE_CONFIGURATION_MISSING"
  | "STRIPE_CONFIGURATION_INVALID"
  | "STRIPE_LIVE_CREDENTIAL_REJECTED"
  | "STRIPE_WEBHOOK_SIGNATURE_INVALID"
  | "STRIPE_WEBHOOK_TIMESTAMP_INVALID"
  | "STRIPE_WEBHOOK_PAYLOAD_INVALID"
  | "STRIPE_EVENT_UNSUPPORTED"
  | "STRIPE_LIVE_EVENT_REJECTED"
  | "STRIPE_CHECKOUT_INPUT_INVALID"
  | "STRIPE_CHECKOUT_REQUEST_FAILED"
  | "STRIPE_CHECKOUT_RESPONSE_INVALID";

/** A stable, redacted failure from the test-only commerce adapter. */
export class CommerceAdapterError extends Error {
  readonly code: CommerceAdapterErrorCode;

  constructor(code: CommerceAdapterErrorCode, message: string) {
    super(message);
    this.name = "CommerceAdapterError";
    this.code = code;
  }
}
