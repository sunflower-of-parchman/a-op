import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_KEYS,
  CAPABILITY_REGISTRY,
  CORE_CAPABILITY_KEYS,
  MODULE_ISSUE_CODES,
  MODULE_KEYS,
  MODULE_REGISTRY,
  planModuleTransition,
  resolveModuleNavigation,
  validateModuleSelection,
} from "../lib/modules/index.ts";

test("declares the complete core and activatable capability set", () => {
  assert.deepEqual(CORE_CAPABILITY_KEYS, [
    "music",
    "catalog",
    "streaming",
    "identity",
    "access",
    "administration",
  ]);
  assert.deepEqual(MODULE_KEYS, [
    "downloads",
    "customer-library",
    "licensing",
    "memberships",
    "subscriptions",
    "courses",
    "video",
    "whats-new",
    "contact",
    "telemetry",
  ]);
  assert.deepEqual(
    CAPABILITY_REGISTRY.map(({ key }) => key),
    CAPABILITY_KEYS,
  );
  assert.ok(
    CAPABILITY_REGISTRY.slice(0, CORE_CAPABILITY_KEYS.length).every(
      ({ kind, deactivatable }) => kind === "core" && !deactivatable,
    ),
  );
  assert.ok(
    MODULE_REGISTRY.every(
      ({ kind, deactivatable }) => kind === "optional" && deactivatable,
    ),
  );
});

test("keeps registry dependencies and navigation metadata internally stable", () => {
  const moduleKeys = new Set(MODULE_KEYS);
  const coreKeys = new Set(CORE_CAPABILITY_KEYS);
  const navigationIds = [];

  for (const definition of CAPABILITY_REGISTRY) {
    for (const requirement of definition.requires) {
      assert.ok(
        definition.kind === "core"
          ? coreKeys.has(requirement)
          : moduleKeys.has(requirement),
      );
      assert.notEqual(requirement, definition.key);
    }

    if (definition.kind === "optional") {
      for (const requirement of definition.coreRequirements) {
        assert.ok(coreKeys.has(requirement));
      }
    }

    for (const item of [
      ...definition.publicNavigation,
      ...definition.adminNavigation,
    ]) {
      navigationIds.push(item.id);
      assert.match(item.id, /^(public|admin)\.[a-z0-9.-]+$/);
      assert.match(item.href, /^\/(?!\/)/);
      assert.equal(Number.isSafeInteger(item.order), true);
    }
  }

  assert.equal(new Set(navigationIds).size, navigationIds.length);
  assert.equal(Object.isFrozen(CAPABILITY_REGISTRY), true);
  assert.equal(Object.isFrozen(MODULE_REGISTRY[0].requires), true);
  assert.equal(Object.isFrozen(MODULE_REGISTRY[0].adminNavigation[0]), true);
});

test("validates and canonicalizes active modules without mutating input", () => {
  const selected = Object.freeze([
    "subscriptions",
    "memberships",
    "customer-library",
    "video",
  ]);
  const result = validateModuleSelection(selected);

  assert.deepEqual(result, {
    ok: true,
    activeModules: [
      "customer-library",
      "memberships",
      "subscriptions",
      "video",
    ],
    activeCapabilities: [
      ...CORE_CAPABILITY_KEYS,
      "customer-library",
      "memberships",
      "subscriptions",
      "video",
    ],
  });
  assert.deepEqual(selected, [
    "subscriptions",
    "memberships",
    "customer-library",
    "video",
  ]);
});

test("reports machine-stable selection errors deterministically", () => {
  const malformed = [
    "music",
    "subscriptions",
    "subscriptions",
    "future-module",
    42,
  ];
  const first = validateModuleSelection(malformed);
  const second = validateModuleSelection(malformed);

  assert.deepEqual(second, first);
  assert.equal(first.ok, false);
  assert.deepEqual(
    first.issues.map(({ code, field, index, moduleKey }) => ({
      code,
      field,
      index,
      moduleKey,
    })),
    [
      {
        code: MODULE_ISSUE_CODES.CORE_IS_IMPLICIT,
        field: "activeModules",
        index: 0,
        moduleKey: "music",
      },
      {
        code: MODULE_ISSUE_CODES.KEY_DUPLICATE,
        field: "activeModules",
        index: 2,
        moduleKey: "subscriptions",
      },
      {
        code: MODULE_ISSUE_CODES.KEY_UNKNOWN,
        field: "activeModules",
        index: 3,
        moduleKey: "future-module",
      },
      {
        code: MODULE_ISSUE_CODES.KEY_INVALID,
        field: "activeModules",
        index: 4,
        moduleKey: undefined,
      },
    ],
  );

  const missingDependency = validateModuleSelection(["subscriptions"]);
  assert.equal(missingDependency.ok, false);
  assert.deepEqual(missingDependency.issues, [
    {
      code: MODULE_ISSUE_CODES.DEPENDENCY_MISSING,
      field: "activeModules",
      moduleKey: "subscriptions",
      dependencyKey: "memberships",
      message: 'Module "subscriptions" requires active module "memberships".',
    },
  ]);
});

