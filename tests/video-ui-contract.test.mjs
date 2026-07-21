import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, index, emptyPlayer, styles] = await Promise.all([
  readFile("app/(public)/videos/page.tsx", "utf8"),
  readFile("components/video/VideoIndex.tsx", "utf8"),
  readFile("components/video/EmptyVideoPlayer.tsx", "utf8"),
  readFile("components/video/Video.module.css", "utf8"),
]);

test("an empty Video installation presents one viewing room and four blank Videos", () => {
  assert.match(index, /const PREVIEW_VIDEO_COUNT = 4/);
  assert.match(index, /<p>Now Playing<\/p>/);
  assert.match(index, /selectedVideo\?\.title \?\? "Title"/);
  assert.match(index, /selectedVideo\?\.summary \|\| "Subheading"/);
  assert.match(index, /: "Date"/);
  assert.match(index, /Watch on YouTube/);
  assert.match(index, /id="playlist-title">Playlist/);
  assert.match(
    index,
    /<span aria-hidden="true" className=\{styles\.playlistArtwork\} \/>/,
  );
});

test("blank playlist selection and the empty player are interactive without creating Video records", () => {
  assert.match(route, /searchParams/);
  assert.match(index, /href={`\/videos\?video=preview-\$\{videoNumber\}`}/);
  assert.match(index, /aria-current=\{active \? "true" : undefined\}/);
  assert.match(emptyPlayer, /useState\(false\)/);
  assert.match(emptyPlayer, /setPlaying\(\(current\) => !current\)/);
  assert.match(emptyPlayer, /playing \? "Pause Video" : "Play Video"/);
  assert.match(emptyPlayer, /aria-pressed=\{playing\}/);
  assert.doesNotMatch(
    `${index}\n${emptyPlayer}`,
    /fetch\(|method:\s*"(?:POST|PUT|DELETE)"/,
  );
});

test("published Videos replace the preview and retain hosted and privacy-gated external playback", () => {
  assert.match(route, /listPublishedVideos\(env\.DB\)/);
  assert.match(
    route,
    /videos\.map\(\(\{ slug \}\) => readPublishedVideoBySlug\(env\.DB, slug\)\)/,
  );
  assert.match(index, /ExternalVideoConsent/);
  assert.match(index, /HostedVideoPlayer/);
  assert.match(index, /videos\.map\(\(video\) =>/);
  assert.match(
    index,
    /`\/videos\?video=\$\{encodeURIComponent\(video\.slug\)\}`/,
  );
  assert.match(index, /https:\/\/www\.youtube\.com\/watch\?v=/);
});

test("the Video viewing room is a restrained two-column layout that stacks on phones", () => {
  assert.match(
    styles,
    /\.viewingRoom\s*\{[^}]*grid-template-columns: minmax\(0, 1\.05fr\) minmax\(22rem, 0\.95fr\)/s,
  );
  assert.match(
    styles,
    /\.playlistRow\s*\{[^}]*grid-template-columns: 7\.5rem minmax\(0, 1fr\)/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 960px\)[\s\S]*?\.viewingRoom\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
