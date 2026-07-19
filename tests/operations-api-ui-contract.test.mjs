import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("operations routes and page require owner authority and expose only bounded actions", async () => {
  const [page, rootRoute, accessRoute, retryRoute, read, write, component] =
    await Promise.all([
      source("../app/admin/operations/page.tsx"),
      source("../app/api/admin/operations/route.ts"),
      source("../app/api/admin/operations/access-explanation/route.ts"),
      source("../app/api/admin/operations/jobs/[jobId]/retry/route.ts"),
      source("../db/operations-read.ts"),
      source("../db/operations-write.ts"),
      source("../components/operations/OperationsWorkspace.tsx"),
    ]);
  for (const route of [rootRoute, accessRoute, retryRoute]) {
    assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  }
  assert.match(page, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(
    page,
    /telemetryActive={activeModules\.includes\("telemetry"\)}/,
  );
  assert.match(read, /redactForJson/);
  assert.match(read, /projectSafeAuditJson/);
  assert.match(read, /bucket\.list/);
  assert.doesNotMatch(
    component,
    /objectKey|stripeEvent|providerObject|paymentIntent|card/i,
  );
  assert.match(component, /\/admin\/telemetry/);
  assert.match(write, /operations\.media_job\.retry/);
  assert.match(write, /media_job_attempts/);
  assert.doesNotMatch(write, /DELETE FROM|\.put\(|\.delete\(/i);
});

test("owner-only telemetry navigation stays absent for editors and inactive operations", async () => {
  const [layout, page, component] = await Promise.all([
    source("../app/admin/layout.tsx"),
    source("../app/admin/operations/page.tsx"),
    source("../components/operations/OperationsWorkspace.tsx"),
  ]);
  assert.match(layout, /owner \|\| key !== "telemetry"/);
  assert.match(page, /activeModules\.includes\("telemetry"\)/);
  assert.match(
    component,
    /\{telemetryActive \? \([\s\S]*href="\/admin\/telemetry"[\s\S]*\) : null\}/,
  );
});

test("customer detail keeps Test Mode visible and joins contact only by submitter user ID", async () => {
  const [read, page, component, customerList] = await Promise.all([
    source("../db/customer-admin-read.ts"),
    source("../app/admin/customers/[userId]/page.tsx"),
    source("../components/admin/customers/CustomerDetailWorkspace.tsx"),
    source("../components/admin/access/CustomerWorkspace.tsx"),
  ]);
  assert.match(read, /contact_submissions WHERE submitter_user_id = \?/);
  assert.doesNotMatch(read, /normalized_email\s*=|contact_submissions\.email/);
  assert.match(
    read,
    /credit_grant_lots\.customer_user_id = credit_accounts\.customer_user_id/,
  );
  assert.match(read, /SELECT product_type FROM order_items/);
  assert.doesNotMatch(read, /JOIN order_items ON/);
  assert.match(
    read,
    /json_extract\(\s*license_requests\.terms_snapshot_json,\s*'\$\.track\.title'/,
  );
  assert.doesNotMatch(
    read,
    /track_revisions\.id = COALESCE\(tracks\.published_revision_id/,
  );
  assert.match(page, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(component, /Stripe Test Mode/);
  assert.match(component, /No real payment will be accepted\./);
  assert.match(component, /data-stripe-test-mode="true"/);
  assert.match(customerList, /View relationship/);
  assert.doesNotMatch(
    component,
    /stripeCustomer|stripeSubscription|paymentIntent|providerObject|card/i,
  );
});
