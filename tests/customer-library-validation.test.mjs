import assert from "node:assert/strict";
import test from "node:test";

import {
  validateFavoriteDesiredStateInput,
  validateListeningCheckpointInput,
  validatePlaylistArchiveInput,
  validatePlaylistCreateInput,
  validatePlaylistReplacementInput,
} from "../lib/customer-library/validation.ts";

function assertInvalid(result, field) {
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.field === field));
}

test("customer-library validators accept exact normalized request shapes", () => {
  assert.deepEqual(
    validateFavoriteDesiredStateInput({
      targetType: "track",
      targetId: "track_one",
      active: true,
      expectedRevision: null,
    }),
    {
      ok: true,
      value: {
        targetType: "track",
        targetId: "track_one",
        active: true,
        expectedRevision: null,
      },
    },
  );
  assert.equal(
    validateFavoriteDesiredStateInput({
      targetType: "collection",
      targetId: "collection_one",
      active: true,
      expectedRevision: null,
    }).ok,
    true,
  );

  assert.deepEqual(
    validatePlaylistCreateInput({
      name: "  Night drive  ",
      description: "First line\r\nSecond line",
      trackIds: ["track_one", "track_two"],
    }).value,
    {
      name: "Night drive",
      description: "First line\nSecond line",
      trackIds: ["track_one", "track_two"],
    },
  );

  assert.equal(
    validatePlaylistReplacementInput({
      name: "Night drive",
      description: "",
      trackIds: [],
      expectedRevision: 2,
    }).ok,
    true,
  );
  assert.equal(validatePlaylistArchiveInput({ expectedRevision: 3 }).ok, true);
  assert.equal(
    validateListeningCheckpointInput({
      trackId: "track_one",
      positionMs: 12_000,
      meaningful: true,
      expectedRevision: null,
    }).ok,
    true,
  );
});

test("customer-library validators reject unknown fields, duplicate tracks, and unsafe CAS values", () => {
  assertInvalid(
    validateFavoriteDesiredStateInput({
      targetType: "track",
      targetId: "track_one",
      active: true,
      expectedRevision: null,
      userId: "user_other",
    }),
    "userId",
  );
  assertInvalid(
    validatePlaylistCreateInput({
      name: "Duplicates",
      description: "",
      trackIds: ["track_one", "track_one"],
    }),
    "trackIds.1",
  );
  assertInvalid(
    validatePlaylistReplacementInput({
      name: "Stale",
      description: "",
      trackIds: [],
      expectedRevision: 0,
    }),
    "expectedRevision",
  );
  assertInvalid(
    validateListeningCheckpointInput({
      trackId: "unsafe/id",
      positionMs: -1,
      meaningful: "yes",
      expectedRevision: 0,
    }),
    "trackId",
  );
});
