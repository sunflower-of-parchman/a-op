import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { rehearseArtistExportBytesInMemory } from "../lib/portability/sqlite-rehearsal.mjs";

const projectRoot = process.cwd();
const vinextBinary = resolve(projectRoot, "node_modules/.bin/vinext");
const port = Number(process.env.AOP_M9_RUNTIME_VERIFY_PORT ?? 3229);
const baseUrl = `http://localhost:${port}`;
const MAX_TEXT_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
let latestServerError = "";

if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error(
    "AOP_M9_RUNTIME_VERIFY_PORT must be a safe unprivileged port.",
  );
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

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
  if (runtimeLab) {
    environment.AOP_ENABLE_RUNTIME_LAB = "1";
    environment.STRIPE_PUBLISHABLE_KEY =
      "pk_test_m9_runtime_fictional_publishable";
    environment.STRIPE_SECRET_KEY = "sk_test_m9_runtime_fictional_secret";
    environment.STRIPE_WEBHOOK_SECRET = "whsec_m9_runtime_fictional_signature";
  }
  return environment;
}

async function startServer({ runtimeLab }) {
  latestServerError = "";
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
  const captureServerOutput = (chunk) => {
    latestServerError = `${latestServerError}${chunk}`.slice(-8_000);
  };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", captureServerOutput);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", captureServerOutput);

  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `The Milestone 9 verification server exited early.${latestServerError ? `\n${latestServerError}` : ""}`,
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
  throw new Error("The Milestone 9 verification server did not become ready.");
}

async function stopServer(child) {
  if (child.exitCode === null) {
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

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(250),
      });
    } catch {
      return;
    }
    await delay(50);
  }
  throw new Error("The Milestone 9 verification server did not stop cleanly.");
}

