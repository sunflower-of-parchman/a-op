import assert from "node:assert/strict";
import test from "node:test";

import {
  SetupContractError,
  canonicalJson,
  compileSetupOperationPlan,
  createExternalActionHash,
  createProposalArtifact,
  createSourceStateFingerprint,
  inspectStripeTestCredentials,
  runSetupPreflight,
  validateSetupProposal,
} from "../lib/setup/index.ts";

const SOURCE_FINGERPRINT = `sha256:${"1".repeat(64)}`;

function validProposal(overrides = {}) {
  const proposal = {
    schemaVersion: "aop.setup-proposal.v2",
    proposalId: "artist-setup-one",
    createdAt: "2026-07-19T12:00:00Z",
    sourceStateFingerprint: SOURCE_FINGERPRINT,
    commerce: {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      journey: "inactive",
      statement: "No real payment will be accepted.",
    },
    topics: {
      artist: {
        artistKey: "artist",
        publicName: "Artist Name",
        shortName: null,
        headline: "Music from the artist's own Site.",
        description: "An artist-owned catalog and customer relationship.",
        biography: "",
        publicContactEmail: "artist@example.invalid",
        publicContactUrl: "https://artist.example.invalid",
      },
      capabilitiesNavigation: {
        activeModules: [],
        primaryNavigation: [
          {
            navigationKey: "music",
            label: "Music",
            href: "/music",
            order: 10,
            module: null,
          },
        ],
        footerNavigation: [],
      },
      rightsMedia: {
        rightsStatement: "",
        media: [],
      },
      catalogReleases: {
        tracks: [],
        releases: [],
        collections: [],
      },
      streamingDownloads: {
        tracks: [],
      },
      customerAccess: {
        customerLibraries: false,
        protectedDelivery: true,
        accessPlans: [],
        grantTemplates: [],
      },
      membershipsSubscriptions: {
        membershipPlans: [],
        subscriptionPlans: [],
      },
      credits: {
        downloadCreditRules: [],
        licenseCreditRules: [],
      },
      licensing: {
        terms: [],
        options: [],
      },
      coursesVideo: {
        courses: [],
        videos: [],
      },
      editorialPresentation: {
        posts: [],
        updates: [],
        about: {
          title: "About",
          introduction: "About this artist.",
          bodyText: "",
          publication: "draft",
        },
        pageHeroes: [],
      },
      contactConsent: {
        enabled: false,
        publicEmail: null,
        invitation: "",
        consentText: "",
        categories: [],
      },
      telemetryRetention: {
        enabled: false,
        collectionMode: "disabled",
        retentionDays: 30,
        meaningfulListenSeconds: 10,
        firstPartyOnly: true,
      },
      privacyTerms: {
        privacy: {
          title: "Privacy Policy",
          body: "Artist review is required before publication.",
          action: "save-draft",
        },
        terms: {
          title: "Terms and Conditions",
          body: "Artist review is required before publication.",
          action: "save-draft",
        },
        artistReviewRequired: true,
      },
      accountsPublication: {
        ownerStrategy: "authenticated-requester",
        ownerAcknowledgement: "artist-authorized",
        editorAccountAliases: [],
        publication: {
          artist: "draft",
          navigation: "draft",
          catalog: "draft",
          content: "draft",
          media: "prepare-only",
        },
        externalPublication: "approval-required",
      },
    },
    mediaActions: [],
    sourceChanges: [],
    externalActions: [],
  };
  return Object.assign(proposal, overrides);
}

function approvalFor(artifact, overrides = {}) {
  return {
    schemaVersion: "aop.setup-approval.v1",
    approvalId: "artist-approval-one",
    proposalId: artifact.proposal.proposalId,
    proposalHash: artifact.proposalHash,
    sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
    approvedAt: "2026-07-19T12:05:00Z",
    approvedBy: {
      authority: "artist-owner",
      accountAlias: "owner",
    },
    approvedScopes: ["configuration", "account-authority", "legal-drafts"],
    statement: "I approve this exact proposal hash.",
    ...overrides,
  };
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, reverseObjectKeys(entry)]),
    );
  }
  return value;
}

