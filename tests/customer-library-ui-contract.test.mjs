import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  favoritesPage: "../app/account/favorites/page.tsx",
  playlistsPage: "../app/account/playlists/page.tsx",
  playlistPage: "../app/account/playlists/[playlistId]/page.tsx",
  historyPage: "../app/account/listening-history/page.tsx",
  server: "../components/account/customer-library/server.ts",
  favorites: "../components/account/customer-library/FavoriteList.tsx",
  creator: "../components/account/customer-library/PlaylistCreator.tsx",
  editor: "../components/account/customer-library/PlaylistEditor.tsx",
  playlistList: "../components/account/customer-library/PlaylistList.tsx",
  sequence: "../components/account/customer-library/TrackSequenceEditor.tsx",
  history: "../components/account/customer-library/ListeningHistoryList.tsx",
  resume: "../components/account/customer-library/ResumeListeningButton.tsx",
  styles: "../components/account/customer-library/CustomerLibrary.module.css",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("customer-library pages enforce customer and module authority on the server", async () => {
  const [server, favorites, playlists, playlist, history] = await Promise.all([
    source(files.server),
    source(files.favoritesPage),
    source(files.playlistsPage),
    source(files.playlistPage),
    source(files.historyPage),
  ]);

  assert.match(server, /requireChatGPTUser\(returnTo\)/);
  assert.match(
    server,
    /resolveApplicationIdentity\(env\.DB, authenticatedUser\)/,
  );
  assert.match(server, /identity\.roles\.includes\("customer"\)/);
  assert.match(server, /requireActiveModule\(env\.DB, "customer-library"\)/);
  assert.match(server, /error\.code === "MODULE_INACTIVE"/);

  for (const page of [favorites, playlists, playlist, history]) {
    assert.match(page, /export const dynamic = "force-dynamic"/);
    assert.match(page, /requireCustomerLibraryPage\(/);
  }
  assert.match(favorites, /readCustomerFavorites\(env\.DB, identity\.userId\)/);
  assert.match(playlists, /readCustomerPlaylists\(env\.DB, identity\.userId\)/);
  assert.match(
    playlists,
    /readPublicMusicIndex\(env\.DB, \{ kind: "track", sort: "title" \}\)/,
  );
  assert.match(
    playlist,
    /readCustomerPlaylist\(env\.DB, identity\.userId, playlistId\)/,
  );
  assert.match(history, /readListeningHistory\(env\.DB, identity\.userId\)/);
});

test("favorites expose true empty state and desired-state remove and restore", async () => {
  const favorites = await source(files.favorites);

  assert.match(favorites, /No favorites yet\./);
  assert.match(favorites, /"\/api\/account\/favorites"/);
  assert.match(favorites, /"PUT"/);
  assert.match(favorites, /targetType: item\.favorite\.targetType/);
  assert.match(favorites, /targetId: item\.favorite\.targetId/);
  assert.match(favorites, /active,/);
  assert.match(favorites, /expectedRevision: item\.revision/);
  assert.match(favorites, /item\.active \? "Remove" : "Restore"/);
  assert.match(favorites, /This catalog item is no longer available\./);
});

test("playlist controls use published catalog options, explicit order, and CAS mutations", async () => {
  const [creator, editor, list, sequence] = await Promise.all([
    source(files.creator),
    source(files.editor),
    source(files.playlistList),
    source(files.sequence),
  ]);

  assert.match(creator, /"\/api\/account\/playlists"/);
  assert.match(creator, /"POST"/);
  assert.match(creator, /name,\s*description,\s*trackIds: selected\.map/);
  assert.match(creator, /selected\.length === 0/);
  assert.match(list, /No playlists yet\./);
  assert.match(list, /href=\{`\/account\/playlists\/\$\{encodeURIComponent/);

  assert.match(sequence, /Published catalog tracks/);
  assert.match(sequence, /No published tracks are available\./);
  assert.match(sequence, /Move up/);
  assert.match(sequence, /Move down/);
  assert.match(sequence, /Remove/);
  assert.match(sequence, /disabled=\{index === 0\}/);
  assert.match(sequence, /disabled=\{index === selected\.length - 1\}/);

  assert.match(editor, /"PUT"/);
  assert.match(
    editor,
    /name,\s*description,\s*trackIds: selected\.map[\s\S]*?expectedRevision: revision/,
  );
  assert.match(editor, /"DELETE"/);
  assert.match(editor, /\{ expectedRevision: revision \}/);
  assert.match(editor, /window\.confirm\(/);
  assert.match(editor, /hasUnavailableTracks/);
  assert.match(editor, /Archive playlist/);
});

test("listening history keeps frozen titles distinct and passes resume state to the player", async () => {
  const [history, resume] = await Promise.all([
    source(files.history),
    source(files.resume),
  ]);

  assert.match(history, /No listening history yet\./);
  assert.match(history, /item\.listenedRevision\.title/);
  assert.match(history, /item\.track\.available/);
  assert.match(history, /Available now as/);
  assert.match(history, /no longer available in the current catalog/);
  assert.match(history, /item\.resumePositionMs !== null/);
  assert.match(resume, /usePlayer\(\)/);
  assert.match(resume, /resumePositionMs,/);
  assert.match(resume, /historyRevision,/);
  assert.match(resume, /playQueue\(\[resumableTrack\], 0\)/);
  assert.match(resume, /"Resume"/);
});

test("customer-library UI stays open, responsive, keyboard native, and asset-free", async () => {
  const sources = await Promise.all(Object.values(files).map(source));
  const combined = sources.join("\n");
  const styles = await source(files.styles);

  assert.match(styles, /border-top: 1px solid var\(--slate\)/);
  assert.match(styles, /border-bottom: 1px solid var\(--slate\)/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(styles, /\.(?:card|panel|surface)\b/i);
  assert.doesNotMatch(styles, /(?:background-)?image\s*:|url\(/i);
  assert.doesNotMatch(combined, /<(?:img|audio|video|picture|source)\b/i);
  assert.doesNotMatch(combined, /type=["']file["']/i);
  assert.doesNotMatch(combined, /\bFormData\b|\bFileReader\b|\bR2Bucket\b/i);
  assert.match(combined, /type="button"/);
  assert.match(combined, /type="submit"/);
});
