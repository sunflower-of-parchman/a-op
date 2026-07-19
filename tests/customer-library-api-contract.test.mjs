import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

import ts from "typescript";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const validation = await import("../lib/customer-library/validation.ts");
const { requireCustomerLibraryInput, requirePlaylistId } =
  await import("../app/api/account/customer-library-input.ts");

const routeFiles = Object.freeze({
  favorites: new URL("../app/api/account/favorites/route.ts", import.meta.url),
  playlists: new URL("../app/api/account/playlists/route.ts", import.meta.url),
  playlist: new URL(
    "../app/api/account/playlists/[playlistId]/route.ts",
    import.meta.url,
  ),
  history: new URL(
    "../app/api/account/listening-history/route.ts",
    import.meta.url,
  ),
});

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(routeFiles).map(async ([key, url]) => [
      key,
      await readFile(url, "utf8"),
    ]),
  ),
);

function functionText(source, fileName, functionName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const matches = [];

  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      matches.push(node.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.equal(
    matches.length,
    1,
    `${fileName} must define ${functionName} exactly once`,
  );
  return matches[0];
}

function assertCustomerBoundary(body) {
  assert.match(body, /requireApplicationAuthority\(env\.DB, \["customer"\]\)/);
  assert.match(body, /requireActiveModule\(env\.DB, "customer-library"\)/);
  assert.match(body, /runApiRoute\(/);
  assert.match(body, /apiJson\(/);
}

function assertMutationBoundary(body, validator, repository) {
  assertCustomerBoundary(body);
  assert.match(body, /readJsonMutation\(request\)/);
  assert.match(body, /requireIdempotencyKey\(request\)/);
  assert.match(body, new RegExp(`${validator}\\(requestInput\\)`));
  assert.match(body, new RegExp(`${repository}\\(`));
  assert.match(body, /actorUserId: identity\.userId/);
  assert.doesNotMatch(
    body,
    /actorUserId:\s*(?:requestInput|input|request|body)/,
  );
  assert.doesNotMatch(body, /(?:requestInput|input|body)\.userId/);
}

test("customer-library reads require the active customer principal and module", () => {
  const reads = [
    [
      "favorites",
      "app/api/account/favorites/route.ts",
      "readCustomerFavorites",
    ],
    [
      "playlists",
      "app/api/account/playlists/route.ts",
      "readCustomerPlaylists",
    ],
    [
      "playlist",
      "app/api/account/playlists/[playlistId]/route.ts",
      "readCustomerPlaylist",
    ],
    [
      "history",
      "app/api/account/listening-history/route.ts",
      "readListeningHistory",
    ],
  ];

  for (const [sourceKey, fileName, reader] of reads) {
    const body = functionText(sources[sourceKey], fileName, "GET");
    assertCustomerBoundary(body);
    assert.match(body, new RegExp(`${reader}\\(`));
    assert.match(body, /identity\.userId/);
    assert.doesNotMatch(body, /searchParams.*userId|params.*userId/);
  }
});

test("favorite and listening mutations validate exact JSON before server-owned writes", () => {
  assertMutationBoundary(
    functionText(
      sources.favorites,
      "app/api/account/favorites/route.ts",
      "PUT",
    ),
    "validateFavoriteDesiredStateInput",
    "setCustomerFavorite",
  );
  assertMutationBoundary(
    functionText(
      sources.history,
      "app/api/account/listening-history/route.ts",
      "PUT",
    ),
    "validateListeningCheckpointInput",
    "checkpointListeningHistory",
  );
});

test("playlist create, replacement, and archive use their exact validators", () => {
  assertMutationBoundary(
    functionText(
      sources.playlists,
      "app/api/account/playlists/route.ts",
      "POST",
    ),
    "validatePlaylistCreateInput",
    "createCustomerPlaylist",
  );
  assertMutationBoundary(
    functionText(
      sources.playlist,
      "app/api/account/playlists/[playlistId]/route.ts",
      "PUT",
    ),
    "validatePlaylistReplacementInput",
    "replaceCustomerPlaylist",
  );
  assertMutationBoundary(
    functionText(
      sources.playlist,
      "app/api/account/playlists/[playlistId]/route.ts",
      "DELETE",
    ),
    "validatePlaylistArchiveInput",
    "archiveCustomerPlaylist",
  );
});

test("playlist detail routes validate the path and hide missing or cross-customer records", () => {
  const get = functionText(
    sources.playlist,
    "app/api/account/playlists/[playlistId]/route.ts",
    "GET",
  );
  assert.match(
    sources.playlist,
    /requirePlaylistId\(\(await context\.params\)\.playlistId\)/,
  );
  assert.match(get, /if \(!playlist\)/);
  assert.match(get, /"PLAYLIST_NOT_FOUND"/);
  assert.match(get, /status: 404/);
  assert.equal(requirePlaylistId("playlist_123"), "playlist_123");
  assert.throws(
    () => requirePlaylistId("../someone-elses-playlist"),
    (error) => error?.code === "INVALID_INPUT" && error?.status === 400,
  );
});

test("customer-library validators reject client-supplied principal fields", () => {
  const cases = [
    validation.validateFavoriteDesiredStateInput({
      targetType: "track",
      targetId: "track_1",
      active: true,
      expectedRevision: null,
      userId: "user_other",
    }),
    validation.validatePlaylistCreateInput({
      name: "Playlist",
      description: "",
      trackIds: [],
      userId: "user_other",
    }),
    validation.validatePlaylistReplacementInput({
      name: "Playlist",
      description: "",
      trackIds: [],
      expectedRevision: 1,
      userId: "user_other",
    }),
    validation.validatePlaylistArchiveInput({
      expectedRevision: 1,
      userId: "user_other",
    }),
    validation.validateListeningCheckpointInput({
      trackId: "track_1",
      positionMs: 10,
      meaningful: false,
      expectedRevision: null,
      userId: "user_other",
    }),
  ];

  for (const result of cases) {
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(({ field }) => field === "userId"));
    assert.throws(
      () => requireCustomerLibraryInput(result, "Customer operation"),
      (error) => error?.code === "INVALID_INPUT" && error?.status === 400,
    );
  }
});

test("the route surface exposes only the requested methods", () => {
  assert.match(sources.favorites, /export async function GET\(/);
  assert.match(sources.favorites, /export async function PUT\(/);
  assert.doesNotMatch(sources.favorites, /export async function POST\(/);

  assert.match(sources.playlists, /export async function GET\(/);
  assert.match(sources.playlists, /export async function POST\(/);
  assert.doesNotMatch(sources.playlists, /export async function DELETE\(/);

  for (const method of ["GET", "PUT", "DELETE"]) {
    assert.match(
      sources.playlist,
      new RegExp(`export async function ${method}\\(`),
    );
  }
  assert.doesNotMatch(sources.playlist, /export async function POST\(/);

  assert.match(sources.history, /export async function GET\(/);
  assert.match(sources.history, /export async function PUT\(/);
  assert.doesNotMatch(sources.history, /export async function POST\(/);
});