function assertInvalid(proposal, expectedCode) {
  assert.throws(
    () => validateSetupProposal(proposal),
    (error) => {
      assert.ok(error instanceof SetupContractError);
      assert.equal(error.code, "SETUP_INPUT_INVALID");
      assert.ok(error.issues.some((entry) => entry.code === expectedCode));
      return true;
    },
  );
}

test("the exact versioned proposal covers all fifteen setup topics", async () => {
  const proposal = validateSetupProposal(validProposal());
  assert.deepEqual(Object.keys(proposal.topics), [
    "artist",
    "capabilitiesNavigation",
    "rightsMedia",
    "catalogReleases",
    "streamingDownloads",
    "customerAccess",
    "membershipsSubscriptions",
    "credits",
    "licensing",
    "coursesVideo",
    "editorialPresentation",
    "contactConsent",
    "telemetryRetention",
    "privacyTerms",
    "accountsPublication",
  ]);
  assert.equal(proposal.commerce.adapter, "stripe-test-simulation");
  assert.equal(proposal.commerce.livemode, false);
  assert.equal(
    proposal.commerce.statement,
    "No real payment will be accepted.",
  );
  assert.equal(Object.hasOwn(proposal, "approval"), false);

  const artifact = await createProposalArtifact(proposal);
  assert.match(artifact.proposalHash, /^sha256:[a-f0-9]{64}$/);
});

test("canonical JSON sorts object keys and preserves meaningful array order", async () => {
  assert.equal(
    canonicalJson({ z: 1, a: { d: 4, b: 2 }, list: ["b", "a"] }),
    '{"a":{"b":2,"d":4},"list":["b","a"],"z":1}',
  );

  const proposal = validProposal();
  const reordered = reverseObjectKeys(proposal);
  const first = await createProposalArtifact(proposal);
  const second = await createProposalArtifact(reordered);
  assert.equal(first.proposalHash, second.proposalHash);
});

test("setup media links validate exact kinds, confirmed rights, delivery shape, and lesson order", () => {
  const value = validProposal();
  value.topics.capabilitiesNavigation.activeModules = ["courses", "video"];
  value.topics.rightsMedia = {
    rightsStatement: "The fictional artist confirms these media uses.",
    media: [
      {
        mediaKey: "lesson-audio",
        sourceAlias: "approved-lesson-audio",
        kind: "audio",
        rights: "confirmed",
        intendedUse: "protected",
        attribution: null,
      },
      {
        mediaKey: "hosted-video",
        sourceAlias: "approved-hosted-video",
        kind: "video",
        rights: "confirmed",
        intendedUse: "protected",
        attribution: null,
      },
    ],
  };
  value.topics.catalogReleases.tracks = [
    {
      trackKey: "linked-track",
      title: "Linked Track",
      versionLabel: null,
      releaseKey: null,
      sequence: 1,
      mediaKey: "lesson-audio",
    },
  ];
  value.topics.streamingDownloads.tracks = [
    {
      trackKey: "linked-track",
      streaming: "disabled",
      download: "disabled",
    },
  ];
  value.topics.coursesVideo = {
    courses: [
      {
        courseKey: "linked-course",
        title: "Linked Course",
        summary: "A fictional media-linked Course.",
        accessPlanKey: null,
        lessons: [
          {
            lessonKey: "media-lesson",
            title: "Media lesson",
            summary: "A fictional lesson.",
            mediaKeys: ["hosted-video", "lesson-audio"],
          },
        ],
      },
    ],
    videos: [
      {
        videoKey: "linked-video",
        title: "Linked Video",
        summary: "A fictional hosted video.",
        mediaKey: "hosted-video",
        transcript: "A complete fictional transcript.",
        externalEmbedUrl: null,
        consentRequired: false,
      },
    ],
  };

  const parsed = validateSetupProposal(value);
  assert.deepEqual(parsed.topics.coursesVideo.courses[0].lessons[0].mediaKeys, [
    "hosted-video",
    "lesson-audio",
  ]);

  const wrongTrackKind = structuredClone(value);
  wrongTrackKind.topics.rightsMedia.media[0].kind = "video";
  assertInvalid(wrongTrackKind, "track-media-kind");

  const pendingRights = structuredClone(value);
  pendingRights.topics.rightsMedia.media[1].rights = "pending";
  assertInvalid(pendingRights, "course-media-rights");

  const mixedDelivery = structuredClone(value);
  mixedDelivery.topics.coursesVideo.videos[0].externalEmbedUrl =
    "https://www.youtube-nocookie.com/embed/fictional";
  mixedDelivery.topics.coursesVideo.videos[0].consentRequired = true;
  assertInvalid(mixedDelivery, "hosted-video-shape");

  const missingAvailability = structuredClone(value);
  missingAvailability.topics.streamingDownloads.tracks = [];
  assertInvalid(missingAvailability, "track-availability-required");
});

