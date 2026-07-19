import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const RUNTIME_DIRECTORIES = ["app", "components", "db", "lib", "worker"];
const SOURCE_EXTENSION = /\.(?:ts|tsx|js|mjs)$/;
const FORBIDDEN_RUNTIME_PATTERNS = [
  /\bcardNumber\b/i,
  /\bcard_number\b/i,
  /\bcardholder(?:Name)?\b/i,
  /\b(?:cvc|cvv)\b/i,
  /\bexpiry(?:Month|Year)\b/i,
  /\bexpiry_(?:month|year)\b/i,
  /\bexpiration_(?:month|year)\b/i,
  /\bpaymentMethodData\b/i,
  /\bpayment_method_data\b/i,
  /\bbillingAddress\b/i,
  /\bbilling_address\b/i,
  /\bclient_secret\b/i,
  /autocomplete\s*=\s*["']cc-/i,
  /name\s*=\s*["'](?:card|card-number|cardNumber|cvc|cvv|expiry)/i,
  /@stripe\/stripe-js|<PaymentElement\b|<CardElement\b/i,
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (SOURCE_EXTENSION.test(entry.name)) files.push(path);
  }
  return files;
}

test("runtime source and D1 schema contain no payment-card collection field", async () => {
  const files = (
    await Promise.all(RUNTIME_DIRECTORIES.map(sourceFiles))
  ).flat();
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
      assert.doesNotMatch(contents, pattern, `${file} matched ${pattern}`);
    }
  }
});

test("the React application redirects to hosted Checkout without Stripe payment elements", async () => {
  const [checkoutAction, checkoutRoute] = await Promise.all([
    readFile("components/commerce/CommerceCheckoutButton.tsx", "utf8"),
    readFile("app/api/commerce/checkout/route.ts", "utf8"),
  ]);
  assert.match(checkoutAction, /window\.location\.assign\(checkoutUrl\)/);
  assert.match(checkoutRoute, /createStripeTestCheckoutSession/);
  assert.doesNotMatch(
    `${checkoutAction}\n${checkoutRoute}`,
    /@stripe\/stripe-js|PaymentElement|CardElement|payment_method_data/i,
  );
});
