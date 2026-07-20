import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile("app/globals.css", "utf8");

function luminance(hex) {
  const channels = hex
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(left, right) {
  const first = luminance(left);
  const second = luminance(right);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("dark and light semantic text pairs meet WCAG AA contrast", () => {
  const pairs = [
    ["fffdfc", "08090b", "dark primary"],
    ["d2dae3", "08090b", "dark muted"],
    ["14171c", "f4f6f9", "light primary"],
    ["575e68", "f4f6f9", "light muted"],
    ["fffdfc", "9a3f05", "orange action"],
    ["c8753d", "08090b", "dark accent"],
    ["9a3f05", "f4f6f9", "light accent"],
    ["fffdfc", "102b4b", "editorial surface"],
  ];

  for (const [foreground, background, label] of pairs) {
    assert.equal(
      contrast(foreground, background) >= 4.5,
      true,
      `${label} contrast is below 4.5:1`,
    );
  }
});

test("the shared foundation exposes keyboard, touch, reduced-motion, and responsive contracts", () => {
  assert.match(
    css,
    /:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--focus\)/,
  );
  assert.match(css, /\.skip-link:focus\s*\{[\s\S]*translateY\(0\)/);
  assert.match(css, /\.button\s*\{[\s\S]*min-height:\s*2\.75rem/);
  assert.match(css, /\.field-group input,[\s\S]*min-height:\s*2\.75rem/);
  assert.match(css, /@media \(max-width:\s*960px\)/);
  assert.match(css, /@media \(max-width:\s*720px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms !important/);
  assert.match(css, /transition-duration:\s*0\.01ms !important/);
  assert.match(css, /width:\s*min\(calc\(100% - 4rem\), 1280px\)/);
  assert.match(css, /width:\s*calc\(100% - 2rem\)/);
});

test("the compact public navigation uses the agreed hamburger-to-close contract", async () => {
  const [header, navigation] = await Promise.all([
    readFile("components/public/SiteHeader.tsx", "utf8"),
    readFile("components/public/PublicNavigation.tsx", "utf8"),
  ]);

  assert.match(
    header,
    /<PublicNavigation[\s\S]*accountHref=\{accountHref\}[\s\S]*items=\{navigationItems\}[\s\S]*loginHref=\{loginHref\}/,
  );
  assert.match(
    header,
    /FOOTER_ONLY_ROUTES = new Set\(\["\/about", "\/contact", "\/whats-new"\]\)/,
  );
  assert.match(header, /!FOOTER_ONLY_ROUTES\.has\(href\)/);
  assert.doesNotMatch(css, /\.site-header\s*\{[^}]*border-bottom:/);
  assert.match(navigation, /className="site-header__account"/);
  assert.match(navigation, /className="site-header__login"/);
  assert.match(navigation, />\s*Log in\s*<\/Link>/);
  assert.match(navigation, />\s*Account\s*<\/Link>/);
  assert.match(navigation, /usePathname\(\)/);
  assert.match(navigation, /aria-current=/);
  assert.match(css, /\.site-navigation__link\[aria-current="page"\]/);
  assert.match(navigation, /aria-controls="mobile-menu"/);
  assert.match(navigation, /aria-expanded=\{open\}/);
  assert.match(navigation, /aria-hidden=\{!open\}/);
  assert.match(navigation, /inert=\{!open\}/);
  assert.match(navigation, /event\.key === "Escape"/);
  assert.match(navigation, /toggleRef\.current\?\.focus\(\)/);
  assert.match(
    css,
    /\.mobile-navigation__toggle\s*\{[\s\S]*color:\s*var\(--accent\)/,
  );
  assert.match(
    css,
    /\.mobile-navigation__toggle\[aria-expanded="true"\] span:first-child\s*\{[\s\S]*rotate\(45deg\)/,
  );
  assert.match(
    css,
    /\.mobile-navigation__toggle\[aria-expanded="true"\] span:last-child\s*\{[\s\S]*rotate\(-45deg\)/,
  );
  assert.match(css, /\.mobile-navigation__panel\[data-open="true"\]/);
  assert.match(
    css,
    /\.site-wordmark,\s*\.mobile-navigation__toggle\s*\{[\s\S]*position:\s*relative/,
  );
  assert.doesNotMatch(
    css,
    /\.site-wordmark,\s*\.public-navigation\s*\{[\s\S]*position:\s*relative/,
  );
});

test("the account shell is one personal page with real customer data and role-scoped administration", async () => {
  const [layout, page, shell, profile, resources] = await Promise.all([
    readFile("app/account/layout.tsx", "utf8"),
    readFile("app/account/page.tsx", "utf8"),
    readFile("components/account/AccountShell.tsx", "utf8"),
    readFile("components/account/ProfileEditor.tsx", "utf8"),
    readFile("components/account/AccountDownloadsAndLicenses.tsx", "utf8"),
  ]);

  assert.match(layout, /hasApplicationRole\(identity, "owner", "editor"\)/);
  assert.match(
    layout,
    /administrationHref=\{canAdminister \? "\/admin" : undefined\}/,
  );
  assert.match(
    layout,
    /identity\?\.displayName \?\? authenticatedUser\.displayName/,
  );
  assert.match(shell, /administrationHref \? \(/);
  assert.match(shell, /<h1>Hello \{identity\.name\}<\/h1>/);
  assert.match(shell, />\s*Admin Dashboard\s*<\/Link>/);
  assert.doesNotMatch(shell, /Account navigation|navigationList|context/);
  assert.match(page, /readCustomerAccessLibrary/);
  assert.match(page, /readCustomerCreditAccountDetail/);
  assert.match(page, /readCustomerLicenseHistory/);
  assert.match(page, /readCustomerCreditAccountDetail\(env\.DB, "license"/);
  assert.match(page, /listPublishedUpdates/);
  assert.match(page, /countUnreadUpdates/);
  assert.match(page, /What&apos;s New/);
  assert.match(page, /View all updates/);
  assert.match(page, /<AccountDownloads tracks=\{downloadableTracks\}/);
  assert.match(page, /<AccountLicenses history=\{licenseHistory\}/);
  assert.doesNotMatch(page, /CustomerOrders|readCustomerCommerceOrders/);
  assert.equal((page.match(/label: "Download credits"/g) ?? []).length, 1);
  assert.equal((page.match(/label: "License credits"/g) ?? []).length, 1);
  assert.match(page, /label: "Tracks purchased"/);
  assert.doesNotMatch(page, /<h2>Credits<\/h2>/);
  assert.match(page, /<ProfileEditor/);
  assert.doesNotMatch(page, /Return home|\/account\/access|Account areas/);
  assert.doesNotMatch(page, /href="\/account\/whats-new"/);
  assert.match(profile, /router\.refresh\(\)/);
  assert.match(resources, /href=\{track\.downloadUrl\}/);
  assert.match(
    resources,
    /api\/licensing\/documents\/\$\{encodeURIComponent\(document\.id\)\}\/download/,
  );
});

test("the standard local server previews the account without replacing hosted Sites authentication", async () => {
  const [authentication, localPreview, packageSource, viteConfiguration] =
    await Promise.all([
      readFile("app/chatgpt-auth.ts", "utf8"),
      readFile("lib/auth/local-account-preview.ts", "utf8"),
      readFile("package.json", "utf8"),
      readFile("vite.config.ts", "utf8"),
    ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(packageJson.scripts.dev, /AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW=1/);
  assert.doesNotMatch(
    packageJson.scripts["dev:anonymous"],
    /AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW/,
  );
  assert.match(localPreview, /environment\.AOP_RUNTIME_ENV !== "development"/);
  assert.match(
    localPreview,
    /environment\[LOCAL_ACCOUNT_PREVIEW_FLAG\] !== "1"/,
  );
  assert.match(localPreview, /email: "customer@a-op\.invalid"/);
  assert.match(authentication, /isLocalAccountPreviewEnabled\(\): boolean/);
  assert.match(
    viteConfiguration,
    /AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW: localAccountPreviewEnabled\s*\? "1"\s*: "0"/,
  );
  assert.match(
    viteConfiguration,
    /AOP_RUNTIME_ENV: command === "build" \? "production" : "development"/,
  );
  assert.match(authentication, /const SIGN_IN_PATH = "\/signin-with-chatgpt"/);
  assert.doesNotMatch(authentication, /export default.*signin-with-chatgpt/);

  const accountPage = await readFile("app/account/page.tsx", "utf8");
  assert.doesNotMatch(accountPage, /Return home/);
  assert.match(accountPage, /!isLocalAccountPreviewEnabled\(\)/);
  assert.match(accountPage, /href=\{chatGPTSignOutPath\("\/"\)\}/);
});

test("public, account, and administration shells provide one main landmark and skip target", async () => {
  const files = [
    "app/(public)/layout.tsx",
    "app/account/layout.tsx",
    "app/admin/layout.tsx",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /className="skip-link" href="#main-content"/);
    assert.equal((source.match(/<main\b/g) ?? []).length, 1);
    assert.match(source, /<main id="main-content" tabIndex=\{-1\}>/);
  }
});

test("commerce identifies Test Mode at actions and records without repeated page notices", async () => {
  const [catalog, checkout, returnResult, orders, administration] =
    await Promise.all(
      [
        "components/commerce/CommerceCatalog.tsx",
        "components/commerce/CommerceCheckoutButton.tsx",
        "components/commerce/CommerceReturnResult.tsx",
        "components/commerce/CustomerOrders.tsx",
        "components/commerce/AdminCommerce.tsx",
      ].map((file) => readFile(file, "utf8")),
    );

  for (const source of [catalog, returnResult, orders, administration]) {
    assert.doesNotMatch(source, /CommerceTestModeNotice/);
  }
  assert.match(checkout, /Continue in Stripe Test Mode/);
  assert.match(checkout, /checkout\.stripe\.com/);
  assert.match(orders, /Test record/);
});

test("the neutral installation retains no mosaic or temporary visual asset", async () => {
  await assert.rejects(access("public/images/mosaic"));
  await assert.rejects(access("public/og.png"));
  await assert.rejects(access("public/screenshot.jpeg"));
});
