import { RuntimeError } from "../runtime/index.ts";
import { requireDerivativeProfile } from "./profiles.ts";
import type {
  FixedDerivativeProfile,
  MediaInspection,
  MediaIntendedUse,
  PreparedMediaKind,
} from "./types.ts";
import { MEDIA_INTENDED_USES, MEDIA_KINDS } from "./types.ts";
import {
  MEDIA_ALIAS_PATTERN,
  SHA256_PATTERN,
  requireContentType,
  requireInspection,
} from "./validation.ts";

export const DEFAULT_MEDIA_PUBLICATION_BYTE_CAP = 32 * 1024 * 1024;
export const MAXIMUM_MEDIA_PUBLICATION_BYTE_CAP = 64 * 1024 * 1024;
export const MINIMUM_MEDIA_PUBLICATION_BYTE_CAP = 1024;

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_LOGICAL_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface MediaPublicationCommon {
  readonly applicationId: string;
  readonly proposalSha256: string;
  readonly approvalSha256: string;
  readonly manifestSha256: string;
  readonly mediaSha256: string;
  readonly mediaId: string;
  readonly mediaKey: string;
  readonly alias: string;
  readonly visibility: "public" | "protected";
  readonly externalActionId: string | null;
  readonly externalActionSha256: string | null;
  readonly contentType: string;
  readonly rightsConfirmed: true;
  readonly intendedUse: readonly MediaIntendedUse[];
  readonly inspection: MediaInspection;
}

export interface MediaSourcePublication extends MediaPublicationCommon {
  readonly role: "source";
  readonly kind: PreparedMediaKind;
  readonly sourceVersion: number;
}

export interface MediaDerivativePublication extends MediaPublicationCommon {
  readonly role: "derivative";
  readonly sourceMediaId: string;
  readonly derivativeKind: FixedDerivativeProfile["derivativeKind"];
  readonly profileId: string;
  readonly processingVersion: string;
  readonly format: string;
  readonly bitrateKbps: number | null;
}

export type MediaPublication =
  MediaSourcePublication | MediaDerivativePublication;

export interface BoundedMediaPublicationRequest {
  readonly publication: MediaPublication;
  readonly bytes: Uint8Array;
}

function requestError(
  code: string,
  message: string,
  status = 400,
): RuntimeError {
  return new RuntimeError(code, message, {
    status,
    publicMessage: "Provide an exact approved media publication request.",
  });
}

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value)
    throw requestError("MEDIA_HEADER_REQUIRED", `${name} is required.`);
  return value;
}

function requireSafeId(value: string, label: string): string {
  if (!SAFE_ID.test(value)) {
    throw requestError("MEDIA_ID_INVALID", `${label} is invalid.`);
  }
  return value;
}

function requireLogicalKey(value: string, label: string): string {
  if (value.length > 100 || !SAFE_LOGICAL_KEY.test(value)) {
    throw requestError(
      "MEDIA_KEY_INVALID",
      `${label} must use lowercase words separated by single hyphens.`,
    );
  }
  return value;
}

function requireHashHeader(request: Request, name: string): string {
  const value = requiredHeader(request, name);
  if (!SHA256_PATTERN.test(value)) {
    throw requestError(
      "MEDIA_HASH_INVALID",
      `${name} must be lowercase SHA-256.`,
    );
  }
  return value;
}

function requireContractHashHeader(request: Request, name: string): string {
  const value = requiredHeader(request, name);
  const match = /^sha256:([a-f0-9]{64})$/.exec(value);
  if (!match) {
    throw requestError(
      "MEDIA_CONTRACT_HASH_INVALID",
      `${name} must use the sha256:<lowercase digest> contract form.`,
    );
  }
  return match[1];
}

function optionalInteger(
  request: Request,
  name: string,
  options: { readonly positive?: boolean } = {},
): number | null {
  const value = request.headers.get(name)?.trim();
  if (!value) return null;
  if (!/^[0-9]+$/.test(value)) {
    throw requestError("MEDIA_METADATA_INVALID", `${name} must be an integer.`);
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    (options.positive === true && parsed < 1)
  ) {
    throw requestError(
      "MEDIA_METADATA_INVALID",
      `${name} is outside its accepted range.`,
    );
  }
  return parsed;
}

