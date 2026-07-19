import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESS_DENIAL_REASONS,
  decideAccess,
} from "../lib/access/decide-access.ts";

const NOW = "2026-07-18T18:00:00.000Z";

function identity(userId, ...roles) {
  return { userId, roles };
}

function request(overrides = {}) {
  return {
    identity: null,
    resourceType: "media-stream",
    resourceId: "media_track-1",
    action: "stream",
    now: NOW,
    facts: {},
    ...overrides,
  };
}

function grant(overrides = {}) {
  return {
    granteeUserId: "user_customer-1",
    resourceType: "media-stream",
    resourceId: "media_track-1",
    actions: ["stream"],
    state: "active",
    ...overrides,
  };
}

test("public availability is action-specific and anonymous protected reads fail closed", async () => {
  assert.deepEqual(
    await decideAccess(
      request({ facts: { publicActions: ["view", "stream"] } }),
    ),
    {
      allowed: true,
      reason: "public-resource",
      source: "public",
    },
  );

  assert.deepEqual(
    await decideAccess(
      request({
        action: "download",
        facts: { publicActions: ["view", "stream"] },
      }),
    ),
    {
      allowed: false,
      reason: "authentication-required",
      source: "none",
    },
  );

  assert.deepEqual(await decideAccess(request()), {
    allowed: false,
    reason: "authentication-required",
    source: "none",
  });
});

test("owner authority is installation-wide while editor authority stays resource-scoped", async () => {
  assert.deepEqual(
    await decideAccess(
      request({
        identity: identity("user_owner-1", "owner"),
        action: "manage",
      }),
    ),
    { allowed: true, reason: "owner-role", source: "role" },
  );

  assert.deepEqual(
    await decideAccess(
      request({
        identity: identity("user_editor-1", "editor"),
        action: "edit",
        facts: { editorActions: ["edit"] },
      }),
    ),
    { allowed: true, reason: "editor-scope", source: "role" },
  );

  assert.deepEqual(
    await decideAccess(
      request({
        identity: identity("user_editor-1", "editor"),
        action: "manage",
        facts: { editorActions: ["edit"] },
      }),
    ),
    { allowed: false, reason: "not-authorized", source: "none" },
  );
});

test("customer authority requires scoped ownership or a matching explicit grant", async () => {
  assert.deepEqual(
    await decideAccess(
      request({
        identity: identity("user_customer-1", "customer"),
        facts: { accountActions: ["stream"] },
      }),
    ),
    {
      allowed: true,
      reason: "authenticated-account",
      source: "account",
    },
  );

  assert.deepEqual(
    await decideAccess(
      request({
        identity: identity("user_customer-1", "customer"),
        resourceType: "customer-record",
        resourceId: "library_1",
        action: "view",
        facts: {
          resourceOwnerUserId: "user_customer-1",
          ownershipActions: ["view", "edit"],
        },
      }),
    ),
    { allowed: true, reason: "resource-ownership", source: "ownership" },
  );

  assert.deepEqual(
    await decideAccess(
      request({
        identity: identity("user_customer-2", "customer"),
        resourceType: "customer-record",
        resourceId: "library_1",
        action: "view",
        facts: {
          resourceOwnerUserId: "user_customer-1",
          ownershipActions: ["view"],
        },
      }),
    ),
    { allowed: false, reason: "not-authorized", source: "none" },
  );

  assert.deepEqual(
    await decideAccess(
      request({ identity: identity("user_customer-1", "customer") }),
    ),
    { allowed: false, reason: "not-authorized", source: "none" },
  );
});

test("matching grants cover protected stream, download, course, and license resources", async () => {
  const cases = [
    ["media-stream", "media_track-1", "stream"],
    ["media-download", "download_track-1", "download"],
    ["course-asset", "lesson_audio-1", "stream"],
    ["license-document", "license_doc-1", "download"],
  ];

  for (const [resourceType, resourceId, action] of cases) {
    const decision = await decideAccess(
      request({
        identity: identity("user_customer-1", "customer"),
        resourceType,
        resourceId,
        action,
        facts: {
          grants: [
            grant({
              resourceType,
              resourceId,
              actions: [action],
              startsAt: "2026-07-01T00:00:00.000Z",
              expiresAt: "2026-08-01T00:00:00.000Z",
              remainingUses: 2,
              entitlementId: "entitlement_1",
              downloadDisposition:
                action === "download" ? "attachment" : "inline",
              privateObjectKey: "private/audio/master-v1.aiff",
              customerEmail: "listener@example.test",
            }),
          ],
          privateObjectKey: "private/audio/master-v1.aiff",
        },
      }),
    );

    assert.deepEqual(decision, {
      allowed: true,
      reason: "explicit-grant",
      source: "grant",
      entitlementId: "entitlement_1",
      expiresAt: "2026-08-01T00:00:00.000Z",
      remainingUses: 2,
      downloadDisposition: action === "download" ? "attachment" : "inline",
    });

    const serialized = JSON.stringify(decision);
    assert.doesNotMatch(
      serialized,
      /private\/audio|master-v1|listener@example\.test|user_customer|media_track/,
    );
  }
});

