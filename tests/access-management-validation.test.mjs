import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  validateAccessPlanCreateInput,
  validateAccessPlanGrantInput,
  validateAccessPlanUpdateInput,
} = await import("../lib/access-management/validation.ts");

function item(overrides = {}) {
  return {
    resourceType: "track",
    resourceId: "track_validation",
    actions: ["view", "stream", "download"],
    remainingUses: null,
    downloadDisposition: "attachment",
    ...overrides,
  };
}

test("access-plan validation normalizes one exact current catalog definition", () => {
  const result = validateAccessPlanCreateInput({
    slug: "  SUPPORTER-ACCESS  ",
    name: "  Supporter access  ",
    description: "  Current artist-defined access.  ",
    items: [item()],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    slug: "supporter-access",
    name: "Supporter access",
    description: "Current artist-defined access.",
    items: [item()],
  });
});

test("access-plan validation rejects client principals, unsupported resource types, and finite uses", () => {
  const cases = [
    validateAccessPlanCreateInput({
      slug: "supporter-access",
      name: "Supporter access",
      description: "",
      items: [item()],
      actorUserId: "user_other",
    }),
    validateAccessPlanUpdateInput({
      name: "Course access",
      description: "",
      items: [item({ resourceType: "lesson", resourceId: "lesson_future" })],
    }),
    validateAccessPlanUpdateInput({
      name: "Finite access",
      description: "",
      items: [item({ remainingUses: 1 })],
    }),
    validateAccessPlanGrantInput({
      accessPlanId: "access_plan_validation",
      customerUserId: "user_customer",
      startsAt: null,
      expiresAt: null,
      reason: "",
      actorUserId: "user_other",
    }),
  ];

  for (const result of cases) {
    assert.equal(result.ok, false);
  }
  assert.ok(cases[0].issues.some(({ field }) => field === "actorUserId"));
  assert.ok(
    cases[1].issues.some(({ field }) => field === "items.0.resourceType"),
  );
  assert.ok(
    cases[2].issues.some(({ field }) => field === "items.0.remainingUses"),
  );
  assert.ok(cases[3].issues.some(({ field }) => field === "actorUserId"));
});

test("grant validation requires one ordered access window", () => {
  const valid = validateAccessPlanGrantInput({
    accessPlanId: "access_plan_validation",
    customerUserId: "user_customer",
    startsAt: "2026-07-18T12:00:00-06:00",
    expiresAt: "2026-07-19T12:00:00-06:00",
    reason: "  Fictional direct access.  ",
  });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.value, {
    accessPlanId: "access_plan_validation",
    customerUserId: "user_customer",
    startsAt: "2026-07-18T18:00:00.000Z",
    expiresAt: "2026-07-19T18:00:00.000Z",
    reason: "Fictional direct access.",
  });

  const invalid = validateAccessPlanGrantInput({
    accessPlanId: "access_plan_validation",
    customerUserId: "user_customer",
    startsAt: "2026-07-20T00:00:00.000Z",
    expiresAt: "2026-07-19T00:00:00.000Z",
    reason: "",
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some(({ field }) => field === "expiresAt"));
});