test("source-state fingerprints normalize resource order", async () => {
  const resources = [
    {
      kind: "artist",
      resourceKey: "artist",
      revision: 2,
      contentHash: `sha256:${"a".repeat(64)}`,
    },
    {
      kind: "catalog-releases",
      resourceKey: "catalog",
      revision: 4,
      contentHash: null,
    },
  ];
  const source = {
    schemaVersion: "aop.setup-source-state.v1",
    installationId: "aop",
    d1SchemaVersion: 15,
    setupRevision: 3,
    resources,
  };
  assert.equal(
    await createSourceStateFingerprint(source),
    await createSourceStateFingerprint({
      ...source,
      resources: [...resources].reverse(),
    }),
  );
});

test("proposal validation rejects unknown fields, paths, secrets, card data, provider data, and unsafe URLs", () => {
  const unknown = validProposal();
  unknown.topics.artist.extra = true;
  assertInvalid(unknown, "unknown-field");

  const path = validProposal();
  path.topics.artist.biography =
    "The source is at /Users/example/private-audio.wav.";
  assertInvalid(path, "machine-path-rejected");

  const secret = validProposal();
  secret.topics.artist.biography = "sk_test_FictionalSecretValue001";
  assertInvalid(secret, "secret-rejected");

  const card = validProposal();
  card.topics.artist.biography = "4242 4242 4242 4242";
  assertInvalid(card, "payment-card-rejected");

  const provider = validProposal();
  provider.topics.artist.biography = "cus_FictionalProvider123";
  assertInvalid(provider, "provider-payload-rejected");

  const payload = validProposal();
  payload.providerPayload = { object: "anything" };
  assertInvalid(payload, "forbidden-field");

  const unsafeUrl = validProposal();
  unsafeUrl.topics.artist.publicContactUrl = "http://artist.example.invalid";
  assertInvalid(unsafeUrl, "unsafe-url");

  const unsafeUrlInText = validProposal();
  unsafeUrlInText.topics.artist.biography =
    "The old address was http://artist.example.invalid.";
  assertInvalid(unsafeUrlInText, "unsafe-url");

  const credentialedUrlInText = validProposal();
  credentialedUrlInText.topics.artist.biography =
    "Do not use https://user:password@artist.example.invalid/private.";
  assertInvalid(credentialedUrlInText, "unsafe-url");
});

test("Sites commerce rejects live and unknown modes in proposal content", () => {
  for (const commerce of [
    { stripeEnvironment: "live" },
    { livemode: true },
    { adapter: "stripe-live" },
    { adapter: "manual" },
  ]) {
    const proposal = validProposal();
    Object.assign(proposal.commerce, commerce);
    assert.throws(
      () => validateSetupProposal(proposal),
      (error) =>
        error instanceof SetupContractError &&
        error.code === "SETUP_INPUT_INVALID",
    );
  }
});

test("module dependencies and module-owned setup content fail closed", () => {
  const dependency = validProposal();
  dependency.topics.capabilitiesNavigation.activeModules = ["subscriptions"];
  assertInvalid(dependency, "module-dependency");

  const inactiveContact = validProposal();
  inactiveContact.topics.contactConsent = {
    enabled: true,
    publicEmail: "artist@example.invalid",
    invitation: "Write to the artist.",
    consentText: "I agree to send this message.",
    categories: ["general"],
  };
  assertInvalid(inactiveContact, "inactive-module-content");
});

