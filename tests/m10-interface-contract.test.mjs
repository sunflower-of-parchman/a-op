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

test("commerce discovery, checkout, return, account, and administration use one persistent Test Mode notice", async () => {
  const [
    home,
    catalog,
    checkout,
    returnResult,
    orders,
    administration,
    notice,
  ] = await Promise.all(
    [
      "app/(public)/page.tsx",
      "components/commerce/CommerceCatalog.tsx",
      "components/commerce/CommerceCheckoutButton.tsx",
      "components/commerce/CommerceReturnResult.tsx",
      "components/commerce/CustomerOrders.tsx",
      "components/commerce/AdminCommerce.tsx",
      "components/commerce/CommerceTestModeNotice.tsx",
    ].map((file) => readFile(file, "utf8")),
  );

  assert.match(home, /Stripe Test Mode/);
  assert.match(home, /No real payment will be accepted\./);
  for (const source of [catalog, returnResult, orders, administration]) {
    assert.match(source, /CommerceTestModeNotice/);
  }
  assert.match(checkout, /Continue in Stripe Test Mode/);
  assert.match(checkout, /checkout\.stripe\.com/);
  assert.match(notice, /NO_REAL_PAYMENT_STATEMENT/);
  assert.match(notice, /STRIPE_TEST_MODE_LABEL/);
});

test("the neutral installation retains no mosaic or temporary visual asset", async () => {
  await assert.rejects(access("public/images/mosaic"));
  await assert.rejects(access("public/og.png"));
  await assert.rejects(access("public/screenshot.jpeg"));
});
