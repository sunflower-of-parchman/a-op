import assert from "node:assert/strict";
import test from "node:test";

import {
  SiteReadIntegrityError,
  readActiveEditorPermissions,
  readActiveModuleKeys,
  readAdminPageSummaries,
  readArtistModules,
  readArtistRevision,
  readInstallationState,
  readNavigationSnapshot,
  readPublicNavigationSnapshot,
  readPublishedPageBySlug,
} from "../db/site-read.ts";

function fakeBinding(responses) {
  const queue = [...responses];
  const calls = [];

  function consume(kind) {
    const response = queue.shift();
    if (!response || response.kind !== kind) {
      throw new Error(`Expected a queued ${kind} response.`);
    }
    return response.value;
  }

  return {
    calls,
    binding: {
      prepare(sql) {
        const call = { sql, bindings: [] };
        calls.push(call);
        const statement = {
          bind(...bindings) {
            call.bindings = bindings;
            return statement;
          },
          async first() {
            return consume("first");
          },
          async all() {
            return { results: consume("all") };
          },
        };
        return statement;
      },
    },
  };
}

const timestamp = "2026-07-19 00:10:00";

function artistRevisionRow(overrides = {}) {
  return {
    artist_config_id: "artist",
    config_version: 2,
    published_at: timestamp,
    revision_id: "artist_revision_2",
    revision: 2,
    display_name: "Artist",
    site_title: "Artist Site",
    headline: "New music",
    introduction: "An introduction.",
    footer_text: "Artist-owned.",
    created_by_user_id: "user_owner",
    created_at: timestamp,
    ...overrides,
  };
}

