import assert from "node:assert/strict";
import test from "node:test";

import {
  SITE_INPUT_LIMITS,
  SITE_VALIDATION_ISSUE_CODES,
  validateArtistRevisionInput,
  validateEditorAssignmentInput,
  validateIdempotencyKey,
  validateModuleSettingsInput,
  validateNavigationSnapshotInput,
  validatePageDraftInput,
} from "../lib/site/index.ts";

test("normalizes bounded artist revision text without inventing content", () => {
  assert.deepEqual(
    validateArtistRevisionInput({
      displayName: "  Example Artist  ",
      siteTitle: " Example Artist · Music ",
      headline: "  New work\r\nand live dates  ",
      introduction: "  Music made independently.  ",
      footerText: "   ",
    }),
    {
      ok: true,
      value: {
        displayName: "Example Artist",
        siteTitle: "Example Artist · Music",
        headline: "New work\nand live dates",
        introduction: "Music made independently.",
        footerText: "",
      },
    },
  );

  const invalid = validateArtistRevisionInput({
    displayName: "",
    siteTitle: "x".repeat(SITE_INPUT_LIMITS.siteTitle + 1),
    headline: "",
    introduction: "",
    footerText: "",
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(
    invalid.issues.map(({ code, field }) => ({ code, field })),
    [
      {
        code: SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED,
        field: "displayName",
      },
      { code: SITE_VALIDATION_ISSUE_CODES.FIELD_TOO_LONG, field: "siteTitle" },
    ],
  );
});

test("canonicalizes a complete primary and footer navigation snapshot", () => {
  const input = [
    {
      id: "footer",
      items: [
        {
          itemKey: "SOURCE",
          label: "Source",
          href: "https://example.invalid/source",
          position: 20,
          moduleKey: null,
          external: true,
        },
      ],
    },
    {
      id: "primary",
      items: [
        {
          itemKey: "courses",
          label: "Courses",
          href: "/courses?view=all#available",
          position: 20,
          moduleKey: "courses",
          external: false,
        },
        {
          itemKey: "MUSIC",
          label: "Music",
          href: " /music ",
          position: 10,
          moduleKey: null,
          external: false,
        },
      ],
    },
  ];

  const result = validateNavigationSnapshotInput(input);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.map((set) => ({
      id: set.id,
      items: set.items.map((item) => ({
        itemKey: item.itemKey,
        href: item.href,
        position: item.position,
        moduleKey: item.moduleKey,
        external: item.external,
      })),
    })),
    [
      {
        id: "primary",
        items: [
          {
            itemKey: "music",
            href: "/music",
            position: 10,
            moduleKey: null,
            external: false,
          },
          {
            itemKey: "courses",
            href: "/courses?view=all#available",
            position: 20,
            moduleKey: "courses",
            external: false,
          },
        ],
      },
      {
        id: "footer",
        items: [
          {
            itemKey: "source",
            href: "https://example.invalid/source",
            position: 20,
            moduleKey: null,
            external: true,
          },
        ],
      },
    ],
  );
});

test("rejects duplicate navigation coordinates, unsafe hrefs, and missing music", () => {
  const input = [
    {
      id: "primary",
      items: [
        {
          itemKey: "about",
          label: "About",
          href: "//outside.invalid/about",
          position: 10,
          moduleKey: null,
          external: false,
        },
        {
          itemKey: "ABOUT",
          label: "Elsewhere",
          href: "http://example.invalid",
          position: 10,
          moduleKey: "unknown",
          external: true,
        },
      ],
    },
    { id: "footer", items: [] },
  ];

  const first = validateNavigationSnapshotInput(input);
  const second = validateNavigationSnapshotInput(input);
  assert.deepEqual(second, first);
  assert.equal(first.ok, false);
  assert.deepEqual(
    first.issues.map(({ code, field }) => ({ code, field })),
    [
      {
        code: SITE_VALIDATION_ISSUE_CODES.NAVIGATION_INTERNAL_HREF_INVALID,
        field: "navigation[0].items[0].href",
      },
      {
        code: SITE_VALIDATION_ISSUE_CODES.NAVIGATION_EXTERNAL_HREF_INVALID,
        field: "navigation[0].items[1].href",
      },
      {
        code: SITE_VALIDATION_ISSUE_CODES.MODULE_KEY_INVALID,
        field: "navigation[0].items[1].moduleKey",
      },
      {
        code: SITE_VALIDATION_ISSUE_CODES.NAVIGATION_MUSIC_REQUIRED,
        field: "navigation.primary.items",
      },
    ],
  );

  const duplicates = validateNavigationSnapshotInput([
    {
      id: "primary",
      items: [
        {
          itemKey: "music",
          label: "Music",
          href: "/music",
          position: 10,
          moduleKey: null,
          external: false,
        },
        {
          itemKey: "MUSIC",
          label: "Catalog",
          href: "/catalog",
          position: 10,
          moduleKey: null,
          external: false,
        },
      ],
    },
    { id: "footer", items: [] },
  ]);
  assert.equal(duplicates.ok, false);
  assert.deepEqual(
    duplicates.issues.map(({ code }) => code),
    [
      SITE_VALIDATION_ISSUE_CODES.NAVIGATION_ITEM_KEY_DUPLICATE,
      SITE_VALIDATION_ISSUE_CODES.NAVIGATION_POSITION_DUPLICATE,
    ],
  );
});

test("normalizes page drafts and validates optional module ownership", () => {
  assert.deepEqual(
    validatePageDraftInput({
      slug: "  Listening-Room ",
      title: " Listening Room ",
      introduction: "  Hear the current release. ",
      bodyText: " Line one.\r\n\r\nLine two. ",
      moduleKey: "whats-new",
      kind: "standard",
    }),
    {
      ok: true,
      value: {
        slug: "listening-room",
        title: "Listening Room",
        introduction: "Hear the current release.",
        bodyText: "Line one.\n\nLine two.",
        sectionRevisionIds: [],
        moduleKey: "whats-new",
        kind: "standard",
      },
    },
  );

  const invalid = validatePageDraftInput({
    slug: "bad/slug",
    title: "Page",
    introduction: "",
    bodyText: "",
    moduleKey: "music",
    kind: "article",
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(
    invalid.issues.map(({ code, field }) => ({ code, field })),
    [
      { code: SITE_VALIDATION_ISSUE_CODES.SLUG_INVALID, field: "slug" },
      {
        code: SITE_VALIDATION_ISSUE_CODES.MODULE_KEY_INVALID,
        field: "moduleKey",
      },
      { code: SITE_VALIDATION_ISSUE_CODES.FIELD_VALUE_INVALID, field: "kind" },
    ],
  );
});

test("accepts only bounded plain JSON objects for module settings", () => {
  assert.deepEqual(validateModuleSettingsInput(undefined), {
    ok: true,
    value: {},
  });
  assert.deepEqual(
    validateModuleSettingsInput({
      theme: { accent: "orange", enabled: true },
      count: 2,
      labels: ["one", "two"],
    }),
    {
      ok: true,
      value: {
        count: 2,
        labels: ["one", "two"],
        theme: { accent: "orange", enabled: true },
      },
    },
  );

  assert.deepEqual(validateModuleSettingsInput(["not", "an", "object"]), {
    ok: false,
    issues: [
      {
        code: SITE_VALIDATION_ISSUE_CODES.SETTINGS_OBJECT_REQUIRED,
        field: "settings",
        message: "Module settings must be a JSON object when included.",
      },
    ],
  });

  const circular = {};
  circular.self = circular;
  const circularResult = validateModuleSettingsInput(circular);
  assert.equal(circularResult.ok, false);
  assert.equal(
    circularResult.issues[0].code,
    SITE_VALIDATION_ISSUE_CODES.SETTINGS_JSON_INVALID,
  );

  const tooLarge = validateModuleSettingsInput({
    value: "x".repeat(SITE_INPUT_LIMITS.moduleSettingsBytes),
  });
  assert.equal(tooLarge.ok, false);
  assert.equal(
    tooLarge.issues[0].code,
    SITE_VALIDATION_ISSUE_CODES.SETTINGS_LIMIT_EXCEEDED,
  );
});

test("normalizes editor identity and accepts scoped content permissions", () => {
  assert.deepEqual(
    validateEditorAssignmentInput({
      email: " Editor@Example.Invalid ",
      displayName: "  Example Editor ",
      permissionKey: "pages.write",
      scopeId: " About-The-Artist ",
    }),
    {
      ok: true,
      value: {
        email: "editor@example.invalid",
        displayName: "Example Editor",
        permissionKey: "pages.write",
        scopeId: "about-the-artist",
      },
    },
  );
  assert.equal(
    validateEditorAssignmentInput({
      email: "all@example.invalid",
      displayName: "All Pages Editor",
      scopeId: "*",
    }).value.scopeId,
    "*",
  );
  assert.deepEqual(
    validateEditorAssignmentInput({
      email: "catalog@example.invalid",
      displayName: "Catalog Editor",
      permissionKey: "catalog.write",
      scopeId: "release-one",
    }).value,
    {
      email: "catalog@example.invalid",
      displayName: "Catalog Editor",
      permissionKey: "catalog.write",
      scopeId: "release-one",
    },
  );
  assert.equal(
    validateEditorAssignmentInput({
      email: "media@example.invalid",
      displayName: "Media Editor",
      permissionKey: "media.write",
      scopeId: "*",
    }).value.permissionKey,
    "media.write",
  );

  const invalid = validateEditorAssignmentInput({
    email: "not-an-email",
    displayName: "Editor",
    permissionKey: "admin.write",
    scopeId: "bad/scope",
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(
    invalid.issues.map(({ code, field }) => ({ code, field })),
    [
      { code: SITE_VALIDATION_ISSUE_CODES.EMAIL_INVALID, field: "email" },
      {
        code: SITE_VALIDATION_ISSUE_CODES.EDITOR_PERMISSION_INVALID,
        field: "permissionKey",
      },
      {
        code: SITE_VALIDATION_ISSUE_CODES.EDITOR_SCOPE_INVALID,
        field: "scopeId",
      },
    ],
  );
});

test("accepts only stable 8-128 character safe ASCII idempotency keys", () => {
  assert.deepEqual(validateIdempotencyKey("page:about.v2-001"), {
    ok: true,
    value: { idempotencyKey: "page:about.v2-001" },
  });

  for (const invalidKey of [
    "short",
    " leading-space",
    "contains space",
    "slash/is/unsafe",
    "éightchars",
    "x".repeat(SITE_INPUT_LIMITS.idempotencyKeyMax + 1),
  ]) {
    const result = validateIdempotencyKey(invalidKey);
    assert.equal(result.ok, false, invalidKey);
    assert.equal(
      result.issues[0].code,
      SITE_VALIDATION_ISSUE_CODES.IDEMPOTENCY_KEY_INVALID,
    );
  }
});
