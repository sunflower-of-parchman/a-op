import {
  assertStripeTestPublishableKey,
  assertStripeTestSecretKey,
  assertStripeWebhookSecret,
  validateStripeTestEnvironment,
} from "../commerce/environment.ts";
import { CommerceAdapterError } from "../commerce/errors.ts";
import { SetupContractError } from "./errors.ts";
import {
  SETUP_PREFLIGHT_SCHEMA_VERSION,
  SITES_SETUP_COMMERCE_ADAPTER,
  type SetupCheck,
  type SetupPreflightReport,
  type SetupProposal,
} from "./types.ts";
import { validateSetupProposal } from "./validation.ts";

const LIVE_CREDENTIAL = /^[\t ]*[a-z][a-z0-9]{1,15}_live_/i;
const OWNER_BOOTSTRAP_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_ENVIRONMENT_KEYS = Object.freeze([
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const);

export interface SetupPreflightInput {
  readonly proposal?: unknown;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly repository: {
    readonly requiredFilesPresent: boolean;
    readonly d1BindingReady: boolean;
    readonly r2BindingReady: boolean;
  };
  readonly localMedia: {
    readonly aliasFilePresent: boolean;
    readonly aliases: readonly string[];
    readonly ffprobeAvailable: boolean;
    readonly ffmpegAvailable: boolean;
  };
}

export interface StripeCredentialInspection {
  readonly state: "not-configured" | "partial" | "ready";
  readonly configuredNames: readonly string[];
}

function ownerBootstrapEmailIsValid(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    normalized.length <= 320 &&
    OWNER_BOOTSTRAP_EMAIL.test(normalized)
  );
}

function productionOwnerBootstrapIsRequired(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return environment.AOP_RUNTIME_ENV === "production";
}

function safeEnvironmentName(name: string): string {
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(name) ? name : "an environment variable";
}

function mapCredentialFailure(error: unknown, name: string): never {
  if (
    error instanceof CommerceAdapterError &&
    error.code === "STRIPE_LIVE_CREDENTIAL_REJECTED"
  ) {
    throw new SetupContractError(
      "SETUP_LIVE_CREDENTIAL_REJECTED",
      `A recognized live Stripe credential was detected in ${safeEnvironmentName(name)}. Live commerce is disabled for Sites.`,
    );
  }
  throw new SetupContractError(
    "SETUP_STRIPE_CONFIGURATION_INVALID",
    `${safeEnvironmentName(name)} is not a valid Stripe Test Mode value.`,
  );
}

export function inspectStripeTestCredentials(
  environment: Readonly<Record<string, string | undefined>>,
): StripeCredentialInspection {
  for (const [name, value] of Object.entries(environment)) {
    if (typeof value === "string" && LIVE_CREDENTIAL.test(value)) {
      throw new SetupContractError(
        "SETUP_LIVE_CREDENTIAL_REJECTED",
        `A recognized live Stripe credential was detected in ${safeEnvironmentName(name)}. Live commerce is disabled for Sites.`,
      );
    }
  }

  const configuredNames = REQUIRED_ENVIRONMENT_KEYS.filter(
    (name) => environment[name] !== undefined,
  );
  const validators = {
    STRIPE_PUBLISHABLE_KEY: assertStripeTestPublishableKey,
    STRIPE_SECRET_KEY: assertStripeTestSecretKey,
    STRIPE_WEBHOOK_SECRET: assertStripeWebhookSecret,
  } as const;
  for (const name of configuredNames) {
    try {
      validators[name](environment[name]);
    } catch (error) {
      mapCredentialFailure(error, name);
    }
  }

  if (configuredNames.length === REQUIRED_ENVIRONMENT_KEYS.length) {
    try {
      validateStripeTestEnvironment({
        publishableKey: environment.STRIPE_PUBLISHABLE_KEY,
        secretKey: environment.STRIPE_SECRET_KEY,
        webhookSecret: environment.STRIPE_WEBHOOK_SECRET,
      });
    } catch (error) {
      mapCredentialFailure(error, "Stripe Test Mode configuration");
    }
  }

  return Object.freeze({
    state:
      configuredNames.length === 0
        ? "not-configured"
        : configuredNames.length === REQUIRED_ENVIRONMENT_KEYS.length
          ? "ready"
          : "partial",
    configuredNames: Object.freeze([...configuredNames]),
  });
}

function addCheck(
  checks: SetupCheck[],
  id: string,
  status: SetupCheck["status"],
  message: string,
): void {
  checks.push(Object.freeze({ id, status, message }));
}

function validatedProposal(
  value: unknown | undefined,
): SetupProposal | undefined {
  return value === undefined ? undefined : validateSetupProposal(value);
}

