import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("packages the functional home and quiet public page labels", async () => {
  const [home, publicPage, pageHeader, pageHero, footer, layout, manifest] =
    await Promise.all([
      readFile(new URL("../app/(public)/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(public)/[slug]/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/public/PublicPageHeader.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/public/PageHero.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/public/SiteFooter.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../dist/server/.vite/manifest.json", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(layout, /a-op: artist-owned platform/i);
  assert.match(pageHeader, /<h1 className="sr-only">\{title\}<\/h1>/);
  assert.match(home, /readPublishedArtistRevision/);
  assert.match(home, /readPublicMosaicImages/);
  assert.match(home, /<MediaMosaic/);
  assert.match(home, /No releases have been published\./);
  assert.match(home, /No Courses have been published\./);
  assert.match(home, /No videos have been published\./);
  assert.match(pageHero, /if \(mosaicImages\)/);
  assert.match(home, /<CourseCards/);
  assert.match(home, /<ExternalVideoConsent/);
  assert.match(home, /href="\/membership"/);
  assert.match(home, /href="\/licensing"/);
  assert.doesNotMatch(footer, /TelemetryConsentControl|Audience privacy/);
  assert.match(footer, /label: "Explore"/);
  assert.match(footer, /label: "Membership"/);
  assert.match(footer, /label: "Courses"/);
  assert.match(footer, /label: "Support"/);
  assert.match(footer, /label: "Connect"/);
  assert.match(footer, /keys: \["about", "contact", "faq"\]/);
  assert.match(footer, /readPublicNavigationSnapshot\(env\.DB, "primary"\)/);
  assert.match(footer, /\.\.\.\(primaryNavigation\?\.items \?\? \[\]\)/);
  assert.match(footer, /\.\.\.configuredDirectoryItems/);
  assert.match(footer, /© \{new Date\(\)\.getUTCFullYear\(\)\}/);
  assert.doesNotMatch(home, /Sites-provided R2|Sites-provided D1|ChatGPT/);
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
  const themeToggle = css.match(/\.theme-toggle \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(themeToggle);
  assert.match(themeToggle, /border:\s*0/);
  assert.doesNotMatch(themeToggle, /border-color|background-color/);
  assert.match(layout, /@fontsource\/lato\/300\.css/);
  assert.match(layout, /@fontsource\/lato\/400\.css/);
  assert.deepEqual(JSON.parse(hosting), { d1: "DB", r2: "MEDIA" });
  assert.deepEqual(JSON.parse(packagedHosting), { d1: "DB", r2: "MEDIA" });
  await access(new URL("licenses/Lato-OFL-1.1.txt", projectRoot));
  await assert.rejects(access(new URL("public/images/mosaic", projectRoot)));
  await assert.rejects(access(new URL("public/og.png", projectRoot)));
});