test("approved aliases compile stable media operations without carrying paths", async () => {
  const proposal = validProposal();
  proposal.topics.rightsMedia = {
    rightsStatement: "The artist confirms the rights for this source.",
    media: [
      {
        mediaKey: "opening-track-audio",
        sourceAlias: "artist-audio",
        kind: "audio",
        rights: "confirmed",
        intendedUse: "public",
        attribution: null,
      },
    ],
  };
  proposal.mediaActions = [
    {
      actionId: "prepare-opening-track",
      mediaKey: "opening-track-audio",
      sourceAlias: "artist-audio",
      operation: "inspect-and-prepare",
      derivatives: ["waveform", "stream"],
      requiresArtistApproval: true,
    },
  ];
  const artifact = await createProposalArtifact(proposal);
  const approval = approvalFor(artifact, {
    approvedScopes: [
      "configuration",
      "media-preparation",
      "account-authority",
      "legal-drafts",
    ],
  });
  const plan = await compileSetupOperationPlan({
    proposal,
    approval,
    currentSourceStateFingerprint: SOURCE_FINGERPRINT,
  });
  assert.equal(plan.readyForApply, true);
  assert.equal(plan.writesPerformed, 0);
  assert.equal(plan.operations.length, 17);
  assert.ok(
    plan.operations.some(
      (operation) =>
        operation.topic === "media" &&
        operation.target === "prepare-opening-track",
    ),
  );
  assert.doesNotMatch(JSON.stringify(plan), /artist-audio|Users|private-audio/);
});

test("public media upload approvals bind the exact confirmed public publication target", () => {
  const valid = validProposal();
  valid.topics.rightsMedia = {
    rightsStatement: "The artist confirms this public media source.",
    media: [
      {
        mediaKey: "public-cover-art",
        sourceAlias: "artist-cover-art",
        kind: "artwork",
        rights: "confirmed",
        intendedUse: "public",
        attribution: null,
      },
    ],
  };
  valid.mediaActions = [
    {
      actionId: "publish-public-cover-art",
      mediaKey: "public-cover-art",
      sourceAlias: "artist-cover-art",
      operation: "publish-approved",
      derivatives: ["thumbnail"],
      requiresArtistApproval: true,
    },
  ];
  valid.externalActions = [
    {
      actionId: "upload-public-cover-art",
      kind: "public-media-upload",
      summary: "Upload the exact artist-approved public cover artwork.",
      target: "public-cover-art",
      approval: "michael-action-specific",
    },
  ];

  const parsed = validateSetupProposal(valid);
  assert.equal(parsed.externalActions[0].target, "public-cover-art");

  const missingTarget = structuredClone(valid);
  missingTarget.externalActions[0].target = "different-cover-art";
  assertInvalid(missingTarget, "public-media-target-mismatch");

  const protectedTarget = structuredClone(valid);
  protectedTarget.topics.rightsMedia.media[0].intendedUse = "protected";
  assertInvalid(protectedTarget, "public-media-target-mismatch");

  const pendingRights = structuredClone(valid);
  pendingRights.topics.rightsMedia.media[0].rights = "pending";
  assertInvalid(pendingRights, "public-media-target-mismatch");

  const preparationOnly = structuredClone(valid);
  preparationOnly.mediaActions[0].operation = "inspect-and-prepare";
  assertInvalid(preparationOnly, "public-media-target-mismatch");

  const missingPublicationAction = structuredClone(valid);
  missingPublicationAction.mediaActions = [];
  assertInvalid(missingPublicationAction, "public-media-target-mismatch");
});

test("exact-hash approval makes a plan ready and changed content invalidates it", async () => {
  const raw = validProposal();
  const before = JSON.stringify(raw);
  const artifact = await createProposalArtifact(raw);
  const approval = approvalFor(artifact);
  const first = await compileSetupOperationPlan({
    proposal: raw,
    approval,
    currentSourceStateFingerprint: SOURCE_FINGERPRINT,
  });
  const second = await compileSetupOperationPlan({
    proposal: raw,
    approval,
    currentSourceStateFingerprint: SOURCE_FINGERPRINT,
  });
  assert.equal(first.readyForApply, true);
  assert.equal(first.writesPerformed, 0);
  assert.deepEqual(first.operations, second.operations);
  assert.equal(JSON.stringify(raw), before);

  const changed = structuredClone(raw);
  changed.topics.artist.headline = "A changed artist sentence.";
  await assert.rejects(
    compileSetupOperationPlan({
      proposal: changed,
      approval,
      currentSourceStateFingerprint: SOURCE_FINGERPRINT,
    }),
    (error) =>
      error instanceof SetupContractError &&
      error.code === "SETUP_PROPOSAL_HASH_MISMATCH",
  );
});

