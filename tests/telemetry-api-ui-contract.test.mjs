import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public telemetry routes use exact browser events, server UUID cookies, and live privacy checks", async () => {
  const [eventRoute, consentRoute, validation, privacy, writer] =
    await Promise.all([
      source("../app/api/telemetry/events/route.ts"),
      source("../app/api/telemetry/consent/route.ts"),
      source("../lib/telemetry/validation.ts"),
      source("../lib/telemetry/privacy.ts"),
      source("../db/telemetry-write.ts"),
    ]);
  assert.match(eventRoute, /validatePublicTelemetryEvent/);
  assert.match(eventRoute, /crypto\.randomUUID\(\)/);
  assert.match(eventRoute, /readTelemetryPrivacySignal/);
  assert.match(eventRoute, /readTelemetryConsent/);
  assert.match(eventRoute, /resolveApplicationIdentity/);
  assert.match(consentRoute, /configuration\.collecting/);
  assert.match(consentRoute, /clearSessionCookie/);
  assert.match(privacy, /sec-gpc/);
  assert.match(privacy, /dnt/);
  assert.match(privacy, /HttpOnly/);
  assert.match(validation, /PUBLIC_TELEMETRY_EVENT_NAMES/);
  assert.match(validation, /unsupported fields/);
  assert.match(writer, /browserObserved/);
  assert.match(writer, /publication_state = 'published'/);
  assert.doesNotMatch(
    eventRoute,
    /license-issued|membership-activated|download-delivered/,
  );
});

test("telemetry persistence has no free-form payload and protects aggregation before retention", async () => {
  const [types, writer, reader] = await Promise.all([
    source("../lib/telemetry/types.ts"),
    source("../db/telemetry-write.ts"),
    source("../db/telemetry-read.ts"),
  ]);
  assert.match(types, /playedTimeMs\?: number/);
  assert.match(types, /Never persisted/);
  assert.doesNotMatch(
    types,
    /properties|payload|metadata|detailsJson|url|searchQuery/,
  );
  assert.match(writer, /TELEMETRY_AGGREGATION_REQUIRED/);
  assert.match(writer, /COUNT\(DISTINCT event\.session_id\)/);
  assert.match(writer, /COUNT\(DISTINCT event\.user_id\)/);
  assert.match(
    writer,
    /ON CONFLICT\(day_utc, event_name, resource_type, resource_id\)/,
  );
  assert.match(writer, /prepareConditionalAuditEvent/);
  assert.match(reader, /activeOwnerCondition/);
  assert.doesNotMatch(reader, /SELECT \*/);
});

test("the visible first-party consent and owner views use open responsive layouts without assets", async () => {
  const [boundary, consent, admin, styles, player] = await Promise.all([
    source("../components/telemetry/TelemetryBoundary.tsx"),
    source("../components/telemetry/TelemetryConsentControl.tsx"),
    source("../components/telemetry/TelemetryAdminWorkspace.tsx"),
    source("../components/telemetry/Telemetry.module.css"),
    source("../components/player/PlayerProvider.tsx"),
  ]);
  const combined = `${boundary}\n${consent}\n${admin}\n${styles}`;
  assert.match(consent, /Audience privacy/);
  assert.match(consent, /Global Privacy Control/);
  assert.match(consent, /Do Not Track/);
  assert.match(consent, /payment information/);
  assert.match(admin, /no free-form visitor/);
  assert.match(admin, /Apply retention safely/);
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /(?:background-)?image\s*:|url\(|gradient\(/i);
  assert.doesNotMatch(
    combined,
    /type=["']file["']|FileReader|FormData\(.*File/i,
  );
  assert.match(
    player,
    /telemetryConfiguration\.meaningfulListenSeconds \* 1000/,
  );
  assert.match(player, /eventName: "meaningful-listen"/);
  assert.match(player, /playedTimeMs: transition\.observation\.playedTimeMs/);
});

test("representative public surfaces emit one exact consent-gated page view per mounted resource", async () => {
  const [
    emitter,
    musicIndex,
    musicDetail,
    course,
    video,
    licensing,
    commerce,
    contact,
    update,
  ] = await Promise.all([
    source("../components/telemetry/TelemetryPageView.tsx"),
    source("../components/music/MusicIndex.tsx"),
    source("../components/music/MusicDetail.tsx"),
    source("../components/courses/CourseDetail.tsx"),
    source("../components/video/VideoDetail.tsx"),
    source("../components/licensing/LicensingCatalog.tsx"),
    source("../components/commerce/CommerceCatalog.tsx"),
    source("../components/contact/ContactForm.tsx"),
    source("../components/updates/UpdateDetail.tsx"),
  ]);
  assert.match(emitter, /recordedKey/);
  assert.match(emitter, /if \(!configuration\.collecting\) return/);
  assert.ok(
    emitter.indexOf("if (!configuration.collecting) return") <
      emitter.indexOf("recordedKey.current = key"),
  );
  assert.match(
    emitter,
    /void record\(\{ eventName, resourceType, resourceId \}\)/,
  );
  assert.doesNotMatch(
    emitter,
    /pathname|searchParams|location|document|window/,
  );
  assert.match(musicIndex, /eventName="music-view"[\s\S]*resourceId="site"/);
  assert.match(musicDetail, /"release-view" : "track-view"/);
  assert.match(musicDetail, /resourceId=\{data\.id\}/);
  assert.match(
    course,
    /eventName="course-view"[\s\S]*resourceId=\{course\.id\}/,
  );
  assert.match(video, /eventName="video-view"[\s\S]*resourceId=\{video\.id\}/);
  assert.match(
    licensing,
    /eventName="licensing-view"[\s\S]*resourceId=\{offer\.id\}/,
  );
  assert.match(
    commerce,
    /eventName="membership-view"[\s\S]*resourceId=\{product\.id\}/,
  );
  assert.match(
    contact,
    /eventName="contact-view"[\s\S]*resourceId=\{form\.id\}/,
  );
  assert.match(
    update,
    /eventName="update-view"[\s\S]*resourceId=\{update\.id\}/,
  );
});

test("video playback telemetry waits for the player or consented embed to load", async () => {
  const [hosted, external, detail] = await Promise.all([
    source("../components/video/HostedVideoPlayer.tsx"),
    source("../components/video/ExternalVideoConsent.tsx"),
    source("../components/video/VideoDetail.tsx"),
  ]);

  assert.match(hosted, /onPlay=\{\(\) =>/);
  assert.match(
    hosted,
    /if \(playbackRecorded\.current \|\| !configuration\.collecting\) return/,
  );
  assert.match(hosted, /eventName: "video-playback-start"/);
  assert.match(hosted, /resourceId: videoId/);
  assert.doesNotMatch(hosted, /useEffect/);

  assert.match(external, /setLocalConsent\(true\)/);
  assert.match(external, /onConsent\?\.\(\)/);
  assert.match(external, /<iframe[\s\S]*onLoad=\{\(\) =>/);
  assert.match(external, /eventName: "video-playback-start"/);
  assert.match(external, /resourceId: videoId/);
  assert.doesNotMatch(external, /useEffect/);

  assert.match(detail, /<ExternalVideoConsent[\s\S]*videoId=\{video\.id\}/);
  assert.match(detail, /<HostedVideoPlayer[\s\S]*videoId=\{video\.id\}/);
});