function requireIntendedUse(request: Request): readonly MediaIntendedUse[] {
  const values = requiredHeader(request, "x-aop-intended-use")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const unique = [...new Set(values)].sort();
  if (
    unique.length === 0 ||
    unique.some((value) => !MEDIA_INTENDED_USES.includes(value as never))
  ) {
    throw requestError(
      "MEDIA_INTENDED_USE_INVALID",
      "Media intended use is invalid.",
    );
  }
  return unique as MediaIntendedUse[];
}

function requireFormat(value: string, label: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value)) {
    throw requestError("MEDIA_METADATA_INVALID", `${label} is invalid.`);
  }
  return value.toLowerCase();
}

function requestContentType(request: Request): string {
  try {
    return requireContentType(
      requiredHeader(request, "content-type").split(";", 1)[0],
    );
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw requestError(
      "MEDIA_CONTENT_TYPE_INVALID",
      "Media content type is not in the publication allowlist.",
      415,
    );
  }
}

function requestInspection(request: Request): MediaInspection {
  try {
    return requireInspection({
      durationMs: optionalInteger(request, "x-aop-duration-ms"),
      channels: optionalInteger(request, "x-aop-channels"),
      sampleRate: optionalInteger(request, "x-aop-sample-rate"),
      format: request.headers.get("x-aop-format")?.trim() || null,
      bitrateKbps: optionalInteger(request, "x-aop-bitrate-kbps"),
    });
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw requestError(
      "MEDIA_METADATA_INVALID",
      "Media inspection metadata is invalid.",
    );
  }
}

function validateKindContentType(kind: PreparedMediaKind, contentType: string) {
  const matches =
    (kind === "audio" && contentType.startsWith("audio/")) ||
    (kind === "image" && contentType.startsWith("image/")) ||
    (kind === "video" && contentType.startsWith("video/")) ||
    (kind === "document" &&
      (contentType.startsWith("text/") ||
        contentType.startsWith("application/"))) ||
    kind === "other";
  if (!matches) {
    throw requestError(
      "MEDIA_CONTENT_TYPE_MISMATCH",
      "Media kind and content type do not match.",
      415,
    );
  }
}

export function resolveMediaPublicationByteCap(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_MEDIA_PUBLICATION_BYTE_CAP;
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[0-9]+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MINIMUM_MEDIA_PUBLICATION_BYTE_CAP ||
    parsed > MAXIMUM_MEDIA_PUBLICATION_BYTE_CAP
  ) {
    throw new RuntimeError(
      "MEDIA_PUBLICATION_LIMIT_INVALID",
      "The configured media publication byte cap is invalid.",
      {
        status: 503,
        publicMessage:
          "Media publication is unavailable until its byte limit is configured.",
      },
    );
  }
  return parsed;
}