async function streamBytes(response, maximum = MAX_ARCHIVE_BYTES) {
  if (!response.body) return new Uint8Array();
  const chunks = [];
  let byteLength = 0;
  const reader = response.body.getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    byteLength += next.value.byteLength;
    if (byteLength > maximum) {
      await reader.cancel();
      throw new Error("A verification response exceeded its in-memory limit.");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function streamText(response) {
  return new TextDecoder().decode(
    await streamBytes(response, MAX_TEXT_RESPONSE_BYTES),
  );
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
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== expectedStatus) {
    const detail = await streamText(response);
    await delay(100);
    assert.equal(
      response.status,
      expectedStatus,
      `${init.method ?? "GET"} ${path} returned ${response.status}: ${detail.slice(0, 2_000)}${latestServerError ? `\n${latestServerError}` : ""}`,
    );
  }
  assert.equal(response.status, expectedStatus);
  return response;
}

function identityHeaders(run) {
  return {
    "oai-authenticated-user-email": run.ownerEmail,
    "oai-authenticated-user-full-name": encodeURIComponent(
      run.ownerDisplayName,
    ),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

function jsonMutation({ method = "POST", body, run, idempotencyKey }) {
  return {
    method,
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
      ...(run ? identityHeaders(run) : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  };
}

function ownerMutation(run, idempotencyKey, extra = {}) {
  return {
    method: "POST",
    headers: {
      origin: baseUrl,
      ...identityHeaders(run),
      "idempotency-key": idempotencyKey,
      ...extra,
    },
  };
}

async function expectHtml(path, expectedStatus, run, required) {
  const response = await expectResponse(path, expectedStatus, {
    headers: run ? identityHeaders(run) : {},
  });
  const text = (await streamText(response)).replaceAll("<!-- -->", "");
  for (const fragment of required) {
    assert.match(
      text,
      new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${path} did not contain ${fragment}`,
    );
  }
  return text;
}

async function beginRun() {
  const response = await expectResponse(
    "/api/runtime-lab/m9",
    201,
    jsonMutation({ body: { action: "begin" } }),
  );
  const body = await streamJson(response);
  assert.match(body.run.runId, /^[0-9a-f-]{36}$/);
  assert.match(body.run.ownerEmail, /^m9-owner-[0-9a-f]{12}@a-op\.invalid$/);
  assert.match(body.run.proposalId, /^m9-setup-[0-9a-f]{12}$/);
  assert.match(body.run.artistName, /^Fictional M9 Artist [0-9a-f]{12}$/);
  return body.run;
}

async function readRunState(run) {
  const response = await expectResponse(
    `/api/runtime-lab/m9?run=${encodeURIComponent(run.runId)}`,
    200,
  );
  return (await streamJson(response)).state;
}

function proposalFor(run, sourceStateFingerprint) {
  return {
    schemaVersion: "aop.setup-proposal.v2",
    proposalId: run.proposalId,
    createdAt: new Date().toISOString(),
    sourceStateFingerprint,
    commerce: {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      journey: "active",
      statement: "No real payment will be accepted.",
    },
    topics: {
      artist: {
        artistKey: "artist",
        publicName: run.artistName,
        shortName: "Fictional Artist",
        headline: run.artistHeadline,
        description:
          "A fictional artist-owned catalog used for local setup verification.",
        biography: run.artistIntroduction,
        publicContactEmail: run.contactEmail,
        publicContactUrl: null,
      },
      capabilitiesNavigation: {
        activeModules: [
          "downloads",
          "customer-library",
          "licensing",
          "memberships",
          "subscriptions",
          "courses",
          "video",
          "contact",
          "telemetry",
        ],
        primaryNavigation: [
          {
            navigationKey: "music",
            label: "Music",
            href: "/music",
            order: 10,
            module: null,
          },
          {
            navigationKey: "courses",
            label: "Courses",
            href: "/courses",
            order: 20,
            module: "courses",
          },
          {
            navigationKey: "videos",
            label: "Videos",
            href: "/videos",
            order: 30,
            module: "video",
          },
          {
            navigationKey: "memberships",
            label: "Memberships",
            href: "/commerce",
            order: 40,
            module: "memberships",
          },
          {
            navigationKey: "licensing",
            label: "Licensing",
            href: "/licensing",
            order: 50,
            module: "licensing",
          },
          {
            navigationKey: "contact",
            label: "Contact",
            href: "/contact",
            order: 60,
            module: "contact",
          },
        ],
        footerNavigation: [
          {
            navigationKey: "privacy",
            label: "Privacy",
            href: "/privacy",
            order: 10,
            module: null,
          },
          {
            navigationKey: "terms",
            label: "Terms",
            href: "/terms",
            order: 20,
            module: null,
          },
        ],
      },
      rightsMedia: { rightsStatement: run.rightsStatement, media: [] },
      catalogReleases: {
        tracks: [
          {
            trackKey: run.trackKey,
            title: run.trackTitle,
            versionLabel: "Runtime verification",
            releaseKey: run.releaseKey,
            sequence: 1,
            mediaKey: null,
          },
        ],
        releases: [
          {
            releaseKey: run.releaseKey,
            title: run.releaseTitle,
            releaseDate: "2026-07-19",
            trackKeys: [run.trackKey],
          },
        ],
        collections: [
          {
            collectionKey: run.collectionKey,
            title: run.collectionTitle,
            trackKeys: [run.trackKey],
          },
        ],
      },
      streamingDownloads: {
        tracks: [
          {
            trackKey: run.trackKey,
            streaming: "disabled",
            download: "disabled",
          },
        ],
      },
      customerAccess: {
        customerLibraries: true,
        protectedDelivery: true,
        accessPlans: [
          {
            accessPlanKey: run.accessPlanKey,
            label: run.accessPlanLabel,
            resourceType: "track",
            resourceKeys: [run.trackKey],
            accessMode: "subscription",
          },
        ],
        grantTemplates: [
          {
            grantKey: run.grantKey,
            label: run.grantLabel,
            accessPlanKey: run.accessPlanKey,
            defaultDurationDays: 30,
          },
        ],
      },
      membershipsSubscriptions: {
        membershipPlans: [
          {
            planKey: run.membershipPlanKey,
            name: run.membershipPlanName,
            description:
              "Fictional protected music with download and license credits.",
            interval: "one-time",
            displayAmountMinor: 1200,
            currency: "USD",
            accessPlanKeys: [run.accessPlanKey],
            benefitKeys: ["protected-music"],
            durationDays: null,
          },
        ],
        subscriptionPlans: [
          {
            planKey: run.subscriptionPlanKey,
            membershipPlanKey: run.membershipPlanKey,
            name: run.subscriptionPlanName,
            description: "Fictional monthly supporter subscription.",
            billingInterval: "month",
            displayAmountMinor: 1200,
            currency: "USD",
            accessPlanKeys: [run.accessPlanKey],
            benefitKeys: ["protected-music"],
          },
        ],
      },
      credits: {
        downloadCreditRules: [
          {
            ruleKey: `m9-membership-download-${run.shortId}`,
            planKey: run.membershipPlanKey,
            amount: 2,
            cadence: "once",
          },
          {
            ruleKey: `m9-subscription-download-${run.shortId}`,
            planKey: run.subscriptionPlanKey,
            amount: 2,
            cadence: "month",
          },
        ],
        licenseCreditRules: [
          {
            ruleKey: `m9-membership-license-${run.shortId}`,
            planKey: run.membershipPlanKey,
            amount: 1,
            cadence: "once",
          },
          {
            ruleKey: `m9-subscription-license-${run.shortId}`,
            planKey: run.subscriptionPlanKey,
            amount: 1,
            cadence: "month",
          },
        ],
      },
      licensing: {
        terms: [
          {
            termsKey: run.licenseTermsKey,
            title: run.licenseTermsTitle,
            body: `Fictional license terms for ${run.shortId}.`,
            version: 1,
          },
        ],
        options: [
          {
            optionKey: run.licenseOptionKey,
            trackKey: run.trackKey,
            label: run.licenseOptionLabel,
            termsKey: run.licenseTermsKey,
            uses: "Use the fictional track in one online video.",
            usageCategory: "online-video",
            allowedMedia: ["online video"],
            audienceLabel: "Online audience",
            maxAudience: 100000,
            distributionLabel: "One channel",
            maxCopies: null,
            termMonths: 12,
            territory: "Worldwide",
            attributionRequired: true,
            attributionText: `Music by ${run.artistName}`,
            exclusive: false,
            requiresApproval: true,
            licenseCreditCost: 1,
            includesTrackDownload: true,
            displayAmountMinor: 2500,
            currency: "USD",
          },
        ],
      },
      coursesVideo: {
        courses: [
          {
            courseKey: run.courseKey,
            title: run.courseTitle,
            summary: `A fictional text-only Course for ${run.shortId}.`,
            accessPlanKey: null,
            lessons: [
              {
                lessonKey: run.lessonKey,
                title: run.lessonTitle,
                summary: `Artist-authored fictional lesson text for ${run.shortId}.`,
                mediaKeys: [],
              },
            ],
          },
        ],
        videos: [
          {
            videoKey: run.videoKey,
            title: run.videoTitle,
            summary: `A fictional consent-gated external video for ${run.shortId}.`,
            mediaKey: null,
            transcript: run.videoTranscript,
            externalEmbedUrl: `https://video.example.invalid/embed/${run.shortId}`,
            consentRequired: true,
          },
        ],
      },
      editorialPresentation: {
        posts: [],
        updates: [],
        about: {
          title: "About",
          introduction:
            "a-op is an open-source web application for musicians who want to publish and operate their work through their own site.",
          bodyText:
            "A fresh installation begins with music, streaming, identity, access, and administration. The artist activates other connected capabilities when they need them.",
          publication: "draft",
        },
        pageHeroes: [],
      },
      contactConsent: {
        enabled: true,
        publicEmail: run.contactEmail,
        invitation: run.contactInvitation,
        consentText: run.contactConsent,
        categories: ["Licensing", "Music"],
      },
      telemetryRetention: {
        enabled: true,
        collectionMode: "consent-required",
        retentionDays: 45,
        meaningfulListenSeconds: 12,
        firstPartyOnly: true,
      },
      privacyTerms: {
        privacy: {
          title: "Fictional M9 Privacy Policy",
          body: run.privacyBody,
          action: "save-draft",
        },
        terms: {
          title: "Fictional M9 Terms and Conditions",
          body: run.termsBody,
          action: "save-draft",
        },
        artistReviewRequired: true,
      },
      accountsPublication: {
        ownerStrategy: "authenticated-requester",
        ownerAcknowledgement: "artist-authorized",
        editorAccountAliases: [
          {
            email: run.editorEmail,
            displayName: run.editorDisplayName,
            permissionKey: "catalog.write",
            scopeId: "*",
          },
        ],
        publication: {
          artist: "publish",
          navigation: "publish",
          catalog: "draft",
          content: "publish",
          media: "prepare-only",
        },
        externalPublication: "approval-required",
      },
    },
    mediaActions: [],
    sourceChanges: [],
    externalActions: [],
  };
}

function approvalFor(run, proposal, proposalHash) {
  return {
    schemaVersion: "aop.setup-approval.v1",
    approvalId: run.approvalId,
    proposalId: proposal.proposalId,
    proposalHash,
    sourceStateFingerprint: proposal.sourceStateFingerprint,
    approvedAt: new Date().toISOString(),
    approvedBy: {
      authority: "artist-owner",
      accountAlias: run.ownerAlias,
    },
    approvedScopes: [
      "configuration",
      "internal-publication",
      "account-authority",
      "legal-drafts",
    ],
    statement: "I approve this exact proposal hash.",
  };
}

function assertAppliedDefinitions(run, state) {
  const definitions = state.definitions;
  assert.deepEqual(
    definitions.activeModules.map(({ moduleKey }) => moduleKey),
    [
      "contact",
      "courses",
      "customer-library",
      "downloads",
      "licensing",
      "memberships",
      "subscriptions",
      "telemetry",
      "video",
    ],
  );
  assert.deepEqual(
    definitions.primaryNavigation.map(({ navigationKey }) => navigationKey),
    ["music", "courses", "videos", "memberships", "licensing", "contact"],
  );
  assert.deepEqual(
    definitions.footerNavigation.map(({ navigationKey }) => navigationKey),
    ["privacy", "terms"],
  );
  assert.deepEqual(definitions.track, {
    slug: run.trackKey,
    publicationState: "published",
    revision: 3,
    title: run.trackTitle,
    subtitle: "Runtime verification",
    streamMode: "unavailable",
    downloadMode: "unavailable",
    originalMediaId: null,
    streamingDerivativeId: null,
    downloadDerivativeId: null,
  });
  assert.deepEqual(definitions.release, {
    slug: run.releaseKey,
    publicationState: "draft",
    title: run.releaseTitle,
    releaseDate: "2026-07-19",
    trackCount: 1,
  });
  assert.deepEqual(definitions.collection, {
    slug: run.collectionKey,
    publicationState: "draft",
    title: run.collectionTitle,
    trackCount: 1,
  });
  assert.deepEqual(definitions.accessPlan, {
    slug: run.accessPlanKey,
    name: run.accessPlanLabel,
    state: "active",
    revision: 1,
    resourceType: "track",
    resourceId: run.trackId,
    actionsJson: '["view","stream","download"]',
    trackKey: run.trackKey,
  });
  assert.deepEqual(definitions.grantTemplate, {
    grantKey: run.grantKey,
    label: run.grantLabel,
    defaultDurationDays: 30,
    state: "active",
    revision: 1,
    accessPlanKey: run.accessPlanKey,
    accessPlanRevision: 1,
  });
  assert.deepEqual(definitions.membershipPlan, {
    slug: run.membershipPlanKey,
    state: "draft",
    revision: 1,
    name: run.membershipPlanName,
    description: "Fictional protected music with download and license credits.",
    benefitsJson: '["protected-music"]',
    downloadCredits: 2,
    licenseCredits: 1,
    durationDays: null,
    accessPlanKey: run.accessPlanKey,
  });
  assert.deepEqual(definitions.subscriptionPlan, {
    slug: run.subscriptionPlanKey,
    name: run.subscriptionPlanName,
    description: "Fictional monthly supporter subscription.",
    billingInterval: "month",
    intervalCount: 1,
    state: "draft",
    revision: 1,
    membershipPlanKey: run.membershipPlanKey,
    membershipPlanRevision: 1,
  });
  assert.equal(definitions.creditRules.length, 4);
  assert.deepEqual(
    definitions.creditRules.map(({ creditKind, amount, cadence }) => ({
      creditKind,
      amount,
      cadence,
    })),
    [
      { creditKind: "download", amount: 2, cadence: "once" },
      { creditKind: "license", amount: 1, cadence: "once" },
      { creditKind: "download", amount: 2, cadence: "month" },
      { creditKind: "license", amount: 1, cadence: "month" },
    ],
  );
  assert.equal(definitions.commerceBindingIntents.length, 3);
  assert.ok(
    definitions.commerceBindingIntents.every(
      ({
        bindingState,
        stripeEnvironment,
        livemode,
        commerceProductId,
        commercePriceId,
      }) =>
        bindingState === "pending" &&
        stripeEnvironment === "test" &&
        livemode === 0 &&
        commerceProductId === null &&
        commercePriceId === null,
    ),
  );
  assert.deepEqual(
    definitions.commerceBindingIntents.map(
      ({ intentKind, amountMinor, currency, billingInterval }) => ({
        intentKind,
        amountMinor,
        currency,
        billingInterval,
      }),
    ),
    [
      {
        intentKind: "license",
        amountMinor: 2500,
        currency: "USD",
        billingInterval: "one_time",
      },
      {
        intentKind: "membership",
        amountMinor: 1200,
        currency: "USD",
        billingInterval: "one_time",
      },
      {
        intentKind: "subscription",
        amountMinor: 1200,
        currency: "USD",
        billingInterval: "month",
      },
    ],
  );
  assert.deepEqual(definitions.licenseDefinition, {
    slug: run.licenseTermsKey,
    state: "draft",
    version: 1,
    title: run.licenseTermsTitle,
    body: `Fictional license terms for ${run.shortId}.`,
    optionKey: run.licenseOptionKey,
    optionLabel: run.licenseOptionLabel,
    usageCategory: "online-video",
    allowedMediaJson: '["online video"]',
    licenseCreditCost: 1,
    includesTrackDownload: 1,
  });
  assert.deepEqual(definitions.course, {
    slug: run.courseKey,
    publicationState: "published",
    title: run.courseTitle,
    description: `A fictional text-only Course for ${run.shortId}.`,
    accessMode: "public",
    accessPlanKey: null,
    lessonKey: run.lessonKey,
    lessonTitle: run.lessonTitle,
    lessonSummary: `Artist-authored fictional lesson text for ${run.shortId}.`,
    lessonItemCount: 1,
    lessonItemType: "text",
    lessonMediaDerivativeId: null,
  });
  assert.deepEqual(definitions.video, {
    slug: run.videoKey,
    publicationState: "published",
    title: run.videoTitle,
    summary: `A fictional consent-gated external video for ${run.shortId}.`,
    deliveryKind: "external",
    externalProvider: "other",
    externalEmbedUrl: `https://video.example.invalid/embed/${run.shortId}`,
    language: "en",
    transcriptText: run.videoTranscript,
    hostedDerivativeId: null,
    posterDerivativeId: null,
    captionsDerivativeId: null,
  });
  assert.equal(typeof definitions.contact.title, "string");
  assert.ok(definitions.contact.title.length > 0);
  assert.ok(Number.isSafeInteger(definitions.contact.consentVersion));
  assert.ok(definitions.contact.consentVersion > 0);
  assert.deepEqual(
    {
      formKey: definitions.contact.formKey,
      description: definitions.contact.description,
      publicContactDetails: definitions.contact.publicContactDetails,
      categoriesJson: definitions.contact.categoriesJson,
      state: definitions.contact.state,
      deliveryAdapter: definitions.contact.deliveryAdapter,
      consentText: definitions.contact.consentText,
    },
    {
      formKey: "contact",
      description: run.contactInvitation,
      publicContactDetails: run.contactEmail,
      categoriesJson: '["Licensing","Music"]',
      state: "active",
      deliveryAdapter: "stored_only",
      consentText: run.contactConsent,
    },
  );
  assert.ok(Number.isSafeInteger(definitions.telemetry.revision));
  assert.ok(definitions.telemetry.revision > 0);
  assert.deepEqual(
    {
      collectionMode: definitions.telemetry.collectionMode,
      retentionDays: definitions.telemetry.retentionDays,
      meaningfulListenSeconds: definitions.telemetry.meaningfulListenSeconds,
    },
    {
      collectionMode: "consent_required",
      retentionDays: 45,
      meaningfulListenSeconds: 12,
    },
  );
  assert.deepEqual(
    definitions.legalDrafts.map(({ id, title, body }) => ({ id, title, body })),
    [
      {
        id: "privacy",
        title: "Fictional M9 Privacy Policy",
        body: run.privacyBody,
      },
      {
        id: "terms",
        title: "Fictional M9 Terms and Conditions",
        body: run.termsBody,
      },
    ],
  );
  assert.deepEqual(definitions.editor, {
    email: run.editorEmail,
    displayName: run.editorDisplayName,
    roleKey: "editor",
    permissionKey: "catalog.write",
    scopeId: "*",
  });
  const rightsReceipt = JSON.parse(definitions.rightsReceipt.resultJson);
  assert.equal(rightsReceipt.topic, "rights-media");
  assert.equal(rightsReceipt.outcome, "applied");
  assert.equal(rightsReceipt.resourceCount, 0);
}

async function setupWorkspace(run) {
  const response = await expectResponse("/api/admin/setup", 200, {
    headers: identityHeaders(run),
  });
  return streamJson(response);
}

async function previewSetup(run, proposal, approval) {
  const response = await expectResponse(
    "/api/admin/setup/preview",
    200,
    jsonMutation({
      run,
      body: {
        proposal,
        ...(approval ? { approval } : {}),
      },
    }),
  );
  return streamJson(response);
}

async function applySetup(run, proposal, approval, suffix, status) {
  const response = await expectResponse(
    "/api/admin/setup/apply",
    status,
    jsonMutation({
      run,
      idempotencyKey: `m9-setup-apply-${run.shortId}-${suffix}`,
      body: { proposal, approval },
    }),
  );
  return streamJson(response);
}

async function exportDefinitions(run, idempotencyKey, status) {
  const response = await expectResponse(
    "/api/admin/setup/export",
    status,
    ownerMutation(run, idempotencyKey),
  );
  assert.equal(
    response.headers.get("content-type"),
    "application/vnd.a-op.artist-export+json",
  );
  return {
    bytes: await streamBytes(response),
    archiveSha256: response.headers.get("x-a-op-export-sha256"),
    replayed: response.headers.get("x-a-op-export-replayed"),
  };
}

async function verifyDefinitions(run, bytes) {
  const response = await expectResponse("/api/admin/setup/export/verify", 200, {
    ...ownerMutation(run, `m9-export-verify-${run.shortId}`, {
      "content-type": "application/vnd.a-op.artist-export+json",
    }),
    body: bytes,
  });
  return streamJson(response);
}

async function runJourney() {
  let server = await startServer({ runtimeLab: true });
  let run = null;
  let cleanup = null;
  try {
    run = await beginRun();
    const initialSetup = await setupWorkspace(run);
    assert.equal(initialSetup.workspace.state.status, "unconfigured");
    assert.match(initialSetup.source.fingerprint, /^sha256:[a-f0-9]{64}$/);

    const proposal = proposalFor(run, initialSetup.source.fingerprint);
    const beforePreview = await readRunState(run);
    assert.equal(beforePreview.stripeEnvironment, "test");
    assert.equal(beforePreview.livemode, false);
    assert.equal(beforePreview.statement, "No real payment will be accepted.");

    const proposalOnlyPreview = await previewSetup(run, proposal);
    assert.equal(proposalOnlyPreview.plan.writesPerformed, 0);
    assert.equal(proposalOnlyPreview.plan.readyForApply, false);
    assert.match(
      proposalOnlyPreview.plan.proposalHash,
      /^sha256:[a-f0-9]{64}$/,
    );
    const approval = approvalFor(
      run,
      proposal,
      proposalOnlyPreview.plan.proposalHash,
    );
    const approvedPreview = await previewSetup(run, proposal, approval);
    assert.equal(approvedPreview.plan.writesPerformed, 0);
    assert.equal(approvedPreview.plan.readyForApply, true);
    assert.deepEqual(approvedPreview.plan.blockers, []);
    assert.equal(approvedPreview.plan.operations.length, 17);
    assert.ok(
      approvedPreview.plan.operations.every(
        ({ mutationBoundary, state }) =>
          mutationBoundary === "d1" && state === "ready",
      ),
    );

    const afterPreview = await readRunState(run);
    assert.deepEqual(afterPreview.currentCounts, beforePreview.currentCounts);
    assert.deepEqual(afterPreview.artifacts, beforePreview.artifacts);
    assert.equal(
      afterPreview.sourceFingerprint,
      beforePreview.sourceFingerprint,
    );

    const firstApply = await applySetup(run, proposal, approval, "first", 201);
    assert.equal(firstApply.replayed, false);
    assert.equal(firstApply.result.status, "applied");
    assert.equal(firstApply.result.operationCount, 17);
    assert.equal(firstApply.receipt.operationCount, 17);
    assert.equal(firstApply.receipt.operations.length, 17);
    assert.equal(firstApply.receipt.stripeEnvironment, "test");
    assert.equal(firstApply.receipt.livemode, false);
    assert.equal(
      firstApply.receipt.statement,
      "No real payment will be accepted.",
    );
    assert.deepEqual(firstApply.deferred, []);

    const afterApply = await readRunState(run);
    assert.equal(afterApply.artifacts.setupApplications, 1);
    assert.equal(afterApply.artifacts.setupReceipts, 17);
    assert.equal(afterApply.artifacts.artistRevisions, 1);
    assert.equal(afterApply.artifacts.navigationItems, 8);
    assert.equal(afterApply.artifacts.legalVersions, 2);
    assert.equal(afterApply.artifacts.users, 1);
    assert.equal(afterApply.artifacts.editorUsers, 1);
    assert.equal(afterApply.artifacts.editorPermissions, 1);
    assert.equal(afterApply.artifacts.roles, 2);
    assert.equal(afterApply.artifacts.tracks, 1);
    assert.equal(afterApply.artifacts.trackRevisions, 3);
    assert.equal(afterApply.artifacts.releases, 1);
    assert.equal(afterApply.artifacts.releaseRevisions, 1);
    assert.equal(afterApply.artifacts.releaseTracks, 1);
    assert.equal(afterApply.artifacts.collections, 1);
    assert.equal(afterApply.artifacts.collectionRevisions, 1);
    assert.equal(afterApply.artifacts.collectionTracks, 1);
    assert.equal(afterApply.artifacts.accessPlans, 1);
    assert.equal(afterApply.artifacts.accessPlanItems, 1);
    assert.equal(afterApply.artifacts.accessGrantTemplates, 1);
    assert.equal(afterApply.artifacts.membershipPlans, 1);
    assert.equal(afterApply.artifacts.membershipPlanRevisions, 1);
    assert.equal(afterApply.artifacts.subscriptionPlans, 1);
    assert.equal(afterApply.artifacts.membershipCreditRules, 4);
    assert.equal(afterApply.artifacts.commerceBindingIntents, 3);
    assert.equal(afterApply.artifacts.licenseTerms, 1);
    assert.equal(afterApply.artifacts.licenseTermsVersions, 1);
    assert.equal(afterApply.artifacts.licenseOptions, 1);
    assert.equal(afterApply.artifacts.courses, 1);
    assert.equal(afterApply.artifacts.courseRevisions, 2);
    assert.equal(afterApply.artifacts.courseSections, 2);
    assert.equal(afterApply.artifacts.lessons, 2);
    assert.equal(afterApply.artifacts.lessonItems, 2);
    assert.equal(afterApply.artifacts.videos, 1);
    assert.equal(afterApply.artifacts.videoRevisions, 2);
    assert.equal(afterApply.artifacts.videoTranscripts, 2);
    assert.equal(afterApply.artifacts.contactForms, 1);
    assert.equal(afterApply.artifacts.contactConsentVersions, 1);
    assert.equal(afterApply.artifacts.telemetrySettings, 0);
    assert.equal(afterApply.artifacts.mediaObjects, 0);
    assert.equal(afterApply.artifacts.mediaJobs, 0);
    assertAppliedDefinitions(run, afterApply);

    const appliedSetup = await setupWorkspace(run);
    assert.equal(appliedSetup.workspace.state.status, "applied");
    const appliedApplication = appliedSetup.workspace.applications.find(
      ({ proposalHash }) =>
        proposalHash === appliedSetup.workspace.state.lastProposalHash,
    );
    assert.ok(appliedApplication);
    assert.equal(appliedApplication.status, "applied");
    assert.equal(appliedApplication.operationCount, 17);

    await expectHtml("/", 200, null, [run.artistName]);
    await expectHtml("/music", 200, null, [run.trackTitle]);
    await expectHtml("/courses", 200, null, [run.courseTitle, "1 lesson"]);
    await expectHtml("/videos", 200, null, [
      run.videoTitle,
      "Now Playing",
      "Watch externally",
    ]);
    await expectHtml("/contact", 200, null, [
      run.contactInvitation,
      run.contactEmail,
      run.contactConsent,
    ]);
    await expectHtml("/admin/artist", 200, run, [
      run.artistName,
      run.artistHeadline,
    ]);
    await expectHtml("/admin/music", 200, run, [
      run.trackTitle,
      run.releaseTitle,
      run.collectionTitle,
    ]);
    await expectHtml("/admin/access", 200, run, [
      run.accessPlanLabel,
      run.trackTitle,
    ]);
    await expectHtml("/admin/memberships", 200, run, [
      run.membershipPlanName,
      run.subscriptionPlanName,
    ]);
    await expectHtml("/admin/licensing", 200, run, [
      run.licenseTermsTitle,
      run.licenseOptionLabel,
    ]);
    await expectHtml("/admin/courses", 200, run, [run.courseTitle]);
    await expectHtml("/admin/videos", 200, run, [run.videoTitle]);
    await expectHtml("/admin/contact", 200, run, [
      run.contactInvitation,
      run.contactEmail,
      run.contactConsent,
    ]);
    await expectHtml("/admin/editors", 200, run, [
      run.editorDisplayName,
      run.editorEmail,
      "catalog.write",
    ]);
    await expectHtml("/admin/legal", 200, run, [
      "Fictional M9 Privacy Policy",
      "Fictional M9 Terms and Conditions",
    ]);
    await expectHtml("/admin/setup", 200, run, [
      "Proposal, approval, and recovery",
      "applied",
    ]);

    const replay = await applySetup(run, proposal, approval, "replay", 200);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.status, "applied");
    assert.equal(replay.result.operationCount, 17);
    const afterReplay = await readRunState(run);
    assert.deepEqual(afterReplay.currentCounts, afterApply.currentCounts);
    assert.deepEqual(afterReplay.artifacts, afterApply.artifacts);
    assert.equal(afterReplay.sourceFingerprint, afterApply.sourceFingerprint);
    assert.deepEqual(afterReplay.definitions, afterApply.definitions);

    const exportKey = `m9-artist-export-${run.shortId}`;
    const exported = await exportDefinitions(run, exportKey, 201);
    assert.equal(exported.replayed, "false");
    assert.match(exported.archiveSha256, /^[a-f0-9]{64}$/);
    assert.ok(exported.bytes.byteLength > 0);
    const archiveText = new TextDecoder().decode(exported.bytes);
    const archive = JSON.parse(archiveText);
    assert.equal(archive.manifest.format, "a-op.artist-installation-export");
    assert.equal(archive.manifest.formatVersion, 1);
    assert.equal(archive.manifest.applicationSchemaVersion, 19);
    assert.equal(archive.manifest.entries.length, archive.files.length);
    assert.ok(archive.files.length >= 19);
    assert.ok(
      archive.manifest.entries.every(
        ({ path, byteLength, sha256 }) =>
          /^[a-z0-9][a-z0-9./-]*\.json$/.test(path) &&
          Number.isSafeInteger(byteLength) &&
          byteLength > 0 &&
          /^[a-f0-9]{64}$/.test(sha256),
      ),
    );
    assert.doesNotMatch(
      archiveText,
      /(?:R2Bucket|object_key|\/Users\/|file:)/i,
    );
    for (const exportedDefinition of [
      run.trackKey,
      run.releaseKey,
      run.collectionKey,
      run.accessPlanKey,
      run.grantKey,
      run.membershipPlanKey,
      run.subscriptionPlanKey,
      run.licenseTermsKey,
      run.licenseOptionKey,
      run.courseKey,
      run.lessonKey,
      run.videoKey,
      run.contactEmail,
    ]) {
      assert.match(archiveText, new RegExp(exportedDefinition));
    }

    const verified = await verifyDefinitions(run, exported.bytes);
    assert.equal(verified.result.status, "verified");
    assert.equal(verified.result.archiveSha256, exported.archiveSha256);
    assert.equal(
      verified.result.semanticFingerprint,
      archive.manifest.semanticFingerprint,
    );
    assert.equal(verified.result.fileCount, archive.files.length);

    const rehearsal = await rehearseArtistExportBytesInMemory(exported.bytes);
    assert.equal(
      rehearsal.restoredSemanticFingerprint,
      rehearsal.semanticFingerprint,
    );
    assert.equal(
      rehearsal.semanticFingerprint,
      archive.manifest.semanticFingerprint,
    );
    assert.ok(rehearsal.recordCount > 0);
    assert.equal(rehearsal.firstPass.inserted, rehearsal.recordCount);
    assert.equal(rehearsal.secondPass.inserted, 0);
    assert.equal(rehearsal.secondPass.reused, rehearsal.recordCount);
    assert.equal(rehearsal.duplicateCount, 0);
    assert.equal(rehearsal.commerceBindingState, "pending");
    assert.equal(rehearsal.externalVideoBindingState, "pending");

    const replayedExport = await exportDefinitions(run, exportKey, 200);
    assert.equal(replayedExport.replayed, "true");
    assert.equal(replayedExport.archiveSha256, exported.archiveSha256);
    assert.deepEqual(replayedExport.bytes, exported.bytes);
    const afterExport = await readRunState(run);
    assert.equal(afterExport.artifacts.exportManifests, 1);
    assert.equal(afterExport.artifacts.mediaObjects, 0);
    assert.equal(afterExport.artifacts.mediaJobs, 0);

    const cleanupResponse = await expectResponse(
      "/api/runtime-lab/m9",
      200,
      jsonMutation({ method: "DELETE", body: { runId: run.runId } }),
    );
    cleanup = (await streamJson(cleanupResponse)).cleanup;
    assert.deepEqual(cleanup, {
      restored: true,
      retainedVerificationRows: 0,
      baselineCountsRestored: true,
      mutableStateRestored: true,
      sourceFingerprintRestored: true,
      foreignKeyViolationCount: 0,
      r2Calls: 0,
      r2ObjectsTouched: 0,
      mediaBytesCreated: 0,
      temporaryFilesCreated: 0,
      externalCalls: 0,
    });
    await expectResponse(
      `/api/runtime-lab/m9?run=${encodeURIComponent(run.runId)}`,
      404,
    );
    run = null;
  } finally {
    if (run !== null && server.exitCode === null) {
      const response = await fetch(`${baseUrl}/api/runtime-lab/m9`, {
        ...jsonMutation({ method: "DELETE", body: { runId: run.runId } }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status !== 200 && response.status !== 404) {
        throw new Error("The Milestone 9 fallback cleanup failed.");
      }
    }
    await stopServer(server);
  }

  server = await startServer({ runtimeLab: false });
  try {
    await expectResponse(
      "/api/runtime-lab/m9",
      404,
      jsonMutation({ body: { action: "begin" } }),
    );
  } finally {
    await stopServer(server);
  }

  return cleanup;
}

runJourney()
  .then((cleanup) => {
    process.stdout.write(
      `${JSON.stringify({
        status: "passed",
        journey: "m9-setup-portability",
        setupTopicsApplied: 15,
        internalPublicationApplied: true,
        setupReplayCreatedDuplicates: false,
        exportVerified: true,
        restoreRehearsedInMemory: true,
        stripeEnvironment: "test",
        livemode: false,
        statement: "No real payment will be accepted.",
        cleanup,
      })}\n`,
    );
  })
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : "Milestone 9 verification failed."}\n`,
    );
    process.exitCode = 1;
  });