test("activation plans include transitive dependencies before requested modules", () => {
  const input = Object.freeze({
    currentModules: Object.freeze([]),
    activate: Object.freeze(["subscriptions", "licensing"]),
  });
  const result = planModuleTransition(input);

  assert.equal(result.ok, true);
  assert.deepEqual(result.activate, [
    "licensing",
    "memberships",
    "subscriptions",
  ]);
  assert.deepEqual(result.activeModulesAfter, [
    "licensing",
    "memberships",
    "subscriptions",
  ]);
  assert.ok(
    result.operations.every(
      ({ action, statePolicy }) =>
        action === "activate" && statePolicy === "validate-and-reuse",
    ),
  );
  assert.deepEqual(input, {
    currentModules: [],
    activate: ["subscriptions", "licensing"],
  });
});

test("deactivation preserves durable state and orders dependents first", () => {
  const result = planModuleTransition({
    currentModules: ["memberships", "subscriptions", "video"],
    deactivate: ["memberships", "subscriptions"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.deactivate, ["subscriptions", "memberships"]);
  assert.deepEqual(result.activeModulesAfter, ["video"]);
  assert.deepEqual(
    result.operations.map(({ action, moduleKey, statePolicy }) => ({
      action,
      moduleKey,
      statePolicy,
    })),
    [
      {
        action: "deactivate",
        moduleKey: "subscriptions",
        statePolicy: "preserve",
      },
      {
        action: "deactivate",
        moduleKey: "memberships",
        statePolicy: "preserve",
      },
    ],
  );
});

test("deactivation rejects core capabilities and active dependents", () => {
  const core = planModuleTransition({
    currentModules: [],
    deactivate: ["streaming"],
  });
  assert.equal(core.ok, false);
  assert.deepEqual(
    core.issues.map(({ code, moduleKey }) => ({ code, moduleKey })),
    [
      {
        code: MODULE_ISSUE_CODES.CORE_DEACTIVATION,
        moduleKey: "streaming",
      },
    ],
  );

  const dependent = planModuleTransition({
    currentModules: ["memberships", "subscriptions"],
    deactivate: ["memberships"],
  });
  assert.equal(dependent.ok, false);
  assert.deepEqual(
    dependent.issues.map(
      ({ code, moduleKey, dependencyKey, dependentKey }) => ({
        code,
        moduleKey,
        dependencyKey,
        dependentKey,
      }),
    ),
    [
      {
        code: MODULE_ISSUE_CODES.ACTIVE_DEPENDENT,
        moduleKey: "memberships",
        dependencyKey: "memberships",
        dependentKey: "subscriptions",
      },
    ],
  );
});

test("activation and deactivation conflicts fail before producing a plan", () => {
  const result = planModuleTransition({
    currentModules: [],
    activate: ["subscriptions"],
    deactivate: ["memberships"],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.issues.map(({ code, moduleKey }) => ({ code, moduleKey })),
    [
      {
        code: MODULE_ISSUE_CODES.CHANGE_CONFLICT,
        moduleKey: "memberships",
      },
    ],
  );
});

test("navigation follows active modules in one stable order", () => {
  assert.deepEqual(
    resolveModuleNavigation([], "public").map(({ label, href }) => ({
      label,
      href,
    })),
    [
      { label: "Music", href: "/music" },
      { label: "About", href: "/about" },
    ],
  );

  assert.deepEqual(
    resolveModuleNavigation(
      ["customer-library", "memberships", "courses", "video", "contact"],
      "public",
    ).map(({ label }) => label),
    ["Music", "About", "Courses", "Videos", "Membership", "Contact"],
  );

  const adminLabels = resolveModuleNavigation(
    ["customer-library", "memberships", "subscriptions", "telemetry"],
    "admin",
  ).map(({ label }) => label);
  assert.ok(adminLabels.includes("Memberships"));
  assert.equal(adminLabels.includes("Subscriptions"), false);
  assert.ok(adminLabels.includes("Telemetry"));
  assert.equal(adminLabels.includes("Licensing"), false);
});