test("grants match the authenticated principal, resource, and requested action exactly", async () => {
  const customer = identity("user_customer-1", "customer");

  const cases = [
    grant({ granteeUserId: "user_customer-2" }),
    grant({ resourceType: "media-download" }),
    grant({ resourceId: "media_track-2" }),
  ];

  for (const mismatchedGrant of cases) {
    assert.deepEqual(
      await decideAccess(
        request({ identity: customer, facts: { grants: [mismatchedGrant] } }),
      ),
      { allowed: false, reason: "not-authorized", source: "none" },
    );
  }

  assert.deepEqual(
    await decideAccess(
      request({
        identity: customer,
        facts: { grants: [grant({ actions: ["download"] })] },
      }),
    ),
    { allowed: false, reason: "action-not-granted", source: "none" },
  );
});

test("revocation, activation, expiry, and remaining-use boundaries have stable denials", async () => {
  const customer = identity("user_customer-1", "customer");
  const cases = [
    [grant({ state: "revoked" }), "grant-revoked"],
    [grant({ startsAt: "2026-07-19T00:00:00.000Z" }), "grant-not-yet-active"],
    [grant({ expiresAt: NOW }), "grant-expired"],
    [grant({ remainingUses: 0 }), "grant-exhausted"],
  ];

  for (const [candidate, reason] of cases) {
    const first = await decideAccess(
      request({ identity: customer, facts: { grants: [candidate] } }),
    );
    const second = await decideAccess(
      request({ identity: customer, facts: { grants: [candidate] } }),
    );

    assert.deepEqual(first, { allowed: false, reason, source: "none" });
    assert.deepEqual(second, first);
    assert.ok(ACCESS_DENIAL_REASONS.includes(reason));
  }
});

test("multiple matching grants resolve deterministically without mutating server facts", async () => {
  const grants = Object.freeze([
    Object.freeze(
      grant({
        expiresAt: "2026-07-20T00:00:00.000Z",
        remainingUses: 1,
      }),
    ),
    Object.freeze(grant()),
    Object.freeze(
      grant({
        expiresAt: "2026-09-01T00:00:00.000Z",
        remainingUses: 8,
      }),
    ),
  ]);

  const decision = await decideAccess(
    request({
      identity: identity("user_customer-1", "customer"),
      facts: { grants },
    }),
  );

  assert.deepEqual(decision, {
    allowed: true,
    reason: "explicit-grant",
    source: "grant",
  });
  assert.equal(grants[0].expiresAt, "2026-07-20T00:00:00.000Z");
  assert.equal(grants[1].expiresAt, undefined);
});

test("malformed requests and authority facts always deny instead of throwing", async () => {
  const cases = [
    null,
    request({ now: "not-a-time" }),
    request({ resourceId: "private/audio/master-v1.aiff" }),
    request({ action: "publish" }),
    request({ identity: { userId: "user_1", roles: ["superuser"] } }),
    request({ facts: { publicActions: null } }),
    request({ facts: { publicActions: ["manage"] } }),
    request({
      identity: identity("user_customer-1", "customer"),
      action: "manage",
      facts: { grants: [grant({ actions: ["manage"] })] },
    }),
    request({ facts: { grants: [grant({ expiresAt: "invalid" })] } }),
    request({ facts: { grants: [grant({ entitlementId: "../private" })] } }),
    request({
      facts: { grants: [grant({ downloadDisposition: "redirect" })] },
    }),
    request({
      facts: {
        grants: [grant({ startsAt: "2026-08-01", expiresAt: "2026-07-01" })],
      },
    }),
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("unreadable request");
        },
      },
    ),
  ];

  for (const candidate of cases) {
    const decision = await decideAccess(candidate);
    assert.equal(decision.allowed, false);
    assert.equal(decision.source, "none");
    assert.ok(ACCESS_DENIAL_REASONS.includes(decision.reason));
  }
});
