import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const vinextBinary = resolve(projectRoot, "node_modules/.bin/vinext");
const port = Number(process.env.AOP_M5_RUNTIME_VERIFY_PORT ?? 3225);
const baseUrl = `http://localhost:${port}`;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_SERVER_LOG_BYTES = 16_384;

if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error(
    "AOP_M5_RUNTIME_VERIFY_PORT must be a safe unprivileged port.",
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

async function startServer({ runtimeLab }) {
  const environment = { ...process.env, WRANGLER_LOG_PATH: "/dev/null" };
  if (runtimeLab) environment.AOP_ENABLE_RUNTIME_LAB = "1";
  else delete environment.AOP_ENABLE_RUNTIME_LAB;

  const child = spawn(
    vinextBinary,
    ["dev", "--host", "localhost", "--port", String(port), "--strictPort"],
    {
      cwd: projectRoot,
      env: environment,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = boundedAppend(output, chunk.toString("utf8"));
  });
  child.stderr.on("data", (chunk) => {
    output = boundedAppend(output, chunk.toString("utf8"));
  });

  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `The Milestone 5 verification server exited early.\n${output}`,
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
    `The Milestone 5 verification server did not become ready.\n${output}`,
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
    signal: AbortSignal.timeout(10_000),
  });
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

function mutationInit({ method, body, identity, idempotencyKey }) {
  return {
    method,
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...(identity ?? {}),
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

async function readAdminOverview(identity) {
  const response = await expectResponse("/api/admin/access", 200, {
    headers: identity,
  });
  return (await streamJson(response)).result;
}

async function beginRun() {
  const response = await expectResponse(
    "/api/runtime-lab/m5",
    201,
    mutationInit({ method: "POST", body: { action: "begin" } }),
  );
  const body = await streamJson(response);
  assert.match(body.run.runId, /^[0-9a-f-]{36}$/);
  assert.match(body.run.trackSlug, /^runtime-protected-track-[0-9a-f]{12}$/);
  assert.match(body.run.planSlug, /^runtime-access-[0-9a-f]{12}$/);
  return body.run;
}

async function exerciseJourney(run) {
  const owner = identityHeaders(run.ownerEmail, run.ownerDisplayName);
  const customer = identityHeaders(run.customerEmail, run.customerDisplayName);

  const anonymousApi = await expectResponse("/api/admin/access", 401);
  assert.equal(
    (await streamJson(anonymousApi)).error.code,
    "AUTHENTICATION_REQUIRED",
  );
  const nonOwnerApi = await expectResponse("/api/admin/access", 403, {
    headers: customer,
  });
  assert.equal((await streamJson(nonOwnerApi)).error.code, "ROLE_REQUIRED");
  await expectHtml("/admin/access", 404, undefined);
  await expectHtml("/admin/access", 404, customer);

  await expectHtml("/admin/access", 200, owner, [
    "Access plans",
    run.trackTitle,
    run.customerDisplayName,
  ]);
  const initialOverview = await readAdminOverview(owner);
  const resource = initialOverview.resources.find(
    (candidate) => candidate.resourceId === run.trackId,
  );
  assert.deepEqual(resource.allowedActions, ["view"]);
  assert.equal(
    initialOverview.customers.filter(
      (candidate) => candidate.userId === run.customerId,
    ).length,
    1,
  );

  await expectHtml(`/music/tracks/${run.trackSlug}`, 404, undefined);
  await expectHtml(`/music/tracks/${run.trackSlug}`, 404, customer);

  const planInput = {
    slug: run.planSlug,
    name: `Fictional access plan ${run.shortId}`,
    description: `One protected metadata-only track for ${run.shortId}.`,
    items: [
      {
        resourceType: "track",
        resourceId: run.trackId,
        actions: ["view"],
        remainingUses: null,
        downloadDisposition: null,
      },
    ],
  };
  const createInit = mutationInit({
    method: "POST",
    body: { plan: planInput },
    identity: owner,
    idempotencyKey: run.operationKeys.createPlan,
  });
  const createResponse = await expectResponse(
    "/api/admin/access/plans",
    201,
    createInit,
  );
  const created = await streamJson(createResponse);
  assert.equal(created.replayed, false);
  assert.equal(created.result.slug, run.planSlug);
  assert.equal(created.result.itemCount, 1);
  assert.equal(created.result.revision, 1);
  const createReplay = await streamJson(
    await expectResponse("/api/admin/access/plans", 200, createInit),
  );
  assert.equal(createReplay.replayed, true);
  assert.deepEqual(createReplay.result, created.result);

  const afterPlan = await readAdminOverview(owner);
  const plans = afterPlan.plans.filter(({ slug }) => slug === run.planSlug);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].items.length, 1);
  assert.equal(plans[0].items[0].resourceId, run.trackId);

  const grantReason = `Fictional direct access ${run.shortId}.`;
  const issueInit = mutationInit({
    method: "POST",
    body: {
      expectedPlanRevision: 1,
      grant: {
        accessPlanId: created.result.accessPlanId,
        customerUserId: run.customerId,
        startsAt: null,
        expiresAt: null,
        reason: grantReason,
      },
    },
    identity: owner,
    idempotencyKey: run.operationKeys.issuePlan,
  });
  const issueResponse = await expectResponse(
    "/api/admin/access/grants",
    201,
    issueInit,
  );
  const issued = await streamJson(issueResponse);
  assert.equal(issued.replayed, false);
  assert.equal(issued.result.state, "active");
  assert.equal(issued.result.grantCount, 1);
  assert.equal(issued.result.entitlementCount, 1);
  const issueReplay = await streamJson(
    await expectResponse("/api/admin/access/grants", 200, issueInit),
  );
  assert.equal(issueReplay.replayed, true);
  assert.deepEqual(issueReplay.result, issued.result);

  const activeOverview = await readAdminOverview(owner);
  const activeSets = activeOverview.grantSets.filter(
    ({ id }) => id === issued.result.grantSetId,
  );
  assert.equal(activeSets.length, 1);
  assert.equal(activeSets[0].state, "active");
  assert.equal(activeSets[0].entitlementCount, 1);

  const activeAccount = await expectHtml("/account/access", 200, customer, [
    "Available now",
    run.trackTitle,
    "Artist access grant",
  ]);
  assert.doesNotMatch(activeAccount, /No protected resources are available\./i);
  await expectHtml(`/music/tracks/${run.trackSlug}`, 200, customer, [
    run.trackTitle,
    "Metadata-only protected track",
  ]);
  await expectHtml(`/music/tracks/${run.trackSlug}`, 404, undefined);

  const revokeInit = mutationInit({
    method: "POST",
    body: { expectedRevision: 1 },
    identity: owner,
    idempotencyKey: run.operationKeys.revokeGrant,
  });
  const revokePath = `/api/admin/access/grants/${encodeURIComponent(
    issued.result.grantSetId,
  )}/revoke`;
  const revokeResponse = await expectResponse(revokePath, 200, revokeInit);
  const revoked = await streamJson(revokeResponse);
  assert.equal(revoked.replayed, false);
  assert.equal(revoked.result.state, "revoked");
  assert.equal(revoked.result.revision, 2);
  const revokeReplay = await streamJson(
    await expectResponse(revokePath, 200, revokeInit),
  );
  assert.equal(revokeReplay.replayed, true);
  assert.deepEqual(revokeReplay.result, revoked.result);

  const revokedOverview = await readAdminOverview(owner);
  const revokedSet = revokedOverview.grantSets.find(
    ({ id }) => id === issued.result.grantSetId,
  );
  assert.equal(revokedSet.state, "revoked");
  assert.equal(revokedSet.entitlementCount, 1);
  await expectHtml(`/music/tracks/${run.trackSlug}`, 404, customer);
  await expectHtml("/account/access", 200, customer, [
    "No protected resources are available.",
    "Grant history",
    "Entitlement history",
    run.trackTitle,
    "revoked",
  ]);

  const labState = await streamJson(
    await expectResponse(
      `/api/runtime-lab/m5?run=${encodeURIComponent(run.runId)}`,
      200,
    ),
  );
  assert.equal(labState.state.grantSet.id, issued.result.grantSetId);
  assert.equal(labState.state.grantSet.state, "revoked");
  assert.deepEqual(labState.state.artifacts, {
    proofs: 1,
    users: 1,
    profiles: 1,
    roles: 1,
    tracks: 1,
    trackRevisions: 1,
    accessPlans: 1,
    accessPlanItems: 1,
    accessGrantSets: 1,
    accessGrants: 1,
    entitlements: 1,
    auditEvents: 3,
  });

  return Object.freeze({
    accessPlanId: created.result.accessPlanId,
    grantSetId: issued.result.grantSetId,
  });
}

