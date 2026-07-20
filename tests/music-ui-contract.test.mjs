import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  rootLayout: "../app/layout.tsx",
  layout: "../app/(public)/layout.tsx",
  indexRoute: "../app/(public)/music/page.tsx",
  releaseRoute: "../app/(public)/music/releases/[slug]/page.tsx",
  trackRoute: "../app/(public)/music/tracks/[slug]/page.tsx",
  collectionRoute: "../app/(public)/music/collections/[slug]/page.tsx",
  musicIndex: "../components/music/MusicIndex.tsx",
  mobileMusicControls: "../components/music/MobileMusicControls.tsx",
  trackActions: "../components/music/TrackActions.tsx",
  publicTrackActions: "../components/music/PublicTrackActions.tsx",
  emptyTrackPreview: "../components/music/EmptyTrackPreview.tsx",
  previewCatalogDetail: "../components/music/PreviewCatalogDetail.tsx",
  previewTrackDetail: "../components/music/PreviewTrackDetail.tsx",
  trackColumnHeader: "../components/music/TrackColumnHeader.tsx",
  musicFilters: "../components/music/MusicFilters.tsx",
  musicSort: "../components/music/MusicSort.tsx",
  downloadIcon: "../components/ui/DownloadIcon.tsx",
  favoriteHeartIcon: "../components/ui/FavoriteHeartIcon.tsx",
  musicDetail: "../components/music/MusicDetail.tsx",
  musicStyles: "../components/music/Music.module.css",
  playerBoundary: "../components/player/PlayerBoundary.tsx",
  playerProvider: "../components/player/PlayerProvider.tsx",
  player: "../components/player/PersistentAudioPlayer.tsx",
  playerIcons: "../components/player/PlayerIcons.tsx",
  playerStyles: "../components/player/Player.module.css",
  trackList: "../components/player/PlayableTrackList.tsx",
  currentDetail: "../lib/catalog/read-current-detail.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("owns the music routes through public-index and identity-aware detail boundaries", async () => {
  const [index, release, track, collection, currentDetail] = await Promise.all([
    source(files.indexRoute),
    source(files.releaseRoute),
    source(files.trackRoute),
    source(files.collectionRoute),
    source(files.currentDetail),
  ]);

  assert.match(index, /readPublicMusicIndex\(env\.DB, query\)/);
  assert.match(index, /listActiveCommerceProducts\(env\.DB\)/);
  assert.match(index, /listActiveLicenseOffers\(env\.DB\)/);
  assert.match(index, /readActiveModuleKeys\(env\.DB\)/);
  assert.match(release, /readCurrentCatalogRelease\(env\.DB, slug\)/);
  assert.match(track, /readCurrentCatalogTrack\(env\.DB, slug\)/);
  assert.match(collection, /readCurrentCatalogCollection\(env\.DB, slug\)/);
  assert.match(release, /<PreviewCatalogDetail kind="album" \/>/);
  assert.match(collection, /<PreviewCatalogDetail kind="collection" \/>/);
  assert.match(currentDetail, /getChatGPTUser\(\)/);
  assert.match(
    currentDetail,
    /resolveApplicationIdentity\(binding, authenticatedUser\)/,
  );
  assert.match(currentDetail, /readCatalogRelease\(/);
  assert.match(currentDetail, /readCatalogTrack\(/);
  assert.match(currentDetail, /readCatalogCollection\(/);
  assert.match(release, /if \(!release\) notFound\(\)/);
  assert.match(track, /if \(!track\) notFound\(\)/);
  assert.match(collection, /if \(!collection\) notFound\(\)/);
});

test("keeps the complete neutral music library functional and literal when empty", async () => {
  const [
    index,
    emptyTrackPreview,
    previewCatalogDetail,
    previewTrackDetail,
    trackColumnHeader,
    filters,
    mobileControls,
    trackActions,
    publicTrackActions,
    sort,
    downloadIcon,
    favoriteHeartIcon,
    detail,
    styles,
  ] = await Promise.all([
    source(files.musicIndex),
    source(files.emptyTrackPreview),
    source(files.previewCatalogDetail),
    source(files.previewTrackDetail),
    source(files.trackColumnHeader),
    source(files.musicFilters),
    source(files.mobileMusicControls),
    source(files.trackActions),
    source(files.publicTrackActions),
    source(files.musicSort),
    source(files.downloadIcon),
    source(files.favoriteHeartIcon),
    source(files.musicDetail),
    source(files.musicStyles),
  ]);
  const combined = `${index}\n${emptyTrackPreview}\n${previewTrackDetail}\n${detail}`;

  assert.match(index, /No music has been published yet\./);
  assert.match(index, /No collections have been published yet\./);
  assert.match(index, /No albums have been published yet\./);
  assert.match(index, /No favorite tracks yet\./);
  assert.match(index, /item\.artwork \?/);
  assert.match(index, /<h1>Music Library<\/h1>/);
  assert.match(index, /Browse and filter/);
  assert.match(index, /MusicFilters/);
  assert.match(index, /MobileMusicControls/);
  assert.match(mobileControls, /Music library mobile navigation/);
  assert.match(mobileControls, />\s*Search\s*</);
  assert.match(mobileControls, />\s*Filters\s*</);
  assert.match(index, /<MusicSort query=\{data\.query\} view=\{view\} \/>/);
  assert.match(index, /styles\.listTools/);
  assert.match(filters, /onChange=\{applyInput\}/);
  assert.match(filters, /onChange=\{applySelection\}/);
  for (const label of ["Meter", "Tempo", "Key", "Duration"]) {
    assert.match(filters, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(filters, />Apply</);
  assert.doesNotMatch(filters, />Clear</);
  assert.match(sort, /startTransition\(\(\) => router\.push\(href\)\)/);
  assert.match(index, /href: "\/music\?view=favorites"/);
  assert.match(index, /href="\/account\/playlists"/);
  assert.match(index, /href="\/account\/listening-history"/);
  assert.match(index, /playlists\.map/);
  assert.match(index, /listeningHistory\.slice\(0, 3\)/);
  assert.doesNotMatch(index, /item\.icon/);
  assert.doesNotMatch(index, /No playlists yet\./);
  assert.doesNotMatch(index, /No listening history yet\./);
  assert.doesNotMatch(index, /Streaming unavailable/);
  assert.match(index, /styles\.indexArtworkEmpty/);
  assert.match(index, /<EmptyTrackPreview playlists=\{playlists\} \/>/);
  assert.match(index, /<EmptyCatalogPreview count=\{3\} kind="album" \/>/);
  assert.match(index, /<EmptyCatalogPreview count=\{2\} kind="collection" \/>/);
  assert.match(index, /preview-\$\{index \+ 1\}/);
  assert.match(emptyTrackPreview, /Array\.from\(\{ length: 5 \}/);
  assert.match(
    emptyTrackPreview,
    /previewQueue\(EMPTY_TRACK_PREVIEW_QUEUE, index\)/,
  );
  assert.match(emptyTrackPreview, /className=\{styles\.playTriangle\}/);
  assert.match(styles, /\.previewArtworkButton:hover span/);
  assert.match(index, /<TrackColumnHeader \/>/);
  assert.match(previewCatalogDetail, /<TrackColumnHeader \/>/);
  assert.match(
    previewCatalogDetail,
    /<EmptyTrackPreview playlists=\{\[\]\} \/>/,
  );
  assert.match(previewCatalogDetail, />Buy Downloads</);
  assert.match(trackColumnHeader, />Tempo</);
  assert.match(trackColumnHeader, />Meter</);
  assert.match(trackColumnHeader, />Key</);
  assert.match(index, /const displayedCount =/);
  assert.match(emptyTrackPreview, /href="\/music\/tracks\/preview"/);
  for (const action of ["Add to Playlist", "License Track", "Buy Track"]) {
    assert.match(previewTrackDetail, new RegExp(`>${action}<`));
    assert.match(trackActions, new RegExp(`>\\s*${action}\\s*<`));
  }
  assert.match(previewTrackDetail, />Download</);
  assert.match(trackActions, /aria-label=\{`Download \$\{trackTitle\}`\}/);
  assert.match(trackActions, /<DownloadIcon \/>/);
  assert.doesNotMatch(
    trackActions,
    /className=\{styles\.trackAction\} href=\{downloadHref\}/,
  );
  assert.match(downloadIcon, /M12 3v17/);
  assert.doesNotMatch(downloadIcon, /M3 15v4/);
  assert.match(downloadIcon, /strokeLinecap="round"/);
  assert.match(previewTrackDetail, />Favorite</);
  assert.match(trackActions, /Add to Favorites/);
  assert.match(index, /item\.tempoBpm/);
  assert.match(index, /item\.meter/);
  assert.match(index, /item\.musicalKey/);
  assert.match(index, /durationLabel\(item\.durationMs\)/);
  assert.doesNotMatch(filters, /Any meter|Any key|Minimum BPM|Maximum BPM/);
  assert.match(trackActions, />\s*Buy Track\s*<\/Link>/);
  assert.match(trackActions, />\s*License Track\s*<\/Link>/);
  assert.match(index, /<PublicTrackActions/);
  assert.match(publicTrackActions, /readCustomerFavoriteState\(/);
  assert.match(publicTrackActions, /resolveApplicationIdentity\(/);
  assert.match(trackActions, /"\/api\/account\/favorites"/);
  assert.match(trackActions, /active: !favoriteActive/);
  assert.match(trackActions, /expectedRevision: favoriteRevision/);
  assert.match(trackActions, /aria-pressed=\{favoriteActive\}/);
  assert.match(
    trackActions,
    /<FavoriteHeartIcon active=\{favoriteActive\} \/>/,
  );
  assert.match(favoriteHeartIcon, /fill=\{active \? "currentColor" : "none"\}/);
  assert.match(favoriteHeartIcon, /strokeLinecap="round"/);
  assert.match(favoriteHeartIcon, /strokeLinejoin="round"/);
  assert.match(favoriteHeartIcon, /strokeWidth="1\.25"/);
  assert.match(trackActions, /"\/api\/account\/playlists"/);
  assert.match(trackActions, /`\/api\/account\/playlists\/\$\{/);
  assert.match(trackActions, /trackIds: \[\.\.\.trackIds, durableTrackId\]/);
  assert.match(trackActions, /expectedRevision: playlist\.revision/);
  assert.match(trackActions, /trackIds: \[durableTrackId\]/);
  assert.match(trackActions, /Create New Playlist/);
  assert.match(trackActions, /Create & Add/);
  assert.match(trackActions, /showModal\(\)/);
  assert.match(trackActions, /<dialog/);
  assert.match(index, /<PlayTrackButton compact/);
  assert.match(styles, /\.libraryShell/);
  assert.match(styles, /\.librarySidebar/);
  assert.match(styles, /\.mobileLibraryNavigation/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.librarySidebar \{\s*display: none;/);
  assert.match(styles, /\.mobileActionDialog/);
  assert.match(styles, /\.favoriteHeart\[aria-pressed="true"\]/);
  assert.match(styles, /\.catalogRow:hover/);
  assert.match(styles, /\.catalogRow:focus-within/);
  assert.match(styles, /@container music-main \(max-width: 74rem\)/);
  assert.match(styles, /container-name: music-main/);
  assert.match(styles, /\.catalogCardLink:hover/);
  assert.match(styles, /transform: translateY\(-1px\)/);
  assert.match(styles, /\.listTools\s*\{[\s\S]*display: flex/);
  assert.match(styles, /grid-template-areas: "lead actions"/);
  assert.match(
    styles,
    /\.libraryShell:has\(\.sidebarDisclosure:not\(\[open\]\)\)/,
  );
  assert.match(styles, /\.sidebarDisclosure:not\(\[open\]\) > summary::before/);
  assert.match(detail, /data\.artwork \?/);
  assert.doesNotMatch(
    combined,
    /\.(?:aiff?|mp3|wav|flac|m4a|jpe?g|png|webp|gif|svg)\b/i,
  );
  assert.doesNotMatch(combined, /data:(?:audio|image)\//i);
  assert.doesNotMatch(combined, /placeholder|fallback/i);
});

test("mounts one root-persistent player and reveals it only after selection", async () => {
  const [rootLayout, layout, boundary, provider] = await Promise.all([
    source(files.rootLayout),
    source(files.layout),
    source(files.playerBoundary),
    source(files.playerProvider),
  ]);

  assert.match(
    rootLayout,
    /<PlayerBoundary historyEnabled=\{historyEnabled\}>[\s\S]*\{children\}[\s\S]*<\/PlayerBoundary>/,
  );
  assert.doesNotMatch(layout, /PlayerBoundary/);
  assert.match(boundary, /currentTrack \? <PersistentAudioPlayer \/> : null/);
  assert.match(
    boundary,
    /data-player-visible=\{currentTrack \? "true" : "false"\}/,
  );
  assert.match(provider, /<audio/);
  assert.doesNotMatch(provider, /src=/);
  assert.match(provider, /track\.streamUrl/);
});

test("exposes labeled icon controls, queue state, and live playback status", async () => {
  const [player, playerStyles, trackList, playerIcons, provider] =
    await Promise.all([
      source(files.player),
      source(files.playerStyles),
      source(files.trackList),
      source(files.playerIcons),
      source(files.playerProvider),
    ]);

  assert.match(player, /aria-label="Audio player"/);
  assert.match(player, /aria-label="Playback controls"/);
  assert.match(player, /aria-label=\{`Seek \$\{currentTrack\.title\}`\}/);
  assert.match(player, /aria-valuetext=/);
  assert.match(player, /aria-label="Volume"/);
  assert.match(player, /aria-label="Previous track"/);
  assert.match(player, /aria-label="Next track"/);
  assert.match(player, /aria-label="Close audio player"/);
  assert.match(player, /<PlayIcon \/>/);
  assert.match(player, /<PauseIcon \/>/);
  assert.match(player, /<RepeatIcon \/>/);
  assert.match(player, /<ShuffleIcon \/>/);
  assert.match(player, /<QueueIcon \/>/);
  assert.match(player, /<VolumeIcon \/>/);
  assert.doesNotMatch(player, />\s*Previous\s*</);
  assert.doesNotMatch(player, />\s*Next\s*</);
  assert.doesNotMatch(player, /Repeat:\s*/);
  assert.match(provider, /dispatch\(\{ type: "clear" \}\)/);
  assert.match(playerIcons, /export function CloseIcon/);
  assert.match(playerIcons, /export function ShuffleIcon/);
  assert.match(player, /aria-controls=\{queueId\}/);
  assert.match(player, /aria-expanded=\{queueOpen\}/);
  assert.match(player, /event\.key !== "Escape"/);
  assert.match(player, /queueCloseRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(player, /disabled=\{index === state\.currentIndex\}/);
  assert.match(player, /aria-live="polite"/);
  assert.match(playerStyles, /max-height: 100dvh/);
  assert.match(playerStyles, /min-height: 2\.75rem/);
  assert.match(trackList, /aria-current=\{isCurrent \? "true" : undefined\}/);
  assert.match(trackList, /track\.streamUrl \?/);
  assert.match(trackList, /Streaming unavailable/);
});
