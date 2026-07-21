import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("the canonical product keeps the full platform and the Sites test boundary distinct", async () => {
  const [product, readme, contract] = await Promise.all([
    source("../PRODUCT.md"),
    source("../README.md"),
    source("../docs/architecture/commerce-environment.md"),
  ]);

  assert.match(
    product,
    /one connected commerce domain for checkout, orders, memberships, subscriptions, licensing, credits, entitlements, and protected delivery/,
  );
  assert.match(
    product,
    /The Build Week presentation demonstrates commerce through Stripe Test mode\. It accepts no real payment and moves no money\./,
  );
  assert.match(
    product,
    /Live commerce is disabled in the ChatGPT Sites deployment\./,
  );
  assert.match(
    product,
    /An artist must verify the rules and technical support of their chosen environment before activating real payments\./,
  );

  assert.match(readme, /test-only commerce simulation/);
  assert.match(readme, /It accepts Stripe test credentials only/);
  assert.match(readme, /No real payment is accepted and no money moves/);
  assert.match(readme, /Live commerce is unavailable in the Sites deployment/);
  assert.match(
    contract,
    /The Sites adapter is permanently `stripe-test-simulation`/,
  );
  assert.match(contract, /cannot accept real payment or move money/);
  assert.match(
    contract,
    /production URL[\s\S]*not the Stripe environment[\s\S]*permanently `stripe-test-simulation`/,
  );
  const judgeJourney = contract.match(
    /## Build Week judge journey([\s\S]*?)## Data minimization/,
  )?.[1];
  assert.ok(judgeJourney);
  assert.deepEqual(
    [...judgeJourney.matchAll(/^([0-9]+)\. /gm)].map((match) => match[1]),
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  );
  assert.match(
    contract,
    /A cancelled redirect, missing webhook, invalid signature, live-mode event, or failed Stripe status creates no access/,
  );
});

test("ownership and Sites residency language retain their exact limits", async () => {
  const [product, boundary] = await Promise.all([
    source("../PRODUCT.md"),
    source("../docs/architecture/data-and-ai-boundary.md"),
  ]);
  const ownership =
    "Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data.";
  const residency =
    "Current [Sites guidance](https://help.openai.com/en/articles/20001339) states that Sites does not support data residency or inference residency at launch. This applies to deployed Site code, D1 and R2 data and file storage, generated artifacts, and logs.";

  assert.match(
    product,
    new RegExp(ownership.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(
    boundary,
    new RegExp(ownership.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(
    product,
    new RegExp(residency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(boundary, /makes no geographic residency guarantee/);
});
