import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  MembershipStateTransitionError,
  addCalendarInterval,
  addDurationDays,
  boundaryReached,
  transitionMembershipState,
} = await import("../lib/memberships/state-machine.ts");

test("membership and subscription state transitions preserve terminal history", () => {
  assert.equal(transitionMembershipState("pending", "activated"), "active");
  assert.equal(transitionMembershipState("active", "renewed"), "active");
  assert.equal(transitionMembershipState("active", "paused"), "paused");
  assert.equal(transitionMembershipState("paused", "resumed"), "active");
  assert.equal(
    transitionMembershipState("active", "cancellation_scheduled"),
    "cancellation_scheduled",
  );
  assert.equal(
    transitionMembershipState("cancellation_scheduled", "cancellation_cleared"),
    "active",
  );
  assert.equal(
    transitionMembershipState("cancellation_scheduled", "canceled"),
    "canceled",
  );
  assert.equal(transitionMembershipState("paused", "expired"), "expired");

  for (const state of ["canceled", "expired"]) {
    for (const event of [
      "activated",
      "renewed",
      "paused",
      "resumed",
      "cancellation_scheduled",
      "cancellation_cleared",
      "canceled",
      "expired",
    ]) {
      assert.throws(
        () => transitionMembershipState(state, event),
        MembershipStateTransitionError,
      );
    }
  }
});

test("period calculation is deterministic at month, year, and day boundaries", () => {
  assert.equal(
    addCalendarInterval("2024-01-31T18:30:00.000Z", "month", 1),
    "2024-02-29T18:30:00.000Z",
  );
  assert.equal(
    addCalendarInterval("2024-02-29T18:30:00.000Z", "year", 1),
    "2025-02-28T18:30:00.000Z",
  );
  assert.equal(
    addCalendarInterval("2026-07-18T18:30:00.000Z", "month", 3),
    "2026-10-18T18:30:00.000Z",
  );
  assert.equal(
    addDurationDays("2026-07-18T18:30:00.000Z", 30),
    "2026-08-17T18:30:00.000Z",
  );
  assert.equal(
    boundaryReached("2026-08-17T18:30:00.000Z", "2026-08-17T18:30:00.000Z"),
    true,
  );
  assert.equal(
    boundaryReached("2026-08-17T18:29:59.999Z", "2026-08-17T18:30:00.000Z"),
    false,
  );
});
