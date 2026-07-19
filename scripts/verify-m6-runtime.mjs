import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const vinextBinary = resolve(projectRoot, "node_modules/.bin/vinext");
const port = Number(process.env.AOP_M6_RUNTIME_VERIFY_PORT ?? 3226);
const baseUrl = `http://localhost:${port}`;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_SERVER_LOG_BYTES = 16_384;
const TEST_PUBLISHABLE_KEY = "pk_test_AopM6RuntimeFictional001";
const TEST_SECRET_KEY = "sk_test_AopM6RuntimeFictional001";
const TEST_WEBHOOK_SECRET = "whsec_AopM6RuntimeFictional001";
let latestServerOutput = "";

if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error(
    "AOP_M6_RUNTIME_VERIFY_PORT must be a safe unprivileged port.",
  );
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function boundedAppend(current, chunk) {
  const combined = `${current}${chunk}`;
  return combined.length <= MAX_SERVER_LOG_BYTES
    ? combined
    : combined.slice(-MAX_SERVER_LOG_BYTES);
}

function sanitizedChildEnvironment(runtimeLab) {
  const environment = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "SHELL",
    "TERM",
    "CI",
    "NO_COLOR",
    "FORCE_COLOR",
    "CODEX_SANDBOX",
  ]) {
    if (typeof process.env[key] === "string") {
      environment[key] = process.env[key];
    }
  }
  environment.WRANGLER_LOG_PATH = "/dev/null";
  environment.WRANGLER_WRITE_LOGS = "false";
  environment.CLOUDFLARE_INCLUDE_PROCESS_ENV = "true";
  environment.STRIPE_PUBLISHABLE_KEY = TEST_PUBLISHABLE_KEY;
  environment.STRIPE_SECRET_KEY = TEST_SECRET_KEY;
  environment.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  if (runtimeLab) environment.AOP_ENABLE_RUNTIME_LAB = "1";
  return environment;
}

async function startServer({ runtimeLab }) {
  const child = spawn(
    vinextBinary,
    ["dev", "--host", "localhost", "--port", String(port), "--strictPort"],
    {
      cwd: projectRoot,
      env: sanitizedChildEnvironment(runtimeLab),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = boundedAppend(output, chunk.toString("utf8"));
    latestServerOutput = output;
  });
  child.stderr.on("data", (chunk) => {
    output = boundedAppend(output, chunk.toString("utf8"));
    latestServerOutput = output;
  });

  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `The Milestone 6 verification server exited early.\n${output}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return child;
    } catch {
      // The owned strict verification port is still opening.
    }
    await delay(100);
  }

  await stopServer(child);
  throw new Error(
    `The Milestone 6 verification server did not become ready.\n${output}`,
  );
}

async function stopServer(child) {
  if (child.exitCode !== null) return;

  const exited = once(child, "exit");
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  const completed = await Promise.race([
    exited.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!completed && child.exitCode === null) {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await once(child, "exit");
  }
}

async function streamText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let value = "";
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("A verification response exceeded the in-memory limit.");
    }
    value += decoder.decode(next.value, { stream: true });
  }
  return value + decoder.decode();
}

async function streamJson(response) {
  const text = await streamText(response);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${response.status} ${response.url} did not return valid JSON.`,
    );
  }
}

async function expectResponse(path, expectedStatus, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== expectedStatus) {
    const detail = await streamText(response);
    assert.equal(
      response.status,
      expectedStatus,
      `${init.method ?? "GET"} ${path} returned ${response.status}: ${detail.slice(0, 2_000)}`,
    );
  }
  assert.equal(
    response.status,
    expectedStatus,
    `${init.method ?? "GET"} ${path} returned ${response.status}`,
  );
  return response;
}

