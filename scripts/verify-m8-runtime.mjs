import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const vinextBinary = resolve(projectRoot, "node_modules/.bin/vinext");
const port = Number(process.env.AOP_M8_RUNTIME_VERIFY_PORT ?? 3228);
const baseUrl = `http://localhost:${port}`;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_SERVER_LOG_BYTES = 16_384;
let latestServerOutput = "";

if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error(
    "AOP_M8_RUNTIME_VERIFY_PORT must be a safe unprivileged port.",
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
        `The Milestone 8 verification server exited early.\n${output}`,
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
    `The Milestone 8 verification server did not become ready.\n${output}`,
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

function mutationInit({ method, body, identity, idempotencyKey, cookie }) {
  return {
    method,
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
      ...(identity ?? {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  };
}

async function expectHtml(path, expectedStatus, identity, required = []) {
  const response = await expectResponse(path, expectedStatus, {
    headers: identity,
  });
  const text = await streamText(response);
  const observableText = text.replaceAll("<!-- -->", "");
  for (const fragment of required) {
    assert.match(
      observableText,
      new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${path} did not contain ${fragment}`,
    );
  }
  return text;
}

function cookieHeader(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  const pairs = values
    .flatMap((value) => [
      ...value.matchAll(/\b(aop_telemetry_(?:consent|session)=[^;,\s]+)/g),
    ])
    .map((match) => match[1]);
  assert.equal(new Set(pairs.map((pair) => pair.split("=")[0])).size, 2);
  return pairs.join("; ");
}

async function beginRun() {
  const response = await expectResponse(
    "/api/runtime-lab/m8",
    201,
    mutationInit({ method: "POST", body: { action: "begin" } }),
  );
  const body = await streamJson(response);
  assert.match(body.run.runId, /^[0-9a-f-]{36}$/);
  assert.match(body.run.ownerEmail, /^m8-owner-[0-9a-f]{12}@a-op\.invalid$/);
  assert.match(
    body.run.customerEmail,
    /^m8-customer-[0-9a-f]{12}@a-op\.invalid$/,
  );
  assert.equal(body.run.legalDocumentId, "privacy");
  return body.run;
}

async function readRunState(run) {
  const response = await expectResponse(
    `/api/runtime-lab/m8?run=${encodeURIComponent(run.runId)}`,
    200,
  );
  return (await streamJson(response)).state;
}

function legalSetupAnswers() {
  return {
    customerAccounts: true,
    identityProvider: "Sign in with ChatGPT",
    publicContactEmail: "",
    contactSubmissions: true,
    telemetryMode: "consent_required",
    telemetryRetentionDays: 30,
    retentionStatement:
      "Fictional source events are retained for 30 days for this runtime journey.",
    downloads: true,
    protectedAccess: true,
    memberships: true,
    subscriptions: true,
    licensing: true,
    stripeEnvironment: "test",
    stripeCheckout: "Stripe-hosted Test Checkout",
    realPaymentsAccepted: false,
    paymentCardDataHandledByAop: false,
    structuredDataStorage: "Sites-provided D1",
    fileStorage: "Sites-provided R2",
    sitesResidencyAtLaunch: "not_supported",
    services: ["OpenAI Sites", "Stripe Test Mode"],
  };
}

async function exerciseAuthorityAndOperations(run, owner, customer) {
  const anonymousApi = await expectResponse("/api/admin/operations", 401);
  assert.equal(
    (await streamJson(anonymousApi)).error.code,
    "AUTHENTICATION_REQUIRED",
  );
  const customerApi = await expectResponse("/api/admin/operations", 403, {
    headers: customer,
  });
  assert.equal((await streamJson(customerApi)).error.code, "ROLE_REQUIRED");
  await expectHtml("/admin/operations", 404, undefined);
  await expectHtml("/admin/operations", 404, customer);

  const response = await expectResponse("/api/admin/operations", 200, {
    headers: owner,
  });
  const text = await streamText(response);
  const body = JSON.parse(text);
  assert.equal(body.result.media.status, "attention");
  assert.equal(body.result.jobs.status, "attention");
  assert.equal(
    body.result.recentJobs.some((job) => job.id === run.mediaJobId),
    true,
  );
  assert.equal(
    body.result.recentFailures.some(
      (failure) =>
        failure.id === run.operationalFailureId &&
        failure.code === run.operationalFailureCode,
    ),
    true,
  );
  const diagnosticAudit = body.result.recentAuditEvents.find(
    (event) => event.id === run.auditId,
  );
  assert.ok(diagnosticAudit);
  assert.match(JSON.stringify(diagnosticAudit), /\[REDACTED\]/);
  assert.doesNotMatch(text, new RegExp(run.auditMarker));
  assert.equal(body.result.storage.objectCount >= 0, true);

  await expectHtml("/admin/operations", 200, owner, [
    "System state and recovery",
    run.mediaJobId,
    run.operationalFailureCode,
    "Operational failures",
    "Redacted audit projection",
  ]);
  return Object.freeze({
    ownerOnly: "enforced",
    failedMedia: "visible",
    operationalFailure: "visible",
    auditProjection: "redacted",
    r2Diagnostic: "count-only",
  });
}

async function exerciseTelemetry(run, owner, customer) {
  const initial = await streamJson(await expectResponse("/api/telemetry", 200));
  assert.equal(initial.configuration.active, true);
  assert.equal(initial.configuration.collectionMode, "consent_required");
  assert.equal(initial.configuration.consent, "undecided");
  assert.equal(initial.configuration.collecting, false);

  const declined = await streamJson(
    await expectResponse(
      "/api/telemetry/events",
      202,
      mutationInit({
        method: "POST",
        body: {
          eventName: "music-view",
          resourceType: "site",
          resourceId: "site",
        },
        identity: customer,
      }),
    ),
  );
  assert.deepEqual(declined.result, {
    recorded: false,
    reason: "consent-required",
  });
  assert.equal((await readRunState(run)).artifacts.telemetryEvents, 0);

  const consentResponse = await expectResponse(
    "/api/telemetry/consent",
    200,
    mutationInit({
      method: "POST",
      body: { decision: "granted" },
      identity: customer,
    }),
  );
  const consentBody = await streamJson(consentResponse.clone());
  assert.equal(consentBody.configuration.consent, "granted");
  assert.equal(consentBody.configuration.collecting, true);
  const cookie = cookieHeader(consentResponse);

  const configured = await streamJson(
    await expectResponse("/api/telemetry", 200, {
      headers: { ...customer, cookie },
    }),
  );
  assert.equal(configured.configuration.consent, "granted");
  assert.equal(configured.configuration.collecting, true);

  const recorded = await streamJson(
    await expectResponse(
      "/api/telemetry/events",
      201,
      mutationInit({
        method: "POST",
        body: {
          eventName: "music-view",
          resourceType: "site",
          resourceId: "site",
        },
        identity: customer,
        cookie,
      }),
    ),
  );
  assert.deepEqual(recorded.result, { recorded: true, reason: "recorded" });
  assert.equal((await readRunState(run)).artifacts.telemetryEvents, 1);

  const day = new Date().toISOString().slice(0, 10);
  const telemetryPath = `/admin/telemetry?from=${day}&to=${day}`;
  await expectHtml(telemetryPath, 404, customer);
  await expectHtml(telemetryPath, 200, owner, [
    "Audience activity",
    "Consent required",
    "music-view",
    "site",
    "live",
  ]);
  return Object.freeze({
    consentBoundary: "visible-and-enforced",
    sourceEvent: "recorded-once",
    ownerAggregate: "visible",
  });
}

async function exerciseLegal(run, owner, customer) {
  const customerRead = await expectResponse(
    `/api/admin/legal/${run.legalDocumentId}`,
    403,
    { headers: customer },
  );
  assert.equal((await streamJson(customerRead)).error.code, "ROLE_REQUIRED");
  await expectHtml("/admin/legal", 404, customer);

  const initial = await streamJson(
    await expectResponse(`/api/admin/legal/${run.legalDocumentId}`, 200, {
      headers: owner,
    }),
  );
  const initialDocument = initial.document;
  assert.ok(initialDocument);
  const draftRequest = mutationInit({
    method: "PUT",
    body: {
      expectedRevision: initialDocument.revision,
      document: {
        documentId: run.legalDocumentId,
        title: run.legalTitle,
        introduction: run.legalIntroduction,
        bodyText: run.legalBody,
        setupAnswers: legalSetupAnswers(),
      },
    },
    identity: owner,
    idempotencyKey: `m8-${run.runId}-legal-draft`,
  });
  const saved = await streamJson(
    await expectResponse(
      `/api/admin/legal/${run.legalDocumentId}`,
      201,
      draftRequest,
    ),
  );
  assert.equal(saved.replayed, false);
  assert.equal(saved.result.version, initialDocument.currentVersion + 1);
  assert.equal(saved.result.revision, initialDocument.revision + 1);
  const replay = await streamJson(
    await expectResponse(
      `/api/admin/legal/${run.legalDocumentId}`,
      200,
      draftRequest,
    ),
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, saved.result);

  const unapproved = await streamJson(
    await expectResponse(
      `/api/admin/legal/${run.legalDocumentId}/publish`,
      409,
      mutationInit({
        method: "POST",
        body: {
          expectedRevision: saved.result.revision,
          expectedDraftVersionId: saved.result.draftVersionId,
        },
        identity: owner,
        idempotencyKey: `m8-${run.runId}-early-publication`,
      }),
    ),
  );
  assert.equal(unapproved.error.code, "LEGAL_APPROVAL_REQUIRED");

  await expectHtml(`/admin/legal/${run.legalDocumentId}`, 200, owner, [
    run.legalTitle,
    run.legalBody,
    "Version history",
    `Version ${saved.result.version}`,
    "Review required",
  ]);

  const approved = await streamJson(
    await expectResponse(
      `/api/admin/legal/${run.legalDocumentId}/approve`,
      200,
      mutationInit({
        method: "POST",
        body: {
          expectedRevision: saved.result.revision,
          expectedDraftVersionId: saved.result.draftVersionId,
        },
        identity: owner,
        idempotencyKey: `m8-${run.runId}-legal-approval`,
      }),
    ),
  );
  assert.equal(approved.replayed, false);
  assert.equal(approved.result.approvedVersionId, saved.result.draftVersionId);

  const published = await streamJson(
    await expectResponse(
      `/api/admin/legal/${run.legalDocumentId}/publish`,
      200,
      mutationInit({
        method: "POST",
        body: {
          expectedRevision: approved.result.revision,
          expectedDraftVersionId: saved.result.draftVersionId,
        },
        identity: owner,
        idempotencyKey: `m8-${run.runId}-legal-publication`,
      }),
    ),
  );
  assert.equal(published.replayed, false);
  assert.equal(
    published.result.publishedVersionId,
    saved.result.draftVersionId,
  );

  await expectHtml(`/${run.legalDocumentId}`, 200, undefined, [
    run.legalTitle,
    run.legalIntroduction,
    run.legalBody,
    `Version ${saved.result.version}`,
    "Stripe Test Mode",
    "No real payment will be accepted",
  ]);
  await expectHtml(`/admin/legal/${run.legalDocumentId}`, 200, owner, [
    run.legalTitle,
    "Exact draft approved",
    `Version ${saved.result.version}`,
    "public",
    "Version history",
  ]);

  const final = await streamJson(
    await expectResponse(`/api/admin/legal/${run.legalDocumentId}`, 200, {
      headers: owner,
    }),
  );
  assert.equal(final.document.published.id, saved.result.draftVersionId);
  assert.equal(final.document.approved.id, saved.result.draftVersionId);
  assert.equal(
    final.document.history.filter(
      (version) => version.id === saved.result.draftVersionId,
    ).length,
    1,
  );
  return Object.freeze({
    immutableDraft: "saved-once",
    approvalBoundary: "enforced",
    publication: "public",
    history: "visible",
  });
}

async function exerciseJourney(run) {
  const owner = identityHeaders(run.ownerEmail, run.ownerDisplayName);
  const customer = identityHeaders(run.customerEmail, run.customerDisplayName);
  const operations = await exerciseAuthorityAndOperations(run, owner, customer);
  const telemetry = await exerciseTelemetry(run, owner, customer);
  const legal = await exerciseLegal(run, owner, customer);
  return Object.freeze({ operations, telemetry, legal });
}

async function cleanupRun(run) {
  const response = await expectResponse(
    "/api/runtime-lab/m8",
    200,
    mutationInit({ method: "DELETE", body: { runId: run.runId } }),
  );
  const body = await streamJson(response);
  assert.deepEqual(body.cleanup, {
    restored: true,
    retainedVerificationRows: 0,
    baselineCountsRestored: true,
    moduleStateRestored: true,
    telemetrySettingsRestored: true,
    legalDocumentRestored: true,
    r2ObjectsTouched: 0,
    mediaBytesCreated: 0,
    temporaryFilesCreated: 0,
  });
  await expectResponse(
    `/api/runtime-lab/m8?run=${encodeURIComponent(run.runId)}`,
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
              "The Milestone 8 journey and cleanup both failed.",
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
    "The Milestone 8 runtime verification failed.",
  );
}
assert.ok(run);
assert.ok(result);
assert.ok(cleanup);

try {
  server = await startServer({ runtimeLab: false });
  await expectResponse(
    `/api/runtime-lab/m8?run=${encodeURIComponent(run.runId)}`,
    404,
  );
  await expectResponse(
    "/api/runtime-lab/m8",
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
    telemetrySettingsRestored: cleanup.telemetrySettingsRestored,
    legalDocumentRestored: cleanup.legalDocumentRestored,
    r2ObjectsTouched: cleanup.r2ObjectsTouched,
    mediaBytesCreated: cleanup.mediaBytesCreated,
    temporaryFilesCreated: cleanup.temporaryFilesCreated,
  })}\n`,
);
