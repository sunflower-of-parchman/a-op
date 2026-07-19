import type { FixedDerivativeProfile, MediaIntendedUse } from "./types.ts";

function intendedUses(
  ...values: MediaIntendedUse[]
): readonly MediaIntendedUse[] {
  return Object.freeze(values);
}

const AUDIO_SOURCE_CONTENT_TYPES = Object.freeze([
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
]);
const VIDEO_SOURCE_CONTENT_TYPES = Object.freeze(["video/mp4", "video/webm"]);
const IMAGE_SOURCE_CONTENT_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const AUDIO_STREAMING_MP3_192_V1: FixedDerivativeProfile = Object.freeze({
  id: "audio-streaming-mp3-192",
  version: "1",
  sourceKind: "audio",
  sourceContentTypes: AUDIO_SOURCE_CONTENT_TYPES,
  intendedUses: intendedUses("streaming", "course"),
  processor: "ffmpeg",
  derivativeKind: "streaming",
  outputExtension: "mp3",
  contentType: "audio/mpeg",
  format: "mp3",
  bitrateKbps: 192,
  ffmpegArguments: Object.freeze([
    "-map_metadata",
    "-1",
    "-vn",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    "-write_xing",
    "0",
    "-id3v2_version",
    "0",
    "-fflags",
    "+bitexact",
    "-flags:a",
    "+bitexact",
  ]),
});

const AUDIO_DOWNLOAD_FLAC_V1: FixedDerivativeProfile = Object.freeze({
  id: "audio-download-flac",
  version: "1",
  sourceKind: "audio",
  sourceContentTypes: AUDIO_SOURCE_CONTENT_TYPES,
  intendedUses: intendedUses("download", "course", "protected-delivery"),
  processor: "ffmpeg",
  derivativeKind: "download",
  outputExtension: "flac",
  contentType: "audio/flac",
  format: "flac",
  bitrateKbps: null,
  ffmpegArguments: Object.freeze([
    "-map_metadata",
    "-1",
    "-vn",
    "-c:a",
    "flac",
    "-compression_level",
    "8",
    "-fflags",
    "+bitexact",
    "-flags:a",
    "+bitexact",
  ]),
});

const VIDEO_STREAMING_MP4_H264_720_V1: FixedDerivativeProfile = Object.freeze({
  id: "video-streaming-mp4-h264-720",
  version: "1",
  sourceKind: "video",
  sourceContentTypes: VIDEO_SOURCE_CONTENT_TYPES,
  intendedUses: intendedUses("video", "streaming", "course"),
  processor: "ffmpeg",
  derivativeKind: "streaming",
  outputExtension: "mp4",
  contentType: "video/mp4",
  format: "mp4",
  bitrateKbps: null,
  ffmpegArguments: Object.freeze([
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "scale=min(1280\\,iw):-2:flags=lanczos,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-threads",
    "1",
    "-movflags",
    "+faststart",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
  ]),
});

const VIDEO_DOWNLOAD_MP4_H264_1080_V1: FixedDerivativeProfile = Object.freeze({
  id: "video-download-mp4-h264-1080",
  version: "1",
  sourceKind: "video",
  sourceContentTypes: VIDEO_SOURCE_CONTENT_TYPES,
  intendedUses: intendedUses("download", "course", "protected-delivery"),
  processor: "ffmpeg",
  derivativeKind: "download",
  outputExtension: "mp4",
  contentType: "video/mp4",
  format: "mp4",
  bitrateKbps: null,
  ffmpegArguments: Object.freeze([
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "scale=min(1920\\,iw):-2:flags=lanczos,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-threads",
    "1",
    "-movflags",
    "+faststart",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
  ]),
});

const VIDEO_POSTER_WEBP_1280_V1: FixedDerivativeProfile = Object.freeze({
  id: "video-poster-webp-1280",
  version: "1",
  sourceKind: "video",
  sourceContentTypes: VIDEO_SOURCE_CONTENT_TYPES,
  intendedUses: intendedUses("video", "course", "public-site"),
  processor: "ffmpeg",
  derivativeKind: "poster",
  outputExtension: "webp",
  contentType: "image/webp",
  format: "webp",
  bitrateKbps: null,
  ffmpegArguments: Object.freeze([
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-map",
    "0:v:0",
    "-frames:v",
    "1",
    "-vf",
    "scale=min(1280\\,iw):-2:flags=lanczos,format=yuv420p",
    "-c:v",
    "libwebp",
    "-lossless",
    "1",
    "-compression_level",
    "6",
    "-threads",
    "1",
    "-fflags",
    "+bitexact",
  ]),
});

