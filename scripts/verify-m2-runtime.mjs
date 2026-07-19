import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const vinextBinary = resolve(projectRoot, "node_modules/.bin/vinext");
const port = Number(process.env.AOP_M2_RUNTIME_VERIFY_PORT ?? 3218);
const baseUrl = `http://localhost:${port}`;
const OWNER_EMAIL = "owner@a-op.invalid";
const MAX_RESPONSE_BYTES = 1_048_576;

if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error(
    "AOP_M2_RUNTIME_VERIFY_PORT must be a safe unprivileged port.",
  );
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

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
  child.stdout.resume();
  child.stderr.resume();

  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error("The Milestone 2 verification server exited early.");
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return child;
    } catch {
      // The strict verification port is still opening.
    }
    await delay(100);
  }

  await stopServer(child);
  throw new Error("The Milestone 2 verification server did not become ready.");
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
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("A verification response exceeded the in-memory limit.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
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
    signal: AbortSignal.timeout(8_000),
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

function operationKey(runId, name) {
  return `m2-${runId}-${name}`;
}

function runEmails(shortId) {
  return {
    customer: `m2-customer-${shortId}@a-op.invalid`,
    editor: `m2-editor-${shortId}@a-op.invalid`,
    disabled: `m2-disabled-${shortId}@a-op.invalid`,
  };
}

async function readRunState(runId) {
  const response = await expectResponse(
    `/api/runtime-lab/m2?run=${encodeURIComponent(runId)}`,
    200,
  );
  return (await streamJson(response)).state;
}

async function exerciseJourney(onRun) {
  const beginResponse = await expectResponse(
    "/api/runtime-lab/m2",
    201,
    mutationInit({ method: "POST", body: { action: "begin" } }),
  );
  const { run } = await streamJson(beginResponse);
  assert.match(run.id, /^[0-9a-f-]{36}$/);
  assert.match(run.slug, /^runtime-contact-[0-9a-f]{12}$/);
  onRun(run);
  const emails = runEmails(run.shortId);
  const owner = identityHeaders(OWNER_EMAIL, "Fictional Owner");
  const customer = identityHeaders(
    emails.customer,
    `Fictional M2 Customer ${run.shortId}`,
  );
  const editor = identityHeaders(
    emails.editor,
    `Fictional M2 Editor ${run.shortId}`,
  );

  const initialState = await readRunState(run.id);
  assert.equal(initialState.installation.status, "pending");
  assert.equal(initialState.contactModule.active, false);
  assert.equal(initialState.disabledIdentity.status, "disabled");

  const anonymousSetup = await expectResponse(
    "/api/setup/owner",
    401,
    mutationInit({
      method: "POST",
      body: { confirm: "bootstrap-owner" },
      idempotencyKey: operationKey(run.id, "anonymous-owner-setup"),
    }),
  );
  assert.equal(
    (await streamJson(anonymousSetup)).error.code,
    "AUTHENTICATION_REQUIRED",
  );

  const setupResponse = await expectResponse(
    "/api/setup/owner",
    201,
    mutationInit({
      method: "POST",
      body: { confirm: "bootstrap-owner" },
      identity: owner,
      idempotencyKey: operationKey(run.id, "owner-setup"),
    }),
  );
  const setup = await streamJson(setupResponse);
  assert.equal(setup.result.role, "owner");
  assert.equal(setup.result.installationStatus, "active");
  assert.equal(setup.replayed, false);

  const activeInstallation = await readRunState(run.id);
  assert.equal(activeInstallation.installation.status, "active");
  assert.equal(activeInstallation.installation.hasOwner, true);

  const artistInput = {
    artist: {
      displayName: run.artist.displayName,
      siteTitle: run.artist.siteTitle,
      headline: run.artist.headline,
      introduction: run.artist.introduction,
      footerText: run.artist.footerText,
    },
    expectedVersion: run.artist.expectedVersion,
  };
  const anonymousArtist = await expectResponse(
    "/api/admin/artist",
    401,
    mutationInit({
      method: "PUT",
      body: artistInput,
      idempotencyKey: operationKey(run.id, "anonymous-artist"),
    }),
  );
  assert.equal(
    (await streamJson(anonymousArtist)).error.code,
    "AUTHENTICATION_REQUIRED",
  );
  const customerArtist = await expectResponse(
    "/api/admin/artist",
    403,
    mutationInit({
      method: "PUT",
      body: artistInput,
      identity: customer,
      idempotencyKey: operationKey(run.id, "customer-artist"),
    }),
  );
  assert.equal((await streamJson(customerArtist)).error.code, "ROLE_REQUIRED");

  const artistDraftResponse = await expectResponse(
    "/api/admin/artist",
    200,
    mutationInit({
      method: "PUT",
      body: artistInput,
      identity: owner,
      idempotencyKey: operationKey(run.id, "artist-draft"),
    }),
  );
  const artistDraft = await streamJson(artistDraftResponse);
  assert.equal(artistDraft.replayed, false);
  assert.equal(artistDraft.result.version, run.artist.expectedVersion + 1);

  const draftInvisible = await expectResponse("/", 200);
  assert.equal(
    (await streamText(draftInvisible)).includes(run.artist.displayName),
    false,
  );

  const artistPublishResponse = await expectResponse(
    "/api/admin/artist/publish",
    200,
    mutationInit({
      method: "POST",
      body: { expectedVersion: artistDraft.result.version },
      identity: owner,
      idempotencyKey: operationKey(run.id, "artist-publish"),
    }),
  );
  const artistPublish = await streamJson(artistPublishResponse);
  assert.equal(artistPublish.replayed, false);
  assert.equal(artistPublish.result.version, artistDraft.result.version + 1);

  const publishedHome = await expectResponse("/", 200);
  const publishedHomeText = await streamText(publishedHome);
  assert.equal(publishedHomeText.includes(run.artist.displayName), true);
  assert.equal(publishedHomeText.includes(run.artist.headline), true);

  const itemPrefix = `m2-${run.shortId}`;
  const navigationInput = {
    expectedRevisions: run.navigation.expectedRevisions,
    navigation: [
      {
        id: "primary",
        items: [
          {
            itemKey: `${itemPrefix}-music`,
            label: "Music",
            href: "/music",
            position: 0,
            moduleKey: null,
            external: false,
          },
          {
            itemKey: `${itemPrefix}-contact`,
            label: run.navigation.label,
            href: `/${run.slug}`,
            position: 1,
            moduleKey: "contact",
            external: false,
          },
        ],
      },
      {
        id: "footer",
        items: [
          {
            itemKey: `${itemPrefix}-home`,
            label: "Home",
            href: "/",
            position: 0,
            moduleKey: null,
            external: false,
          },
          {
            itemKey: `${itemPrefix}-contact`,
            label: run.navigation.label,
            href: `/${run.slug}`,
            position: 1,
            moduleKey: "contact",
            external: false,
          },
        ],
      },
    ],
  };
  const navigationDraftResponse = await expectResponse(
    "/api/admin/navigation",
    200,
    mutationInit({
      method: "PUT",
      body: navigationInput,
      identity: owner,
      idempotencyKey: operationKey(run.id, "navigation-draft"),
    }),
  );
  const navigationDraft = await streamJson(navigationDraftResponse);
  assert.equal(navigationDraft.replayed, false);
  assert.equal(
    navigationDraft.result.primary.revision,
    run.navigation.expectedRevisions.primary + 1,
  );
  assert.equal(
    navigationDraft.result.footer.revision,
    run.navigation.expectedRevisions.footer + 1,
  );
  const navigationStillDraft = await expectResponse("/", 200);
  assert.equal(
    (await streamText(navigationStillDraft)).includes(run.navigation.label),
    false,
  );

  const navigationPublishResponse = await expectResponse(
    "/api/admin/navigation/publish",
    200,
    mutationInit({
      method: "POST",
      body: {
        expectedRevisions: {
          primary: navigationDraft.result.primary.revision,
          footer: navigationDraft.result.footer.revision,
        },
      },
      identity: owner,
      idempotencyKey: operationKey(run.id, "navigation-publish"),
    }),
  );
  const navigationPublish = await streamJson(navigationPublishResponse);
  assert.equal(navigationPublish.replayed, false);
  assert.equal(
    navigationPublish.result.primary.publishedVersion,
    navigationDraft.result.primary.draftVersion,
  );
  assert.equal(
    navigationPublish.result.footer.publishedVersion,
    navigationDraft.result.footer.draftVersion,
  );
  const inactiveNavigation = await expectResponse("/", 200);
  assert.equal(
    (await streamText(inactiveNavigation)).includes(run.navigation.label),
    false,
  );

  const disabledGrantResponse = await expectResponse(
    "/api/admin/editors",
    403,
    mutationInit({
      method: "POST",
      body: {
        editor: {
          email: emails.disabled,
          displayName: `Fictional Disabled M2 ${run.shortId}`,
          permissionKey: "pages.write",
          scopeId: run.slug,
        },
      },
      identity: owner,
      idempotencyKey: operationKey(run.id, "disabled-editor-grant"),
    }),
  );
  assert.equal(
    (await streamJson(disabledGrantResponse)).error.code,
    "ACCOUNT_DISABLED",
  );
  const disabledState = await readRunState(run.id);
  assert.deepEqual(disabledState.disabledIdentity, {
    status: "disabled",
    activeEditorRoles: 0,
    activePagePermissions: 0,
  });

  const ownerPageDraftResponse = await expectResponse(
    `/api/admin/pages/${run.slug}`,
    201,
    mutationInit({
      method: "PUT",
      body: {
        expectedVersion: 0,
        page: {
          slug: run.slug,
          title: `Owner-created page ${run.shortId}`,
          introduction: "The owner establishes structural page metadata.",
          bodyText: "The scoped editor supplies the final published writing.",
          moduleKey: "contact",
          kind: "standard",
        },
      },
      identity: owner,
      idempotencyKey: operationKey(run.id, "owner-page-create"),
    }),
  );
  const ownerPageDraft = await streamJson(ownerPageDraftResponse);
  assert.equal(ownerPageDraft.replayed, false);
  assert.equal(ownerPageDraft.result.created, true);
  assert.equal(ownerPageDraft.result.version, 1);
  await expectResponse(`/${run.slug}`, 404);

  const unassignedEditor = await expectResponse(
    `/api/admin/pages/${run.slug}`,
    403,
    mutationInit({
      method: "PUT",
      body: {
        expectedVersion: ownerPageDraft.result.version,
        page: {
          slug: run.slug,
          title: run.page.title,
          introduction: run.page.introduction,
          bodyText: run.page.bodyText,
          moduleKey: "contact",
          kind: "standard",
        },
      },
      identity: editor,
      idempotencyKey: operationKey(run.id, "unassigned-editor-page"),
    }),
  );
  assert.equal(
    (await streamJson(unassignedEditor)).error.code,
    "ROLE_REQUIRED",
  );

  const editorGrantResponse = await expectResponse(
    "/api/admin/editors",
    201,
    mutationInit({
      method: "POST",
      body: {
        editor: {
          email: emails.editor,
          displayName: `Fictional M2 Editor ${run.shortId}`,
          permissionKey: "pages.write",
          scopeId: run.slug,
        },
      },
      identity: owner,
      idempotencyKey: operationKey(run.id, "editor-grant"),
    }),
  );
  const editorGrant = await streamJson(editorGrantResponse);
  assert.equal(editorGrant.replayed, false);
  assert.equal(editorGrant.result.scopeId, run.slug);

  const missingEditorId = `user_m2_missing_${run.shortId}`;
  const missingEditorRevokeKey = operationKey(run.id, "missing-editor-revoke");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const missingEditorRevoke = await expectResponse(
      `/api/admin/editors/${missingEditorId}`,
      409,
      mutationInit({
        method: "DELETE",
        body: {},
        identity: owner,
        idempotencyKey: missingEditorRevokeKey,
      }),
    );
    assert.equal(
      (await streamJson(missingEditorRevoke)).error.code,
      "STALE_STATE",
    );
  }

  const editorStructureChange = await expectResponse(
    `/api/admin/pages/${run.slug}`,
    403,
    mutationInit({
      method: "PUT",
      body: {
        expectedVersion: ownerPageDraft.result.version,
        page: {
          slug: run.slug,
          title: run.page.title,
          introduction: run.page.introduction,
          bodyText: run.page.bodyText,
          moduleKey: null,
          kind: "standard",
        },
      },
      identity: editor,
      idempotencyKey: operationKey(run.id, "editor-page-structure"),
    }),
  );
  assert.equal(
    (await streamJson(editorStructureChange)).error.code,
    "STRUCTURE_OWNER_REQUIRED",
  );

  const blockedSlug = `blocked-${run.shortId}`;
  const blockedPage = await expectResponse(
    `/api/admin/pages/${blockedSlug}`,
    403,
    mutationInit({
      method: "PUT",
      body: {
        expectedVersion: 0,
        page: {
          slug: blockedSlug,
          title: "Blocked scope",
          introduction: "",
          bodyText: "",
          moduleKey: null,
          kind: "standard",
        },
      },
      identity: editor,
      idempotencyKey: operationKey(run.id, "editor-blocked-scope"),
    }),
  );
  assert.equal(
    (await streamJson(blockedPage)).error.code,
    "CONTENT_SCOPE_REQUIRED",
  );

  const editorArtist = await expectResponse(
    "/api/admin/artist",
    403,
    mutationInit({
      method: "PUT",
      body: {
        artist: artistInput.artist,
        expectedVersion: artistPublish.result.version,
      },
      identity: editor,
      idempotencyKey: operationKey(run.id, "editor-artist"),
    }),
  );
  assert.equal((await streamJson(editorArtist)).error.code, "ROLE_REQUIRED");

  const pageDraftResponse = await expectResponse(
    `/api/admin/pages/${run.slug}`,
    200,
    mutationInit({
      method: "PUT",
      body: {
        expectedVersion: ownerPageDraft.result.version,
        page: {
          slug: run.slug,
          title: run.page.title,
          introduction: run.page.introduction,
          bodyText: run.page.bodyText,
          moduleKey: "contact",
          kind: "standard",
        },
      },
      identity: editor,
      idempotencyKey: operationKey(run.id, "page-draft"),
    }),
  );
  const pageDraft = await streamJson(pageDraftResponse);
  assert.equal(pageDraft.replayed, false);
  assert.equal(pageDraft.result.created, false);
  assert.equal(pageDraft.result.version, ownerPageDraft.result.version + 1);

  await expectResponse(`/${run.slug}`, 404);
  const editorPublishResponse = await expectResponse(
    `/api/admin/pages/${run.slug}/publish`,
    403,
    mutationInit({
      method: "POST",
      body: { expectedVersion: pageDraft.result.version },
      identity: editor,
      idempotencyKey: operationKey(run.id, "editor-page-publish"),
    }),
  );
  assert.equal(
    (await streamJson(editorPublishResponse)).error.code,
    "ROLE_REQUIRED",
  );
  const pagePublishResponse = await expectResponse(
    `/api/admin/pages/${run.slug}/publish`,
    200,
    mutationInit({
      method: "POST",
      body: { expectedVersion: pageDraft.result.version },
      identity: owner,
      idempotencyKey: operationKey(run.id, "owner-page-publish"),
    }),
  );
  const pagePublish = await streamJson(pagePublishResponse);
  assert.equal(pagePublish.replayed, false);
  assert.equal(pagePublish.result.publicationState, "published");
  const publishedPageState = await readRunState(run.id);
  assert.equal(publishedPageState.page.version, pagePublish.result.version);
  assert.equal(
    publishedPageState.page.draftRevisionId,
    pageDraft.result.revisionId,
  );
  assert.equal(
    publishedPageState.page.publishedRevisionId,
    pageDraft.result.revisionId,
  );
  assert.equal(publishedPageState.page.moduleKey, "contact");
  assert.equal(publishedPageState.page.kind, "standard");
  assert.equal(publishedPageState.page.revisionCount, 2);
  await expectResponse(`/${run.slug}`, 404);

  const customerModule = await expectResponse(
    "/api/admin/modules",
    403,
    mutationInit({
      method: "PUT",
      body: { activate: ["contact"], deactivate: [] },
      identity: customer,
      idempotencyKey: operationKey(run.id, "customer-module"),
    }),
  );
  assert.equal((await streamJson(customerModule)).error.code, "ROLE_REQUIRED");

  const editorModule = await expectResponse(
    "/api/admin/modules",
    403,
    mutationInit({
      method: "PUT",
      body: { activate: ["contact"], deactivate: [] },
      identity: editor,
      idempotencyKey: operationKey(run.id, "editor-module"),
    }),
  );
  assert.equal((await streamJson(editorModule)).error.code, "ROLE_REQUIRED");

  const activateResponse = await expectResponse(
    "/api/admin/modules",
    200,
    mutationInit({
      method: "PUT",
      body: { activate: ["contact"], deactivate: [] },
      identity: owner,
      idempotencyKey: operationKey(run.id, "contact-activate"),
    }),
  );
  const activate = await streamJson(activateResponse);
  assert.deepEqual(activate.result.activated, ["contact"]);
  assert.equal(activate.result.activeModules.includes("contact"), true);

  const activePageResponse = await expectResponse(`/${run.slug}`, 200);
  const activePage = await streamText(activePageResponse);
  assert.equal(activePage.includes(run.page.title), true);
  assert.equal(activePage.includes(run.page.bodyText), true);
  const activeNavigationResponse = await expectResponse("/", 200);
  assert.equal(
    (await streamText(activeNavigationResponse)).includes(run.navigation.label),
    true,
  );

  const deactivateResponse = await expectResponse(
    "/api/admin/modules",
    200,
    mutationInit({
      method: "PUT",
      body: { activate: [], deactivate: ["contact"] },
      identity: owner,
      idempotencyKey: operationKey(run.id, "contact-deactivate"),
    }),
  );
  const deactivate = await streamJson(deactivateResponse);
  assert.deepEqual(deactivate.result.deactivated, ["contact"]);
  await expectResponse(`/${run.slug}`, 404);
  const inactiveHomeResponse = await expectResponse("/", 200);
  assert.equal(
    (await streamText(inactiveHomeResponse)).includes(run.navigation.label),
    false,
  );

  const preserved = await readRunState(run.id);
  assert.equal(preserved.contactModule.active, false);
  assert.equal(preserved.page.publicationState, "published");
  assert.equal(
    preserved.page.publishedRevisionId,
    pagePublish.result.publishedRevisionId,
  );
  assert.equal(preserved.page.moduleKey, "contact");
  assert.equal(preserved.page.kind, "standard");
  assert.equal(preserved.page.revisionCount, 2);

  await expectResponse(
    "/api/admin/modules",
    200,
    mutationInit({
      method: "PUT",
      body: { activate: ["contact"], deactivate: [] },
      identity: owner,
      idempotencyKey: operationKey(run.id, "contact-reactivate"),
    }),
  );
  const restoredPublicPage = await expectResponse(`/${run.slug}`, 200);
  assert.equal(
    (await streamText(restoredPublicPage)).includes(run.page.bodyText),
    true,
  );

  const editorRevokeResponse = await expectResponse(
    `/api/admin/editors/${editorGrant.result.userId}`,
    200,
    mutationInit({
      method: "DELETE",
      body: {},
      identity: owner,
      idempotencyKey: operationKey(run.id, "editor-revoke"),
    }),
  );
  const editorRevoke = await streamJson(editorRevokeResponse);
  assert.equal(editorRevoke.replayed, false);
  assert.equal(editorRevoke.result.revoked, true);

  const revokedEditorPage = await expectResponse(
    `/api/admin/pages/${run.slug}`,
    403,
    mutationInit({
      method: "PUT",
      body: {
        expectedVersion: pagePublish.result.version,
        page: {
          slug: run.slug,
          title: `${run.page.title} after revocation`,
          introduction: run.page.introduction,
          bodyText: run.page.bodyText,
          moduleKey: "contact",
          kind: "standard",
        },
      },
      identity: editor,
      idempotencyKey: operationKey(run.id, "revoked-editor-page"),
    }),
  );
  assert.equal(
    (await streamJson(revokedEditorPage)).error.code,
    "ROLE_REQUIRED",
  );

  return run;
}

