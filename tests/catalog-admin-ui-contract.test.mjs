import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  layout: "../app/admin/layout.tsx",
  overviewPage: "../app/admin/music/page.tsx",
  trackPage: "../app/admin/music/tracks/[slug]/page.tsx",
  releasePage: "../app/admin/music/releases/[slug]/page.tsx",
  collectionPage: "../app/admin/music/collections/[slug]/page.tsx",
  overview: "../components/admin/music/CatalogOverview.tsx",
  track: "../components/admin/music/TrackWorkspace.tsx",
  release: "../components/admin/music/ReleaseWorkspace.tsx",
  collection: "../components/admin/music/CollectionWorkspace.tsx",
  fields: "../components/admin/music/CatalogFormFields.tsx",
  preview: "../components/admin/music/CatalogDraftPreview.tsx",
  sequence: "../components/admin/music/OrderedTrackEditor.tsx",
  mutation: "../components/admin/music/useCatalogMutation.ts",
  styles: "../components/admin/music/CatalogAdmin.module.css",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Music is a core scoped administration destination", async () => {
  const [layout, page, overview] = await Promise.all([
    source(files.layout),
    source(files.overviewPage),
    source(files.overview),
  ]);

  assert.match(layout, /\{ href: "\/admin\/music", label: "Music" \}/);
  assert.match(
    page,
    /readActiveEditorPermissions\(env\.DB, identity\.userId\)/,
  );
  assert.match(page, /permissionKey === "catalog\.write"/);
  assert.match(page, /permissionKey === "media\.write"/);
  assert.match(
    page,
    /readAdminCatalogIndex\([\s\S]*?env\.DB,[\s\S]*?catalogScopes,[\s\S]*?mediaScopes/,
  );
  assert.match(
    page,
    /catalogScopes === null \|\| catalogScopes\.includes\("\*"\)/,
  );
  assert.match(overview, /href=\{`\/admin\/music\/\$\{plural\}\/new`\}/);
  assert.match(overview, /No track drafts have been created\./);
  assert.match(overview, /No release drafts have been created\./);
  assert.match(overview, /No collection drafts have been created\./);
  assert.match(overview, /Media readiness/);
  assert.match(overview, /source\.status/);
  assert.match(overview, /derivative\.approvalState/);
});

