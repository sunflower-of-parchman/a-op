import type {
  ExternalVideoProvider,
  VideoCredit,
  VideoDraftInput,
  VideoTranscriptInput,
} from "./types.ts";

export interface VideoValidationIssue {
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

export type VideoValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly VideoValidationIssue[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const PROVIDERS = new Set<ExternalVideoProvider>(["youtube", "vimeo", "other"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function normalizedText(
  value: unknown,
  field: string,
  maximum: number,
  issues: VideoValidationIssue[],
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") {
    issues.push({
      code: "video-text-required",
      field,
      message: `${field} must be text.`,
    });
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!allowEmpty && normalized.length === 0) {
    issues.push({
      code: "video-text-required",
      field,
      message: `${field} is required.`,
    });
    return null;
  }
  if (normalized.length > maximum) {
    issues.push({
      code: "video-text-too-long",
      field,
      message: `${field} must contain at most ${maximum} characters.`,
    });
    return null;
  }
  return normalized;
}

function nullableId(
  value: unknown,
  field: string,
  issues: VideoValidationIssue[],
): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    issues.push({
      code: "video-media-id-invalid",
      field,
      message: `${field} must be a safe media identifier or null.`,
    });
    return null;
  }
  return value;
}

function externalUrl(
  value: unknown,
  provider: ExternalVideoProvider | null,
  issues: VideoValidationIssue[],
): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2_048) {
    issues.push({
      code: "video-external-url-invalid",
      field: "externalEmbedUrl",
      message: "External embed URL must be a supported HTTPS URL.",
    });
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push({
      code: "video-external-url-invalid",
      field: "externalEmbedUrl",
      message: "External embed URL must be a supported HTTPS URL.",
    });
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  const validBase =
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    (url.port === "" || url.port === "443");
  const providerValid =
    provider === "youtube"
      ? (hostname === "www.youtube-nocookie.com" ||
          hostname === "www.youtube.com") &&
        url.pathname.startsWith("/embed/")
      : provider === "vimeo"
        ? hostname === "player.vimeo.com" && url.pathname.startsWith("/video/")
        : provider === "other";
  if (!validBase || !providerValid) {
    issues.push({
      code: "video-external-url-invalid",
      field: "externalEmbedUrl",
      message: "External embed URL must match the selected HTTPS provider.",
    });
    return null;
  }
  return url.toString();
}

function validateCredits(
  value: unknown,
  issues: VideoValidationIssue[],
): readonly VideoCredit[] {
  if (!Array.isArray(value) || value.length > 64) {
    issues.push({
      code: "video-credits-invalid",
      field: "credits",
      message: "Credits must be a list containing at most 64 entries.",
    });
    return [];
  }
  const credits: VideoCredit[] = [];
  value.forEach((candidate, index) => {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["name", "role", "details"])
    ) {
      issues.push({
        code: "video-credit-invalid",
        field: `credits.${index}`,
        message: "Each credit must contain name, role, and details.",
      });
      return;
    }
    const name = normalizedText(
      candidate.name,
      `credits.${index}.name`,
      160,
      issues,
    );
    const role = normalizedText(
      candidate.role,
      `credits.${index}.role`,
      120,
      issues,
    );
    const details = normalizedText(
      candidate.details,
      `credits.${index}.details`,
      500,
      issues,
      true,
    );
    if (name !== null && role !== null && details !== null) {
      credits.push({ name, role, details });
    }
  });
  return Object.freeze(credits);
}

function validateTranscripts(
  value: unknown,
  issues: VideoValidationIssue[],
): readonly VideoTranscriptInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    issues.push({
      code: "video-transcripts-invalid",
      field: "transcripts",
      message: "Provide between one and 16 transcripts.",
    });
    return [];
  }
  const languages = new Set<string>();
  const transcripts: VideoTranscriptInput[] = [];
  value.forEach((candidate, index) => {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, [
        "language",
        "transcriptText",
        "captionsDerivativeId",
      ])
    ) {
      issues.push({
        code: "video-transcript-invalid",
        field: `transcripts.${index}`,
        message:
          "Each transcript must contain language, transcriptText, and captionsDerivativeId.",
      });
      return;
    }
    const rawLanguage = normalizedText(
      candidate.language,
      `transcripts.${index}.language`,
      16,
      issues,
    );
    const language = rawLanguage?.toLowerCase() ?? null;
    if (language !== null && !LANGUAGE.test(language)) {
      issues.push({
        code: "video-transcript-language-invalid",
        field: `transcripts.${index}.language`,
        message: "Transcript language must be a normalized language tag.",
      });
    }
    if (language !== null && languages.has(language)) {
      issues.push({
        code: "video-transcript-language-duplicate",
        field: `transcripts.${index}.language`,
        message: "Each transcript language can appear once per revision.",
      });
    }
    const transcriptText = normalizedText(
      candidate.transcriptText,
      `transcripts.${index}.transcriptText`,
      50_000,
      issues,
    );
    const captionsDerivativeId = nullableId(
      candidate.captionsDerivativeId,
      `transcripts.${index}.captionsDerivativeId`,
      issues,
    );
    if (
      language !== null &&
      LANGUAGE.test(language) &&
      !languages.has(language) &&
      transcriptText !== null
    ) {
      languages.add(language);
      transcripts.push({ language, transcriptText, captionsDerivativeId });
    }
  });
  return Object.freeze(transcripts);
}