const VIDEO_CAPTIONS_WEBVTT_V1: FixedDerivativeProfile = Object.freeze({
  id: "video-captions-webvtt",
  version: "1",
  sourceKind: "video",
  sourceContentTypes: VIDEO_SOURCE_CONTENT_TYPES,
  intendedUses: intendedUses("video", "course"),
  processor: "ffmpeg",
  derivativeKind: "transcript",
  outputExtension: "vtt",
  contentType: "text/vtt",
  format: "webvtt",
  bitrateKbps: null,
  ffmpegArguments: Object.freeze([
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-map",
    "0:s:0",
    "-c:s",
    "webvtt",
    "-f",
    "webvtt",
    "-fflags",
    "+bitexact",
  ]),
});

const IMAGE_COURSE_WEBP_1600_V1: FixedDerivativeProfile = Object.freeze({
  id: "image-course-webp-1600",
  version: "1",
  sourceKind: "image",
  sourceContentTypes: IMAGE_SOURCE_CONTENT_TYPES,
  intendedUses: intendedUses("course", "artwork", "public-site"),
  processor: "ffmpeg",
  derivativeKind: "thumbnail",
  outputExtension: "webp",
  contentType: "image/webp",
  format: "webp",
  bitrateKbps: null,
  ffmpegArguments: Object.freeze([
    "-map_metadata",
    "-1",
    "-map",
    "0:v:0",
    "-frames:v",
    "1",
    "-vf",
    "scale=min(1600\\,iw):-2:flags=lanczos,format=yuv420p",
    "-c:v",
    "libwebp",
    "-lossless",
    "1",
    "-compression_level",
    "6",
    "-threads",
    "1",
    "-fflags",
    "+bitexact",
  ]),
});

const DOCUMENT_DOWNLOAD_PDF_COPY_V1: FixedDerivativeProfile = Object.freeze({
  id: "document-download-pdf-copy",
  version: "1",
  sourceKind: "document",
  sourceContentTypes: Object.freeze(["application/pdf"]),
  intendedUses: intendedUses(
    "download",
    "course",
    "license-document",
    "protected-delivery",
  ),
  processor: "copy",
  derivativeKind: "download",
  outputExtension: "pdf",
  contentType: "application/pdf",
  format: "pdf",
  bitrateKbps: null,
  ffmpegArguments: Object.freeze([]),
});

export const FIXED_DERIVATIVE_PROFILES = Object.freeze([
  AUDIO_STREAMING_MP3_192_V1,
  AUDIO_DOWNLOAD_FLAC_V1,
  VIDEO_STREAMING_MP4_H264_720_V1,
  VIDEO_DOWNLOAD_MP4_H264_1080_V1,
  VIDEO_POSTER_WEBP_1280_V1,
  VIDEO_CAPTIONS_WEBVTT_V1,
  IMAGE_COURSE_WEBP_1600_V1,
  DOCUMENT_DOWNLOAD_PDF_COPY_V1,
]);

const BY_ID = new Map(
  FIXED_DERIVATIVE_PROFILES.map((profile) => [profile.id, profile]),
);

export function requireDerivativeProfile(
  profileId: string,
): FixedDerivativeProfile {
  const profile = BY_ID.get(profileId);
  if (!profile) {
    throw new TypeError(
      `Derivative profile must be one of: ${FIXED_DERIVATIVE_PROFILES.map(({ id }) => id).join(", ")}.`,
    );
  }
  return profile;
}

export function buildFfmpegArgv(
  profile: FixedDerivativeProfile,
  inputPath: string,
  outputPath: string,
): readonly string[] {
  if (!inputPath || !outputPath) {
    throw new TypeError("ffmpeg input and output paths are required.");
  }
  if (profile.processor !== "ffmpeg") {
    throw new TypeError("This derivative profile does not use ffmpeg.");
  }
  return Object.freeze([
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    ...profile.ffmpegArguments,
    outputPath,
  ]);
}