test("external actions remain blocked until their own exact Michael approval", async () => {
  const proposal = validProposal();
  proposal.externalActions = [
    {
      actionId: "host-build-week-site",
      kind: "sites-hosting",
      summary: "Host the exact validated Site.",
      target: "site",
      approval: "michael-action-specific",
    },
  ];
  const artifact = await createProposalArtifact(proposal);
  const approval = approvalFor(artifact);
  const blocked = await compileSetupOperationPlan({
    proposal,
    approval,
    currentSourceStateFingerprint: SOURCE_FINGERPRINT,
  });
  assert.equal(blocked.readyForApply, false);
  assert.ok(
    blocked.blockers.includes(
      "external-action-approval-required:host-build-week-site",
    ),
  );

  const externalApproval = {
    schemaVersion: "aop.external-action-approval.v1",
    approvalId: "host-build-week-site-approval",
    proposalId: artifact.proposal.proposalId,
    proposalHash: artifact.proposalHash,
    sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
    actionId: "host-build-week-site",
    actionHash: await createExternalActionHash(
      artifact.proposal.externalActions[0],
    ),
    approvedAt: "2026-07-19T12:10:00Z",
    approvedBy: "michael",
    statement: "I approve this exact external action hash.",
  };
  const ready = await compileSetupOperationPlan({
    proposal,
    approval,
    externalApprovals: [externalApproval],
    currentSourceStateFingerprint: SOURCE_FINGERPRINT,
  });
  assert.equal(ready.readyForApply, true);
  assert.equal(
    ready.operations.find((operation) => operation.topic === "external")?.state,
    "ready",
  );
  assert.equal(ready.writesPerformed, 0);
});

test("missing test credentials block only an active simulated commerce journey", () => {
  const repository = {
    requiredFilesPresent: true,
    d1BindingReady: true,
    r2BindingReady: true,
  };
  const localMedia = {
    aliasFilePresent: false,
    aliases: [],
    ffprobeAvailable: false,
    ffmpegAvailable: false,
  };
  const inactive = runSetupPreflight({
    proposal: validProposal(),
    environment: {},
    repository,
    localMedia,
  });
  assert.equal(inactive.ok, true);
  assert.equal(inactive.commerce.credentialState, "not-configured");

  const activeProposal = validProposal();
  activeProposal.commerce.journey = "active";
  activeProposal.topics.capabilitiesNavigation.activeModules = ["downloads"];
  const active = runSetupPreflight({
    proposal: activeProposal,
    environment: {},
    repository,
    localMedia,
  });
  assert.equal(active.ok, false);
  assert.equal(
    active.checks.find((check) => check.id === "stripe-test-mode")?.status,
    "blocked",
  );

  const ready = runSetupPreflight({
    proposal: activeProposal,
    environment: {
      STRIPE_PUBLISHABLE_KEY: "pk_test_FictionalSetupKey001",
      STRIPE_SECRET_KEY: "sk_test_FictionalSetupSecret001",
      STRIPE_WEBHOOK_SECRET: "whsec_FictionalSetupWebhook001",
    },
    repository,
    localMedia,
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.commerce.credentialState, "ready");
  assert.doesNotMatch(JSON.stringify(ready), /FictionalSetup/);
});

test("present malformed and live credentials fail hard without echoing values", () => {
  for (const environment of [
    { STRIPE_SECRET_KEY: "not-a-test-key-FictionalPrivate" },
    { STRIPE_SECRET_KEY: "sk_live_FictionalPrivate001" },
    { UNRELATED_VALUE: "rk_live_FictionalPrivate001" },
  ]) {
    assert.throws(
      () => inspectStripeTestCredentials(environment),
      (error) => {
        assert.ok(error instanceof SetupContractError);
        assert.ok(
          [
            "SETUP_STRIPE_CONFIGURATION_INVALID",
            "SETUP_LIVE_CREDENTIAL_REJECTED",
          ].includes(error.code),
        );
        assert.doesNotMatch(
          `${error.message}\n${error.stack ?? ""}`,
          /FictionalPrivate/,
        );
        return true;
      },
    );
  }
});