export function validateVideoDraftInput(
  value: unknown,
): VideoValidationResult<VideoDraftInput> {
  const issues: VideoValidationIssue[] = [];
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "slug",
      "title",
      "summary",
      "artistContext",
      "credits",
      "deliveryKind",
      "posterDerivativeId",
      "hostedDerivativeId",
      "externalProvider",
      "externalEmbedUrl",
      "transcripts",
    ])
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "video-input-invalid",
          field: "video",
          message: "Video input must contain only the supported fields.",
        },
      ],
    };
  }

  const slug = normalizedText(value.slug, "slug", 80, issues);
  if (slug !== null && !SLUG.test(slug)) {
    issues.push({
      code: "video-slug-invalid",
      field: "slug",
      message: "Video slug must be a normalized route segment.",
    });
  }
  const title = normalizedText(value.title, "title", 160, issues);
  const summary = normalizedText(value.summary, "summary", 2_000, issues, true);
  const artistContext = normalizedText(
    value.artistContext,
    "artistContext",
    10_000,
    issues,
  );
  const credits = validateCredits(value.credits, issues);
  const deliveryKind =
    value.deliveryKind === "artist_hosted" || value.deliveryKind === "external"
      ? value.deliveryKind
      : null;
  if (deliveryKind === null) {
    issues.push({
      code: "video-delivery-kind-invalid",
      field: "deliveryKind",
      message: "Video delivery must be artist_hosted or external.",
    });
  }
  const posterDerivativeId = nullableId(
    value.posterDerivativeId,
    "posterDerivativeId",
    issues,
  );
  const hostedDerivativeId = nullableId(
    value.hostedDerivativeId,
    "hostedDerivativeId",
    issues,
  );
  const externalProvider =
    value.externalProvider === null
      ? null
      : typeof value.externalProvider === "string" &&
          PROVIDERS.has(value.externalProvider as ExternalVideoProvider)
        ? (value.externalProvider as ExternalVideoProvider)
        : null;
  if (value.externalProvider !== null && externalProvider === null) {
    issues.push({
      code: "video-external-provider-invalid",
      field: "externalProvider",
      message: "External provider must be youtube, vimeo, other, or null.",
    });
  }
  const externalEmbedUrl = externalUrl(
    value.externalEmbedUrl,
    externalProvider,
    issues,
  );
  const transcripts = validateTranscripts(value.transcripts, issues);

  if (
    deliveryKind === "artist_hosted" &&
    (hostedDerivativeId === null ||
      value.externalProvider !== null ||
      value.externalEmbedUrl !== null)
  ) {
    issues.push({
      code: "video-hosted-delivery-invalid",
      field: "deliveryKind",
      message:
        "Artist-hosted video requires one hosted derivative and no external source.",
    });
  }
  if (
    deliveryKind === "external" &&
    (value.hostedDerivativeId !== null ||
      externalProvider === null ||
      externalEmbedUrl === null)
  ) {
    issues.push({
      code: "video-external-delivery-invalid",
      field: "deliveryKind",
      message:
        "External video requires a provider and supported HTTPS embed URL only.",
    });
  }

  if (
    issues.length > 0 ||
    slug === null ||
    title === null ||
    summary === null ||
    artistContext === null ||
    deliveryKind === null
  ) {
    return { ok: false, issues: Object.freeze(issues) };
  }

  return {
    ok: true,
    value: Object.freeze({
      slug,
      title,
      summary,
      artistContext,
      credits,
      deliveryKind,
      posterDerivativeId,
      hostedDerivativeId,
      externalProvider,
      externalEmbedUrl,
      transcripts,
    }),
  };
}
