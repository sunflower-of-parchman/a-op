import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [{ validateVideoDraftInput }, updateValidation] = await Promise.all([
  import("../lib/video/validation.ts"),
  import("../lib/updates/validation.ts"),
]);
const { validateEditorialDraftInput, validateUpdateDraftInput } =
  updateValidation;

function externalVideo(overrides = {}) {
  return {
    slug: "fictional-session",
    title: "Fictional session",
    summary: "A fictional video record without media bytes.",
    artistContext: "Context written by a fictional artist for validation.",
    credits: [{ name: "Fictional Musician", role: "Performer", details: "" }],
    deliveryKind: "external",
    posterDerivativeId: null,
    hostedDerivativeId: null,
    externalProvider: "youtube",
    externalEmbedUrl:
      "https://www.youtube-nocookie.com/embed/fictional-identifier",
    transcripts: [
      {
        language: "en",
        transcriptText: "A fictional transcript.",
        captionsDerivativeId: null,
      },
    ],
    ...overrides,
  };
}

test("video validation accepts exact external and hosted contracts", () => {
  const external = validateVideoDraftInput(externalVideo());
  assert.equal(external.ok, true);
  assert.equal(
    external.value.externalEmbedUrl,
    "https://www.youtube-nocookie.com/embed/fictional-identifier",
  );

  const hosted = validateVideoDraftInput(
    externalVideo({
      deliveryKind: "artist_hosted",
      hostedDerivativeId: "derivative_fictional_video",
      externalProvider: null,
      externalEmbedUrl: null,
    }),
  );
  assert.equal(hosted.ok, true);
  assert.equal(hosted.value.hostedDerivativeId, "derivative_fictional_video");
});

test("video validation accepts transcript-optional external embeds and rejects unsafe delivery", () => {
  assert.equal(
    validateVideoDraftInput(externalVideo({ transcripts: [] })).ok,
    true,
  );
  for (const input of [
    externalVideo({ externalEmbedUrl: "http://www.youtube.com/embed/example" }),
    externalVideo({
      externalEmbedUrl: "https://example.invalid/embed/example",
    }),
    externalVideo({
      deliveryKind: "artist_hosted",
      hostedDerivativeId: "derivative_fictional_video",
      externalProvider: null,
      externalEmbedUrl: null,
      transcripts: [],
    }),
    { ...externalVideo(), unexpected: true },
  ]) {
    const result = validateVideoDraftInput(input);
    assert.equal(result.ok, false);
    assert.ok(result.issues.length > 0);
  }
});

test("update and editorial validation preserve structured text and exact resource links", () => {
  const update = validateUpdateDraftInput({
    slug: "fictional-update",
    title: "Fictional update",
    summary: "A fictional summary.",
    body: [
      { type: "heading", text: "Recorded today" },
      { type: "paragraph", text: "Fictional publishing evidence." },
    ],
    audience: "account",
    resource: { type: "video", id: "video_fictional" },
  });
  assert.equal(update.ok, true);
  assert.deepEqual(update.value.resource, {
    type: "video",
    id: "video_fictional",
  });

  const editorial = validateEditorialDraftInput({
    slug: "fictional-notes",
    title: "Fictional notes",
    excerpt: "A fictional excerpt.",
    body: [{ type: "quote", text: "Fictional authored text." }],
  });
  assert.equal(editorial.ok, true);
});

test("structured publishing rejects executable markup fields and unsupported resource types", () => {
  const base = {
    slug: "fictional-update",
    title: "Fictional update",
    summary: "",
    body: [{ type: "paragraph", text: "Safe text." }],
    audience: "public",
    resource: null,
  };
  assert.equal(
    validateUpdateDraftInput({ ...base, bodyHtml: "<script>bad()</script>" })
      .ok,
    false,
  );
  assert.equal(
    validateUpdateDraftInput({
      ...base,
      resource: { type: "checkout", id: "test" },
    }).ok,
    false,
  );
  assert.equal(
    validateEditorialDraftInput({
      slug: "fictional-notes",
      title: "Fictional notes",
      excerpt: "",
      body: [{ type: "html", text: "<b>not supported</b>" }],
    }).ok,
    false,
  );
});