test("catalog editor pages enforce slug scope and read purpose-built draft data", async () => {
  const routes = [
    {
      source: await source(files.trackPage),
      reader: "readAdminTrackDraft",
      workspace: "TrackWorkspace",
      needsTracks: false,
    },
    {
      source: await source(files.releasePage),
      reader: "readAdminReleaseDraft",
      workspace: "ReleaseWorkspace",
      needsTracks: true,
    },
    {
      source: await source(files.collectionPage),
      reader: "readAdminCollectionDraft",
      workspace: "CollectionWorkspace",
      needsTracks: true,
    },
  ];

  for (const route of routes) {
    assert.match(route.source, /export const dynamic = "force-dynamic"/);
    assert.match(
      route.source,
      /hasEditorPermission\(env\.DB, identity\.userId/,
    );
    assert.match(route.source, /permissionKey: "catalog\.write"/);
    assert.match(route.source, /scopeId: slug === "new" \? "\*" : slug/);
    assert.match(
      route.source,
      new RegExp(`${route.reader}\\(env\\.DB, slug\\)`),
    );
    assert.match(route.source, /readAdminMediaOptions\(env\.DB\)/);
    assert.match(route.source, /readAdminCatalogIndex\(env\.DB, \[\]/);
    assert.match(route.source, /canPublish=\{owner\}/);
    assert.match(route.source, new RegExp(`<${route.workspace}`));
    assert.match(route.source, /version: 0/);
    assert.match(route.source, /created: false/);
    if (route.needsTracks) {
      assert.match(route.source, /readAdminTrackOptions\(env\.DB\)/);
    }
  }
});

test("client workspaces use exact catalog mutation envelopes and stable retry keys", async () => {
  const [track, release, collection, mutation] = await Promise.all([
    source(files.track),
    source(files.release),
    source(files.collection),
    source(files.mutation),
  ]);

  const workspaces = [
    [track, "tracks", "track"],
    [release, "releases", "release"],
    [collection, "collections", "collection"],
  ];
  for (const [workspace, plural, singular] of workspaces) {
    assert.match(
      workspace,
      new RegExp(`\\/api\\/admin\\/music\\/${plural}\\/\\$\\{draft\\.slug\\}`),
    );
    assert.match(workspace, /expectedVersion: version/);
    assert.match(workspace, new RegExp(`${singular}: \\{`));
    assert.match(workspace, /\$\{draft\.slug\}\/\$\{action\}/);
    assert.match(workspace, /"POST",\s*\{ expectedVersion: version \}/);
    assert.match(workspace, /disabled=\{working \|\| !created \|\| dirty\}/);
    assert.match(workspace, /Save this draft before changing publication\./);
  }

  assert.match(
    mutation,
    /fingerprint = `\$\{method\}:\$\{url\}:\$\{serializedBody\}`/,
  );
  assert.match(mutation, /pending\?\.fingerprint === fingerprint/);
  assert.match(mutation, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(mutation, /"idempotency-key": operation\.idempotencyKey/);
  assert.match(
    mutation,
    /if \(response\.status < 500\) pendingOperation\.current = null/,
  );
});

test("track sequencing and credits remain explicitly ordered and keyboard operable", async () => {
  const [sequence, fields, release, collection] = await Promise.all([
    source(files.sequence),
    source(files.fields),
    source(files.release),
    source(files.collection),
  ]);

  assert.match(sequence, /Track sequence/);
  assert.match(sequence, /Move up/);
  assert.match(sequence, /Move down/);
  assert.match(sequence, /Remove/);
  assert.match(sequence, /discNumber/);
  assert.match(sequence, /trackNumber/);
  assert.match(sequence, /disabled=\{index === 0\}/);
  assert.match(fields, /Credits are published in this order\./);
  assert.match(fields, /Add credit/);
  assert.match(fields, /Remove credit/);
  assert.match(fields, /Move up/);
  assert.match(fields, /Move down/);
  assert.match(release, /tracks: draft\.tracks/);
  assert.match(collection, /trackIds: draft\.trackIds/);
});

test("each catalog workspace renders a live private draft preview", async () => {
  const [track, release, collection, preview] = await Promise.all([
    source(files.track),
    source(files.release),
    source(files.collection),
    source(files.preview),
  ]);

  for (const workspace of [track, release, collection]) {
    assert.match(workspace, /<CatalogDraftPreview/);
    assert.match(workspace, /credits=\{draft\.credits\}/);
    assert.match(workspace, /description=\{draft\.description\}/);
    assert.match(workspace, /tags=\{parseCatalogTags\(draft\.tagsText\)\}/);
    assert.match(workspace, /title=\{draft\.title\}/);
    assert.match(workspace, /catalogAccessModeLabel\(draft\.viewMode\)/);
  }

  assert.match(track, /value: catalogAccessModeLabel\(draft\.streamMode\)/);
  assert.match(track, /value: catalogAccessModeLabel\(draft\.downloadMode\)/);
  assert.match(track, /value: draft\.originalMediaId \|\| "Not selected"/);
  assert.match(release, /tracks=\{draft\.tracks\.map/);
  assert.match(
    release,
    /Disc \$\{track\.discNumber\} · Track \$\{track\.trackNumber\}/,
  );
  assert.match(collection, /tracks=\{draft\.trackIds\.map/);

  assert.match(preview, /data-private-draft-preview=""/);
  assert.match(preview, /Private draft preview/);
  assert.match(preview, /This view reflects the current form\./);
  assert.match(preview, /It does not change published\s+music\./);
  assert.match(preview, /<ol className=\{styles\.previewOrderedList\}>/);
  assert.match(preview, /tags\.join\(" · "\)/);
});

test("catalog administration stays asset-free and exposes no byte controls", async () => {
  const sources = await Promise.all(Object.values(files).map(source));
  const combined = sources.join("\n");

  assert.doesNotMatch(combined, /<(?:img|audio|video|picture|source)\b/i);
  assert.doesNotMatch(combined, /type=["']file["']/i);
  assert.doesNotMatch(combined, /\bFormData\b|\bFileReader\b|\bR2Bucket\b/i);
  assert.doesNotMatch(combined, /\bupload(?:ed|ing|s)?\b/i);
  assert.doesNotMatch(combined, /(?:background-)?image\s*:|url\(/i);
  assert.doesNotMatch(
    combined,
    /\.(?:aiff?|mp3|wav|flac|m4a|jpe?g|png|webp|gif|svg)\b/i,
  );
  assert.doesNotMatch(combined, /placeholder=|data:(?:audio|image)\//i);
});