function moduleRow(moduleKey, active, overrides = {}) {
  return {
    module_key: moduleKey,
    active: active ? 1 : 0,
    revision: 1,
    settings_json: "{}",
    activated_at: active ? timestamp : null,
    deactivated_at: null,
    updated_by_user_id: active ? "user_owner" : null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function navigationRow(overrides = {}) {
  return {
    set_id: "primary",
    set_label: "Primary navigation",
    draft_version: 2,
    published_version: 1,
    set_revision: 1,
    published_at: timestamp,
    item_id: "nav_music",
    item_key: "music",
    item_label: "Music",
    href: "/music",
    position: 0,
    module_key: null,
    external: 0,
    module_active: null,
    ...overrides,
  };
}

test("artist revision reads follow the requested durable pointer", async () => {
  const fake = fakeBinding([
    { kind: "first", value: artistRevisionRow() },
    { kind: "first", value: null },
  ]);

  const draft = await readArtistRevision(fake.binding, "draft");
  const unpublished = await readArtistRevision(fake.binding, "published");

  assert.equal(draft?.siteTitle, "Artist Site");
  assert.equal(draft?.revision, 2);
  assert.equal(unpublished, null);
  assert.deepEqual(fake.calls[0].bindings, ["draft"]);
  assert.deepEqual(fake.calls[1].bindings, ["published"]);
  assert.match(fake.calls[0].sql, /artist_config\.draft_revision_id/);
  assert.match(fake.calls[0].sql, /artist_config\.published_revision_id/);
});

test("module reads validate registry keys, JSON, and dependency state", async () => {
  const rows = [
    moduleRow("memberships", true),
    moduleRow("subscriptions", true),
    moduleRow("contact", false),
  ];
  const fake = fakeBinding([
    { kind: "all", value: rows },
    { kind: "all", value: rows },
  ]);

  const modules = await readArtistModules(fake.binding);
  assert.deepEqual(
    modules.map(({ moduleKey }) => moduleKey),
    ["memberships", "subscriptions", "contact"],
  );
  assert.deepEqual(await readActiveModuleKeys(fake.binding), [
    "memberships",
    "subscriptions",
  ]);

  const malformed = fakeBinding([
    {
      kind: "all",
      value: [moduleRow("future-module", true)],
    },
  ]);
  await assert.rejects(
    () => readArtistModules(malformed.binding),
    SiteReadIntegrityError,
  );
});

test("public navigation keeps core items and filters inactive module links", async () => {
  const rows = [
    navigationRow(),
    navigationRow({
      item_id: "nav_courses",
      item_key: "courses",
      item_label: "Courses",
      href: "/courses",
      position: 1,
      module_key: "courses",
      module_active: 0,
    }),
    navigationRow({
      item_id: "nav_video",
      item_key: "videos",
      item_label: "Videos",
      href: "/videos",
      position: 2,
      module_key: "video",
      module_active: 1,
    }),
  ];
  const fake = fakeBinding([
    { kind: "all", value: rows },
    { kind: "all", value: rows },
  ]);

  const publicSnapshot = await readNavigationSnapshot(
    fake.binding,
    "primary",
    "published",
    "public",
  );
  const draftSnapshot = await readNavigationSnapshot(
    fake.binding,
    "primary",
    "draft",
    "administration",
  );

  assert.deepEqual(
    publicSnapshot?.items.map(({ itemKey }) => itemKey),
    ["music", "videos"],
  );
  assert.deepEqual(
    draftSnapshot?.items.map(({ itemKey }) => itemKey),
    ["music", "courses", "videos"],
  );
  assert.equal(publicSnapshot?.version, 1);
  assert.equal(draftSnapshot?.version, 2);
  assert.deepEqual(fake.calls[0].bindings, ["primary", "published"]);
  assert.match(fake.calls[0].sql, /LEFT JOIN artist_modules/);
});

test("published navigation presents the complete neutral framework only before setup", async () => {
  const rows = [
    navigationRow(),
    navigationRow({
      item_id: "nav_courses",
      item_key: "courses",
      item_label: "Courses",
      href: "/courses",
      position: 1,
      module_key: "courses",
      module_active: 0,
    }),
  ];
  const fake = fakeBinding([
    { kind: "first", value: { status: "unconfigured" } },
    { kind: "all", value: rows },
    { kind: "first", value: { status: "applied" } },
    { kind: "all", value: rows },
  ]);

  const preview = await readPublicNavigationSnapshot(fake.binding, "primary");
  const configured = await readPublicNavigationSnapshot(
    fake.binding,
    "primary",
  );

  assert.deepEqual(
    preview?.items.map(({ itemKey }) => itemKey),
    ["music", "courses"],
  );
  assert.deepEqual(
    configured?.items.map(({ itemKey }) => itemKey),
    ["music"],
  );
  assert.match(fake.calls[0].sql, /FROM setup_state/);
  assert.deepEqual(fake.calls[1].bindings, ["primary", "published"]);
});

test("published page reads require both publication and active linked module", async () => {
  const pageRow = {
    page_id: "page_courses",
    slug: "courses",
    module_key: "courses",
    kind: "standard",
    published_at: timestamp,
    module_active: 1,
    revision_id: "page_courses_revision_1",
    revision: 1,
    title: "Courses",
    introduction: "Learn directly from the artist.",
    body_text: "Course details.",
    created_by_user_id: "user_owner",
    revision_created_at: timestamp,
    section_id: null,
    section_key: null,
    section_revision_id: null,
    section_revision: null,
    section_position: null,
    section_kind: null,
    section_heading: null,
    section_body_text: null,
  };
  const fake = fakeBinding([
    { kind: "all", value: [pageRow] },
    { kind: "all", value: [] },
    { kind: "all", value: [] },
  ]);

  assert.equal(
    (await readPublishedPageBySlug(fake.binding, "courses"))?.revision.title,
    "Courses",
  );
  assert.equal(await readPublishedPageBySlug(fake.binding, "courses"), null);
  assert.equal(await readPublishedPageBySlug(fake.binding, "missing"), null);
  assert.deepEqual(fake.calls[0].bindings, ["courses"]);
  assert.match(fake.calls[0].sql, /pages\.publication_state = 'published'/);
  assert.match(fake.calls[0].sql, /page_revisions\.module_key IS NULL/);
  assert.match(fake.calls[0].sql, /artist_modules\.active = 1/);
  assert.match(fake.calls[0].sql, /LEFT JOIN page_revision_sections/);
});

test("published page routes treat non-normalized URL segments as not found", async () => {
  const fake = fakeBinding([]);

  assert.equal(
    await readPublishedPageBySlug(fake.binding, "favicon.ico"),
    null,
  );
  assert.equal(await readPublishedPageBySlug(fake.binding, "UPPERCASE"), null);
  assert.equal(fake.calls.length, 0);
});

test("admin summaries expose both pointers and reject a broken draft join", async () => {
  const page = {
    page_id: "page_about",
    slug: "about",
    module_key: null,
    kind: "standard",
    publication_state: "published",
    page_version: 1,
    draft_id: "page_about_revision_2",
    draft_revision: 2,
    draft_title: "About the artist",
    draft_created_at: timestamp,
    published_id: "page_about_revision_1",
    published_revision: 1,
    published_title: "About",
    published_created_at: timestamp,
    updated_at: timestamp,
    published_at: timestamp,
  };
  const fake = fakeBinding([{ kind: "all", value: [page] }]);

  const summaries = await readAdminPageSummaries(fake.binding);
  assert.equal(summaries[0].draft.revision, 2);
  assert.equal(summaries[0].published?.revision, 1);
  assert.match(fake.calls[0].sql, /LEFT JOIN page_revisions AS draft/);

  const broken = fakeBinding([
    {
      kind: "all",
      value: [{ ...page, draft_id: null, draft_revision: null }],
    },
  ]);
  await assert.rejects(
    () => readAdminPageSummaries(broken.binding),
    SiteReadIntegrityError,
  );
});

test("installation and editor reads expose active server-owned authority", async () => {
  const fake = fakeBinding([
    {
      kind: "first",
      value: {
        id: "installation",
        status: "active",
        owner_user_id: "user_owner",
        schema_version: 2,
        bootstrap_completed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      },
    },
    {
      kind: "all",
      value: [
        {
          id: "permission_pages_all",
          user_id: "user_editor",
          permission_key: "pages.write",
          scope_id: "*",
          assigned_by_user_id: "user_owner",
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
    },
  ]);

  const installation = await readInstallationState(fake.binding);
  const permissions = await readActiveEditorPermissions(
    fake.binding,
    "user_editor",
  );

  assert.equal(installation?.ownerUserId, "user_owner");
  assert.deepEqual(
    permissions.map(({ permissionKey, scopeId }) => ({
      permissionKey,
      scopeId,
    })),
    [{ permissionKey: "pages.write", scopeId: "*" }],
  );
  assert.deepEqual(fake.calls[1].bindings, ["user_editor"]);
  assert.match(fake.calls[1].sql, /role_assignments\.revoked_at IS NULL/);
  assert.match(fake.calls[1].sql, /editor_permissions\.revoked_at IS NULL/);
});
