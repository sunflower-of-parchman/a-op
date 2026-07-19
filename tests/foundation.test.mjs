import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("packages the open a-op foundation and public page header", async () => {
  const [home, publicPage, pageHeader, layout, manifest] = await Promise.all([
    readFile(new URL("../app/(public)/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/(public)/[slug]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/public/PublicPageHeader.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/server/.vite/manifest.json", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(layout, /a-op: artist-owned platform/i);
  assert.match(pageHeader, /public-page-heading--\$\{variant\} page-frame/);
  assert.match(home, /readPublishedArtistRevision/);
  assert.match(home, /artist\.headline/);
  assert.match(home, /Sites-provided R2/);
  assert.match(home, /Sites-provided D1/);
  assert.match(layout, /card:\s*"summary"/);
  assert.doesNotMatch(layout, /images:\s*\[/);
  assert.doesNotMatch(home, /site-creator-vinext-starter|Building your site/i);
  assert.match(publicPage, /readPublishedPageBySlug/);
  assert.match(publicPage, /page\.kind === "standard"/);
  assert.match(publicPage, /PublicPageHeader/);
  assert.match(manifest, /index\.js/);
});

test("packages exact theme, storage, type, and open-layout foundations", async () => {
  const [css, layout, hosting, packagedHosting] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(css, /--canvas:\s*#08090b/);
  assert.match(css, /--canvas:\s*#f4f6f9/);
  assert.match(css, /--accent-action:\s*#9a3f05/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /min-height:\s*2\.75rem/);
  assert.match(layout, /@fontsource\/lato\/300\.css/);
  assert.match(layout, /@fontsource\/lato\/400\.css/);
  assert.deepEqual(JSON.parse(hosting), { d1: "DB", r2: "MEDIA" });
  assert.deepEqual(JSON.parse(packagedHosting), { d1: "DB", r2: "MEDIA" });
  await access(new URL("licenses/Lato-OFL-1.1.txt", projectRoot));
  await assert.rejects(access(new URL("public/images/mosaic", projectRoot)));
  await assert.rejects(access(new URL("public/og.png", projectRoot)));
});