async function cleanupRun(runId) {
  const response = await expectResponse(
    "/api/runtime-lab/m2",
    200,
    mutationInit({ method: "DELETE", body: { runId } }),
  );
  const body = await streamJson(response);
  assert.deepEqual(body.cleanup, {
    restored: true,
    retainedVerificationRows: 0,
    r2ObjectsTouched: 0,
    temporaryFilesCreated: 0,
  });
  await expectResponse(
    `/api/runtime-lab/m2?run=${encodeURIComponent(runId)}`,
    404,
  );
  return body.cleanup;
}

let server;
let run;
let cleanup;
let journeyError;

try {
  server = await startServer({ runtimeLab: true });
  try {
    run = await exerciseJourney((activeRun) => {
      run = activeRun;
    });
  } catch (error) {
    journeyError = error;
  } finally {
    if (run?.id) {
      try {
        cleanup = await cleanupRun(run.id);
      } catch (error) {
        journeyError = journeyError
          ? new AggregateError(
              [journeyError, error],
              "The journey and its cleanup both failed.",
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
assert.ok(cleanup);

try {
  server = await startServer({ runtimeLab: false });
  await expectResponse(
    `/api/runtime-lab/m2?run=${encodeURIComponent(run.id)}`,
    404,
  );
  await expectResponse(
    "/api/runtime-lab/m2",
    404,
    mutationInit({ method: "POST", body: { action: "begin" } }),
  );
} finally {
  if (server) await stopServer(server);
}

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    ownerSetup: "explicit",
    pairedNavigation: "published",
    scopedEditorPage: "published",
    pageStructure: "owner-only",
    pageRevisionMetadata: "published-atomically",
    missingEditorRevocation: "rejected",
    revokedAuthority: "denied",
    moduleVisibilityTransitions: [404, 200, 404, 200],
    disabledIdentity: "preserved",
    authorizationStatuses: [401, 403, 200],
    runtimeLabDefault: "off",
    retainedVerificationRows: cleanup.retainedVerificationRows,
    r2ObjectsTouched: cleanup.r2ObjectsTouched,
    temporaryFilesCreated: cleanup.temporaryFilesCreated,
  })}\n`,
);