export function runSetupPreflight(
  input: SetupPreflightInput,
): SetupPreflightReport {
  const proposal = validatedProposal(input.proposal);
  const journey = proposal?.commerce.journey ?? "inactive";
  const credentials = inspectStripeTestCredentials(input.environment);
  const checks: SetupCheck[] = [];

  addCheck(
    checks,
    "repository-contracts",
    input.repository.requiredFilesPresent ? "pass" : "blocked",
    input.repository.requiredFilesPresent
      ? "The governing setup files are present."
      : "One or more governing setup files are missing.",
  );
  addCheck(
    checks,
    "sites-d1-binding",
    input.repository.d1BindingReady ? "pass" : "blocked",
    input.repository.d1BindingReady
      ? "The logical D1 binding is declared."
      : "The logical D1 binding is missing or changed.",
  );
  addCheck(
    checks,
    "sites-r2-binding",
    input.repository.r2BindingReady ? "pass" : "blocked",
    input.repository.r2BindingReady
      ? "The logical R2 binding is declared."
      : "The logical R2 binding is missing or changed.",
  );

  const ownerBootstrapRequired = productionOwnerBootstrapIsRequired(
    input.environment,
  );
  const ownerBootstrapReady = ownerBootstrapEmailIsValid(
    input.environment.AOP_OWNER_BOOTSTRAP_EMAIL,
  );
  addCheck(
    checks,
    "owner-bootstrap-identity",
    ownerBootstrapRequired && !ownerBootstrapReady
      ? "blocked"
      : ownerBootstrapReady
        ? "pass"
        : "attention",
    ownerBootstrapRequired
      ? ownerBootstrapReady
        ? "The fresh production installation has one server-managed owner bootstrap identity."
        : "A fresh production installation requires a valid server-managed AOP_OWNER_BOOTSTRAP_EMAIL before owner bootstrap."
      : ownerBootstrapReady
        ? "A server-managed owner bootstrap identity is configured."
        : "AOP_OWNER_BOOTSTRAP_EMAIL is required before a fresh production installation can bootstrap its owner.",
  );

  if (credentials.state === "ready") {
    addCheck(
      checks,
      "stripe-test-mode",
      "pass",
      "Stripe Test Mode is configured with test-only values.",
    );
  } else if (journey === "active") {
    addCheck(
      checks,
      "stripe-test-mode",
      "blocked",
      "The active simulated commerce journey requires all three Stripe Test Mode values.",
    );
  } else {
    addCheck(
      checks,
      "stripe-test-mode",
      "attention",
      "Stripe Test Mode values can remain absent while the simulated commerce journey is inactive.",
    );
  }

  const requiredAliases = new Set(
    proposal?.mediaActions.map((action) => action.sourceAlias) ?? [],
  );
  const availableAliases = new Set(input.localMedia.aliases);
  const missingAlias = [...requiredAliases].some(
    (alias) => !availableAliases.has(alias),
  );
  if (requiredAliases.size === 0) {
    addCheck(
      checks,
      "local-media-aliases",
      "pass",
      "This proposal requests no local media action.",
    );
  } else if (!input.localMedia.aliasFilePresent || missingAlias) {
    addCheck(
      checks,
      "local-media-aliases",
      "blocked",
      "Every media action requires a matching alias in ignored setup/local-paths.json.",
    );
  } else {
    addCheck(
      checks,
      "local-media-aliases",
      "pass",
      "Every proposed media action has a local path alias.",
    );
  }

  const mediaToolsReady =
    input.localMedia.ffprobeAvailable && input.localMedia.ffmpegAvailable;
  addCheck(
    checks,
    "local-media-tools",
    mediaToolsReady
      ? "pass"
      : requiredAliases.size > 0
        ? "blocked"
        : "attention",
    mediaToolsReady
      ? "Local media inspection tools are available."
      : requiredAliases.size > 0
        ? "The proposed media actions require local ffprobe and ffmpeg commands."
        : "Local media tools are not required until the artist approves media work.",
  );

  const frozenChecks = Object.freeze(checks);
  return Object.freeze({
    schemaVersion: SETUP_PREFLIGHT_SCHEMA_VERSION,
    ok: frozenChecks.every((check) => check.status !== "blocked"),
    commerce: Object.freeze({
      adapter: SITES_SETUP_COMMERCE_ADAPTER,
      journey,
      credentialState: credentials.state,
      livemode: false as const,
    }),
    repository: Object.freeze({ ...input.repository }),
    localMedia: Object.freeze({
      aliasFilePresent: input.localMedia.aliasFilePresent,
      aliasCount: input.localMedia.aliases.length,
      ffprobeAvailable: input.localMedia.ffprobeAvailable,
      ffmpegAvailable: input.localMedia.ffmpegAvailable,
    }),
    checks: frozenChecks,
  });
}

export function requireSetupPreflight(report: SetupPreflightReport): void {
  if (!report.ok) {
    const blocked = report.checks.filter((check) => check.status === "blocked");
    if (blocked.some((check) => check.id === "stripe-test-mode")) {
      throw new SetupContractError(
        "SETUP_COMMERCE_CONFIGURATION_MISSING",
        "The active simulated commerce journey requires complete Stripe Test Mode setup.",
      );
    }
    if (blocked.some((check) => check.id === "owner-bootstrap-identity")) {
      throw new SetupContractError(
        "SETUP_OWNER_BOOTSTRAP_CONFIGURATION_MISSING",
        "Fresh production owner bootstrap requires one valid server-managed identity email.",
      );
    }
    throw new SetupContractError(
      "SETUP_INPUT_INVALID",
      `Setup preflight has ${blocked.length} blocking check${blocked.length === 1 ? "" : "s"}.`,
    );
  }
}
