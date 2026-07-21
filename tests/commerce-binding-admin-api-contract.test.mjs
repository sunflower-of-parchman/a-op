import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeFile = new URL(
  "../app/api/admin/commerce/bindings/[intentKey]/route.ts",
  import.meta.url,
);
const repositoryFile = new URL(
  "../db/commerce-binding-write.ts",
  import.meta.url,
);

test("commerce binding is an owner-only exact Test-mode operation", async () => {
  const [route, repository] = await Promise.all([
    readFile(routeFile, "utf8"),
    readFile(repositoryFile, "utf8"),
  ]);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /export async function POST\(/);
  assert.match(route, /await readJsonMutation\(request\)/);
  assert.match(route, /requireIdempotencyKey\(request\)/);
  assert.match(route, /\["stripePriceId"\]/);
  assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  assert.match(route, /bindCommerceIntent\(/);
  assert.doesNotMatch(route, /"editor"|commerce\.write/);

  assert.match(repository, /commerce\.binding-intent\.bind/);
  assert.match(repository, /stripe_environment[^]*?'test'/);
  assert.match(repository, /livemode[^]*?0/);
  assert.match(repository, /binding_state = 'bound'/);
  assert.doesNotMatch(
    `${route}\n${repository}`,
    /fetch\(|checkout\.stripe\.com|Authorization:\s*Bearer|sk_(?:test|live)_/,
  );
});