function identityHeaders(email, displayName) {
  return {
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(displayName),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

function mutationInit({ method, body }) {
  return {
    method,
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

async function expectHtml(path, expectedStatus, identity, required = []) {
  const response = await expectResponse(path, expectedStatus, {
    headers: identity,
  });
  const text = await streamText(response);
  for (const fragment of required) {
    assert.match(
      text,
      new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${path} did not contain ${fragment}`,
    );
  }
  return text;
}

const TEST_MODE_COPY = [
  "Stripe Test Mode",
  "No real payment will be accepted.",
];

async function beginRun() {
  const response = await expectResponse(
    "/api/runtime-lab/m6",
    201,
    mutationInit({ method: "POST", body: { action: "begin" } }),
  );
  const body = await streamJson(response);
  assert.match(body.run.runId, /^[0-9a-f-]{36}$/);
  assert.match(body.run.trackSlug, /^runtime-commerce-track-[0-9a-f]{12}$/);
  assert.match(
    body.run.commerceProductSlug,
    /^runtime-test-subscription-[0-9a-f]{12}$/,
  );
  assert.equal(body.run.amountMinor, 900);
  assert.equal(body.run.currency, "USD");
  return body.run;
}

async function readRunState(run) {
  const response = await expectResponse(
    `/api/runtime-lab/m6?run=${encodeURIComponent(run.runId)}`,
    200,
  );
  return (await streamJson(response)).state;
}

function applicationMetadata(run) {
  return {
    aop_checkout_id: run.checkoutId,
    aop_product_id: run.commerceProductId,
    aop_customer_id: run.customerId,
  };
}

function checkoutPayload(run, timestamp) {
  return {
    id: run.checkoutEventId,
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    created: timestamp,
    data: {
      object: {
        id: run.stripeCheckoutSessionId,
        object: "checkout.session",
        livemode: false,
        client_reference_id: run.checkoutId,
        mode: "subscription",
        status: "complete",
        payment_status: "paid",
        customer: run.stripeCustomerId,
        subscription: run.stripeSubscriptionId,
        amount_total: run.amountMinor,
        currency: run.currency.toLowerCase(),
        metadata: applicationMetadata(run),
      },
    },
  };
}

function invoicePayload(
  run,
  timestamp,
  {
    eventId = run.invoiceEventId,
    invoiceId = run.invoiceId,
    livemode = false,
  } = {},
) {
  return {
    id: eventId,
    object: "event",
    type: "invoice.paid",
    livemode,
    created: timestamp,
    data: {
      object: {
        id: invoiceId,
        object: "invoice",
        livemode,
        customer: run.stripeCustomerId,
        status: "paid",
        paid: true,
        amount_paid: run.amountMinor,
        amount_due: run.amountMinor,
        currency: run.currency.toLowerCase(),
        billing_reason: "subscription_create",
        period_start: timestamp,
        period_end: timestamp + 31 * 24 * 60 * 60,
        parent: {
          type: "subscription_details",
          subscription_details: {
            subscription: run.stripeSubscriptionId,
            metadata: applicationMetadata(run),
          },
        },
      },
    },
  };
}

function signedWebhook(payload, webhookSecret = TEST_WEBHOOK_SECRET) {
  const timestamp = payload.created;
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return Object.freeze({
    rawBody,
    signatureHeader: `t=${timestamp},v1=${signature}`,
  });
}

async function postWebhook(signed, expectedStatus) {
  const response = await expectResponse(
    "/api/commerce/webhooks/stripe",
    expectedStatus,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signed.signatureHeader,
      },
      body: signed.rawBody,
    },
  );
  return streamJson(response);
}

function assertNoFulfillment(artifacts) {
  for (const key of [
    "orders",
    "orderItems",
    "fulfillmentEvents",
    "memberships",
    "subscriptions",
    "subscriptionEvents",
    "creditAccounts",
    "creditGrantLots",
    "creditLedgerEntries",
    "entitlements",
  ]) {
    assert.equal(artifacts[key], 0, `${key} must remain empty`);
  }
}

async function exerciseJourney(run) {
  const owner = identityHeaders(run.ownerEmail, run.ownerDisplayName);
  const customer = identityHeaders(run.customerEmail, run.customerDisplayName);
  const timestamp = Math.floor(Date.now() / 1_000);

  const initial = await readRunState(run);
  assertNoFulfillment(initial.artifacts);
  assert.equal(initial.artifacts.commerceEvents, 0);
  assert.equal(initial.artifacts.mediaObjects, 0);
  assert.equal(initial.artifacts.mediaDerivatives, 0);
  assert.equal(initial.checkout.status, "open");
  assert.equal(
    initial.modules.every(({ active }) => active === 1),
    true,
  );

  await expectHtml("/commerce", 200, undefined, [
    ...TEST_MODE_COPY,
    run.commerceProductName,
  ]);
  await expectHtml(`/music/tracks/${run.trackSlug}`, 404, undefined);
  await expectHtml(`/music/tracks/${run.trackSlug}`, 404, customer);
  await expectHtml(
    `/commerce/return?checkout=${encodeURIComponent(run.checkoutId)}`,
    200,
    customer,
    [...TEST_MODE_COPY, "Waiting for verified result"],
  );

  const checkoutWebhook = signedWebhook(checkoutPayload(run, timestamp));
  const checkout = await postWebhook(checkoutWebhook, 200);
  assert.equal(checkout.received, true);
  assert.equal(checkout.result.status, "ignored");
  assert.equal(checkout.result.resultType, "awaiting-subscription-invoice");
  assert.equal(checkout.result.replayed, false);

  const afterCheckout = await readRunState(run);
  assertNoFulfillment(afterCheckout.artifacts);
  assert.equal(afterCheckout.artifacts.commerceEvents, 1);
  assert.equal(afterCheckout.checkout.status, "completed");
  assert.equal(afterCheckout.checkout.stripe_environment, "test");
  assert.equal(afterCheckout.checkout.livemode, 0);
  await expectHtml(`/music/tracks/${run.trackSlug}`, 404, customer);

  const invoiceWebhook = signedWebhook(invoicePayload(run, timestamp));
  const invoice = await postWebhook(invoiceWebhook, 200);
  assert.equal(invoice.received, true);
  assert.equal(invoice.result.status, "fulfilled");
  assert.equal(invoice.result.resultType, "initial-subscription");
  assert.equal(invoice.result.replayed, false);
  assert.equal(invoice.result.stripeEnvironment, "test");
  assert.equal(invoice.result.livemode, false);

  const fulfilled = await readRunState(run);
  assert.equal(fulfilled.artifacts.commerceEvents, 2);
  assert.equal(fulfilled.artifacts.orders, 1);
  assert.equal(fulfilled.artifacts.orderItems, 1);
  assert.equal(fulfilled.artifacts.fulfillmentEvents, 1);
  assert.equal(fulfilled.artifacts.memberships, 1);
  assert.equal(fulfilled.artifacts.subscriptions, 1);
  assert.equal(fulfilled.artifacts.subscriptionEvents, 1);
  assert.equal(fulfilled.artifacts.creditAccounts, 2);
  assert.equal(fulfilled.artifacts.creditGrantLots, 2);
  assert.equal(fulfilled.artifacts.creditLedgerEntries, 2);
  assert.equal(fulfilled.artifacts.entitlements, 1);
  assert.equal(fulfilled.artifacts.mediaObjects, 0);
  assert.equal(fulfilled.artifacts.mediaDerivatives, 0);
  assert.equal(fulfilled.order.status, "fulfilled");
  assert.equal(fulfilled.order.stripe_environment, "test");
  assert.equal(fulfilled.order.livemode, 0);
  assert.equal(fulfilled.subscription.state, "active");
  assert.equal(fulfilled.subscription.stripe_environment, "test");
  assert.equal(fulfilled.subscription.livemode, 0);
  assert.deepEqual(fulfilled.balances, {
    downloadAvailable: 2,
    licenseAvailable: 1,
  });

  await expectHtml(`/music/tracks/${run.trackSlug}`, 200, customer, [
    run.trackTitle,
    "Metadata-only protected track",
  ]);
  await expectHtml(`/music/tracks/${run.trackSlug}`, 404, undefined);
  await expectHtml(
    `/commerce/return?checkout=${encodeURIComponent(run.checkoutId)}`,
    200,
    customer,
    [...TEST_MODE_COPY, "Test order complete", run.commerceProductName],
  );
  await expectHtml("/account/orders", 200, customer, [
    ...TEST_MODE_COPY,
    run.commerceProductName,
    "Fulfilled",
  ]);
  await expectHtml("/account/memberships", 200, customer, [
    ...TEST_MODE_COPY,
    run.subscriptionPlanName,
    "active",
  ]);
  await expectHtml("/account/credits", 200, customer, [
    ...TEST_MODE_COPY,
    "Balances reconciled",
    "Download credits",
    "License credits",
  ]);
  await expectHtml("/account/access", 200, customer, [
    run.trackTitle,
    "Subscription entitlement",
  ]);
  await expectHtml("/admin/commerce", 200, owner, [
    ...TEST_MODE_COPY,
    run.commerceProductName,
    run.customerDisplayName,
    "Signed event evidence",
  ]);
  await expectHtml("/admin/memberships", 200, owner, [
    ...TEST_MODE_COPY,
    run.subscriptionPlanName,
    run.customerDisplayName,
  ]);
  await expectHtml(
    `/admin/credits?customer=${encodeURIComponent(run.customerId)}`,
    200,
    owner,
    [...TEST_MODE_COPY, run.customerDisplayName, "Balances reconciled"],
  );

  const replay = await postWebhook(invoiceWebhook, 200);
  assert.equal(replay.result.replayed, true);
  assert.equal(replay.result.orderId, invoice.result.orderId);
  const afterReplay = await readRunState(run);
  assert.deepEqual(afterReplay, fulfilled);

  const beforeLive = await readRunState(run);
  const liveWebhook = signedWebhook(
    invoicePayload(run, timestamp, {
      eventId: run.liveEventId,
      invoiceId: run.liveInvoiceId,
      livemode: true,
    }),
  );
  const live = await postWebhook(liveWebhook, 422);
  assert.equal(live.error.code, "STRIPE_LIVE_EVENT_REJECTED");
  assert.deepEqual(await readRunState(run), beforeLive);

  const invalidPayload = invoicePayload(run, timestamp, {
    eventId: run.invalidSignatureEventId,
    invoiceId: run.invalidSignatureInvoiceId,
  });
  const invalidBody = JSON.stringify(invalidPayload);
  const invalid = await postWebhook(
    {
      rawBody: invalidBody,
      signatureHeader: `t=${timestamp},v1=${"0".repeat(64)}`,
    },
    400,
  );
  assert.equal(invalid.error.code, "STRIPE_WEBHOOK_SIGNATURE_INVALID");
  assert.deepEqual(await readRunState(run), beforeLive);

  return Object.freeze({
    checkoutEvent: "awaited-invoice",
    invoiceEvent: "fulfilled-once",
    replay: "idempotent",
    liveEvent: "rejected-before-write",
    invalidSignature: "rejected-before-write",
    protectedTrack: "visible-after-entitlement",
    customerEvidence: "visible",
    ownerEvidence: "visible",
  });
}

async function cleanupRun(run) {
  const response = await expectResponse(
    "/api/runtime-lab/m6",
    200,
    mutationInit({ method: "DELETE", body: { runId: run.runId } }),
  );
  const body = await streamJson(response);
  assert.deepEqual(body.cleanup, {
    restored: true,
    retainedVerificationRows: 0,
    baselineCountsRestored: true,
    moduleStateRestored: true,
    r2ObjectsTouched: 0,
    mediaRowsCreated: 0,
    temporaryFilesCreated: 0,
  });
  await expectResponse(
    `/api/runtime-lab/m6?run=${encodeURIComponent(run.runId)}`,
    404,
  );
  return body.cleanup;
}

let server;
let run;
let result;
let cleanup;
let journeyError;

try {
  server = await startServer({ runtimeLab: true });
  try {
    run = await beginRun();
    result = await exerciseJourney(run);
  } catch (error) {
    journeyError = error;
  } finally {
    if (run?.runId) {
      try {
        cleanup = await cleanupRun(run);
      } catch (error) {
        journeyError = journeyError
          ? new AggregateError(
              [journeyError, error],
              "The Milestone 6 journey and cleanup both failed.",
            )
          : error;
      }
    }
  }
} finally {
  if (server) {
    await stopServer(server);
    server = undefined;
  }
}

if (journeyError) {
  throw new AggregateError(
    [journeyError, new Error(`Bounded vinext output:\n${latestServerOutput}`)],
    "The Milestone 6 runtime verification failed.",
  );
}
assert.ok(run);
assert.ok(result);
assert.ok(cleanup);

try {
  server = await startServer({ runtimeLab: false });
  await expectResponse(
    `/api/runtime-lab/m6?run=${encodeURIComponent(run.runId)}`,
    404,
  );
  await expectResponse(
    "/api/runtime-lab/m6",
    404,
    mutationInit({ method: "POST", body: { action: "begin" } }),
  );
} finally {
  if (server) await stopServer(server);
}

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    ...result,
    runtimeLabDefault: "off",
    retainedVerificationRows: cleanup.retainedVerificationRows,
    baselineCountsRestored: cleanup.baselineCountsRestored,
    moduleStateRestored: cleanup.moduleStateRestored,
    r2ObjectsTouched: cleanup.r2ObjectsTouched,
    mediaRowsCreated: cleanup.mediaRowsCreated,
    temporaryFilesCreated: cleanup.temporaryFilesCreated,
  })}\n`,
);
