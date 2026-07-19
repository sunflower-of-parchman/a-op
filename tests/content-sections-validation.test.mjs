import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { validateContentSectionDraftInput, validateContentSectionKey } =
  await import("../lib/content-sections/validation.ts");

test("content section input normalizes text and accepts only exact durable fields", () => {
  const result = validateContentSectionDraftInput({
    sectionKey: "artist-statement",
    kind: "prose",
    heading: "  Artist statement  ",
    bodyText: "First line\r\nSecond line",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    sectionKey: "artist-statement",
    kind: "prose",
    heading: "Artist statement",
    bodyText: "First line\nSecond line",
  });

  const extra = validateContentSectionDraftInput({
    ...result.value,
    imageUrl: "/temporary-image.png",
  });
  assert.equal(extra.ok, false);
  assert.equal(extra.issues[0].code, "content-section-input-invalid");
});

test("content section keys and bodies reject unsafe or incomplete values", () => {
  for (const value of ["Artist-Statement", "artist/statement", "new", ""]) {
    assert.equal(validateContentSectionKey(value).ok, false);
  }
  const missingBody = validateContentSectionDraftInput({
    sectionKey: "artist-statement",
    kind: "callout",
    heading: "Artist statement",
    bodyText: "   ",
  });
  assert.equal(missingBody.ok, false);
  assert.ok(
    missingBody.issues.some(
      ({ code, field }) =>
        code === "content-section-text-required" && field === "bodyText",
    ),
  );
});
