import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogRoots = [
  {
    plural: "tracks",
    singular: "track",
    title: "Track",
    validator: "validateTrackDraftInput",
    save: "saveTrackDraft",
    publish: "publishTrack",
    unpublish: "unpublishTrack",
  },
  {
    plural: "releases",
    singular: "release",
    title: "Release",
    validator: "validateReleaseDraftInput",
    save: "saveReleaseDraft",
    publish: "publishRelease",
    unpublish: "unpublishRelease",
  },
  {
    plural: "collections",
    singular: "collection",
    title: "Collection",
    validator: "validateCollectionDraftInput",
    save: "saveCollectionDraft",
    publish: "publishCollection",
    unpublish: "unpublishCollection",
  },
];

async function routeSource(plural, action = "") {
  const suffix = action ? `/${action}/route.ts` : "/route.ts";
  return readFile(
    new URL(
      `../app/api/admin/music/${plural}/[slug]${suffix}`,
      import.meta.url,
    ),
    "utf8",
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("catalog draft APIs enforce exact validated wrappers and scoped authority", async () => {
  for (const root of catalogRoots) {
    const source = await routeSource(root.plural);
    const singular = escapeRegex(root.singular);

    assert.match(source, /export async function PUT\(/);
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /await readJsonMutation\(request\)/);
    assert.match(source, /requireIdempotencyKey\(request\)/);
    assert.match(
      source,
      new RegExp(
        `requireMutationObject\\([\\s\\S]*?\\["expectedVersion", "${singular}"\\][\\s\\S]*?\\)`,
      ),
    );
    assert.match(
      source,
      /requireExpectedVersion\(input\.expectedVersion, \{\s*allowZero: true,\s*\}\)/,
    );
    assert.match(
      source,
      new RegExp(
        `const ${singular} = ${root.validator}\\(input\\.${singular}\\);`,
      ),
    );
    assert.match(source, new RegExp(`${singular}\\.value\\.slug !== slug`));
    assert.match(source, /\["owner", "editor"\]/);
    assert.match(source, /permissionKey: "catalog\.write"/);
    assert.match(source, /scopeId: expectedVersion === 0 \? "\*" : slug/);
    assert.match(
      source,
      new RegExp(
        `${root.save}\\([\\s\\S]*?env\\.DB,[\\s\\S]*?${singular}\\.value,[\\s\\S]*?expectedVersion`,
      ),
    );
    assert.match(source, /actorUserId: identity\.userId/);
    assert.match(source, /idempotencyKey,/);
    assert.match(source, /requestId,/);
    assert.match(
      source,
      /result\.value\.created && !result\.replayed \? 201 : 200/,
    );
    assert.match(source, /return apiJson\(/);
    assert.match(source, /return runApiRoute\(/);
  }
});

test("catalog publication APIs accept only a positive version and require the owner", async () => {
  for (const root of catalogRoots) {
    for (const action of ["publish", "unpublish"]) {
      const source = await routeSource(root.plural, action);
      const mutation = action === "publish" ? root.publish : root.unpublish;

      assert.match(source, /export async function POST\(/);
      assert.match(source, /export const dynamic = "force-dynamic"/);
      assert.match(source, /await readJsonMutation\(request\)/);
      assert.match(source, /requireIdempotencyKey\(request\)/);
      assert.match(
        source,
        /requireMutationObject\([\s\S]*?\["expectedVersion"\][\s\S]*?\)/,
      );
      assert.match(
        source,
        /requireExpectedVersion\(input\.expectedVersion, \{\s*allowZero: false,\s*\}\)/,
      );
      assert.match(
        source,
        /requireApplicationAuthority\(env\.DB, \["owner"\]\)/,
      );
      assert.doesNotMatch(source, /"editor"|catalog\.write/);
      assert.match(
        source,
        new RegExp(
          `${mutation}\\(env\\.DB, slug, expectedVersion, \\{[\\s\\S]*?actorUserId: identity\\.userId[\\s\\S]*?idempotencyKey,[\\s\\S]*?requestId,`,
        ),
      );
      assert.match(source, /return apiJson\(/);
      assert.match(source, /return runApiRoute\(/);
    }
  }
});

test("catalog admin APIs stay metadata-only", async () => {
  const sources = await Promise.all(
    catalogRoots.flatMap((root) => [
      routeSource(root.plural),
      routeSource(root.plural, "publish"),
      routeSource(root.plural, "unpublish"),
    ]),
  );
  const combined = sources.join("\n");

  assert.doesNotMatch(
    combined,
    /media(?:Object|Derivative|Approval)|upload|R2Bucket|\.put\(|File\b|FormData|objectKey/i,
  );
  assert.doesNotMatch(
    combined,
    /\.(?:aiff?|mp3|wav|flac|m4a|jpe?g|png|webp|gif|svg)\b/i,
  );
});