async function readBoundedBytes(
  request: Request,
  byteCap: number,
): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength && !/^[0-9]+$/.test(declaredLength)) {
    throw requestError("MEDIA_LENGTH_INVALID", "Content-Length is invalid.");
  }
  const expectedLength = declaredLength ? Number(declaredLength) : null;
  if (expectedLength !== null && expectedLength > byteCap) {
    throw requestError(
      "MEDIA_TOO_LARGE",
      "Media body exceeds the configured byte cap.",
      413,
    );
  }
  if (!request.body) {
    throw requestError("MEDIA_BODY_REQUIRED", "A media body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > byteCap) {
        await reader.cancel();
        throw requestError(
          "MEDIA_TOO_LARGE",
          "Media body exceeds the configured byte cap.",
          413,
        );
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw requestError("MEDIA_BODY_INVALID", "Media body could not be read.");
  }
  if (length === 0 || (expectedLength !== null && expectedLength !== length)) {
    throw requestError(
      "MEDIA_LENGTH_INVALID",
      "Media body length does not match Content-Length.",
    );
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readMediaPublicationRequest(
  request: Request,
  byteCap: number,
): Promise<BoundedMediaPublicationRequest> {
  if (requiredHeader(request, "x-aop-rights-confirmed") !== "true") {
    throw requestError(
      "MEDIA_RIGHTS_REQUIRED",
      "Explicit media rights confirmation is required.",
    );
  }
  const role = requiredHeader(request, "x-aop-media-role");
  if (role !== "source" && role !== "derivative") {
    throw requestError("MEDIA_ROLE_INVALID", "Media role is invalid.");
  }
  const alias = requiredHeader(request, "x-aop-media-alias");
  if (!MEDIA_ALIAS_PATTERN.test(alias)) {
    throw requestError("MEDIA_ALIAS_INVALID", "Media alias is invalid.");
  }
  const contentType = requestContentType(request);
  const intendedUse = requireIntendedUse(request);
  const visibility = (() => {
    const value = requiredHeader(request, "x-aop-media-visibility");
    if (value !== "public" && value !== "protected") {
      throw requestError(
        "MEDIA_VISIBILITY_INVALID",
        "Media visibility is invalid.",
      );
    }
    return value;
  })();
  const hasExternalActionId = request.headers.has("x-aop-external-action-id");
  const hasExternalActionSha256 = request.headers.has(
    "x-aop-external-action-sha256",
  );
  if (
    visibility === "protected" &&
    (hasExternalActionId || hasExternalActionSha256)
  ) {
    throw requestError(
      "MEDIA_EXTERNAL_ACTION_FORBIDDEN",
      "Protected media publication accepts no external-action authority.",
    );
  }
  const externalActionId =
    visibility === "public"
      ? requireLogicalKey(
          requiredHeader(request, "x-aop-external-action-id"),
          "External action ID",
        )
      : null;
  const externalActionSha256 =
    visibility === "public"
      ? `sha256:${requireContractHashHeader(
          request,
          "x-aop-external-action-sha256",
        )}`
      : null;
  const common: MediaPublicationCommon = {
    applicationId: requireSafeId(
      requiredHeader(request, "x-aop-application-id"),
      "Setup application ID",
    ),
    proposalSha256: requireContractHashHeader(request, "x-aop-proposal-sha256"),
    approvalSha256: requireContractHashHeader(request, "x-aop-approval-sha256"),
    manifestSha256: requireContractHashHeader(request, "x-aop-manifest-sha256"),
    mediaSha256: requireHashHeader(request, "x-aop-media-sha256"),
    mediaId: requireSafeId(
      requiredHeader(request, "x-aop-media-id"),
      "Media ID",
    ),
    mediaKey: requireLogicalKey(
      requiredHeader(request, "x-aop-media-key"),
      "Media key",
    ),
    alias,
    visibility,
    externalActionId,
    externalActionSha256,
    contentType,
    rightsConfirmed: true,
    intendedUse,
    inspection: requestInspection(request),
  };

  let publication: MediaPublication;
  if (role === "source") {
    const kind = requiredHeader(request, "x-aop-media-kind");
    if (!MEDIA_KINDS.includes(kind as never)) {
      throw requestError("MEDIA_KIND_INVALID", "Media kind is invalid.");
    }
    validateKindContentType(kind as PreparedMediaKind, contentType);
    publication = {
      ...common,
      role,
      kind: kind as PreparedMediaKind,
      sourceVersion:
        optionalInteger(request, "x-aop-source-version", { positive: true }) ??
        1,
    };
  } else {
    const profileId = requiredHeader(request, "x-aop-processing-profile");
    let profile: FixedDerivativeProfile;
    try {
      profile = requireDerivativeProfile(profileId);
    } catch {
      throw requestError(
        "MEDIA_PROFILE_INVALID",
        "Derivative profile is invalid.",
      );
    }
    const processingVersion = requiredHeader(
      request,
      "x-aop-processing-version",
    );
    const derivativeKind = requiredHeader(request, "x-aop-derivative-kind");
    const format = requireFormat(
      requiredHeader(request, "x-aop-format"),
      "Media format",
    );
    const bitrateKbps = optionalInteger(request, "x-aop-bitrate-kbps");
    if (
      processingVersion !== profile.version ||
      derivativeKind !== profile.derivativeKind ||
      contentType !== profile.contentType ||
      format !== profile.format ||
      bitrateKbps !== profile.bitrateKbps ||
      !profile.intendedUses.some((use) => intendedUse.includes(use))
    ) {
      throw requestError(
        "MEDIA_PROFILE_MISMATCH",
        "Derivative metadata does not match its fixed profile.",
      );
    }
    publication = {
      ...common,
      role,
      sourceMediaId: requireSafeId(
        requiredHeader(request, "x-aop-source-media-id"),
        "Source media ID",
      ),
      derivativeKind: profile.derivativeKind,
      profileId: profile.id,
      processingVersion: profile.version,
      format: profile.format,
      bitrateKbps: profile.bitrateKbps,
    };
  }
  return {
    publication,
    bytes: await readBoundedBytes(request, byteCap),
  };
}