async function cleanupRun(run) {
  const response = await expectResponse(
    "/api/runtime-lab/m5",
    200,
    mutationInit({ method: "DELETE", body: { runId: run.runId } }),
  );
  const body = await streamJson(response);
  assert.deepEqual(body.cleanup, {
    restored: true,
    retainedVerificationRows: 0,
    baselineCountsRestored: true,
    r2ObjectsTouched: 0,
    temporaryFilesCreated: 0,
  });
  await expectResponse(
    `/api/runtime-lab/m5?run=${encodeURIComponent(run.runId)}`,
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
              "The Milestone 5 journey and cleanup both failed.",
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

if (journeyError) throw journeyError;
assert.ok(run);
assert.ok(result);
assert.ok(cleanup);

try {
  server = await startServer({ runtimeLab: false });
  await expectResponse(
    `/api/runtime-lab/m5?run=${encodeURIComponent(run.runId)}`,
    404,
  );
  await expectResponse(
    "/api/runtime-lab/m5",
    404,
    mutationInit({ method: "POST", body: { action: "begin" } }),
  );
} finally {
  if (server) await stopServer(server);
}

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    anonymousAdminApi: 401,
    nonOwnerAdminApi: 403,
    protectedTrackBeforeGrant: 404,
    protectedTrackDuringGrant: 200,
    protectedTrackAfterRevoke: 404,
    accessPlanReplay: "idempotent",
    accessGrantReplay: "idempotent",
    accessRevocationReplay: "idempotent",
    customerHistoryAfterRevoke: "retained",
    runtimeLabDefault: "off",
    retainedVerificationRows: cleanup.retainedVerificationRows,
    baselineCountsRestored: cleanup.baselineCountsRestored,
    r2ObjectsTouched: cleanup.r2ObjectsTouched,
    temporaryFilesCreated: cleanup.temporaryFilesCreated,
  })}\n`,
);
