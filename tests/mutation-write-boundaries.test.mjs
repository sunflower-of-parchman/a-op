import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts from "typescript";

import { prepareConditionalAuditEvent } from "../db/audit-events.ts";
import {
  activeApplicationIdentityCondition,
  activeCatalogEditorCondition,
  activeMediaEditorCondition,
  activeOwnerCondition,
  activePageEditorCondition,
} from "../db/authority-guards.ts";

const [artistStateSource, pageWriteSource, roleWriteSource] = await Promise.all(
  [
    readFile(new URL("../db/artist-state-write.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/page-write.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/role-write.ts", import.meta.url), "utf8"),
  ],
);

function functionText(source, fileName, functionName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const matches = [];

  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      matches.push(node.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.equal(
    matches.length,
    1,
    `${fileName} must define ${functionName} exactly once`,
  );
  return matches[0];
}

function receiptTail(source, fileName, functionName) {
  const body = functionText(source, fileName, functionName);
  const receiptStart = body.lastIndexOf("prepareConditionalAuditEvent");
  assert.notEqual(
    receiptStart,
    -1,
    `${functionName} must prepare a conditional mutation receipt`,
  );
  return body.slice(receiptStart);
}

test("durable mutation receipts require each operation's exact marker", () => {
  const mutators = [
    [artistStateSource, "db/artist-state-write.ts", "saveArtistDraft"],
    [artistStateSource, "db/artist-state-write.ts", "publishArtistDraft"],
    [artistStateSource, "db/artist-state-write.ts", "transitionModules"],
    [artistStateSource, "db/artist-state-write.ts", "saveNavigationSnapshot"],
    [
      artistStateSource,
      "db/artist-state-write.ts",
      "publishNavigationSnapshot",
    ],
    [pageWriteSource, "db/page-write.ts", "savePageDraft"],
    [pageWriteSource, "db/page-write.ts", "publishPage"],
    [pageWriteSource, "db/page-write.ts", "unpublishPage"],
    [roleWriteSource, "db/role-write.ts", "grantEditor"],
    [roleWriteSource, "db/role-write.ts", "revokeEditor"],
    [roleWriteSource, "db/role-write.ts", "bootstrapOwner"],
    [roleWriteSource, "db/role-write.ts", "updateProfile"],
  ];

  for (const [source, fileName, functionName] of mutators) {
    const receipt = receiptTail(source, fileName, functionName);
    assert.match(
      receipt,
      /last_operation_key\s*=\s*\?(?:\d+)?/,
      `${functionName} receipt must match the operation marker`,
    );
    assert.ok(
      (receipt.match(/mutation\.namespacedKey/g) ?? []).length >= 2,
      `${functionName} must use the namespaced key for the receipt and its state predicate`,
    );
  }
});

test("conditional receipts preserve marker and live-owner bindings in fake D1", () => {
  const calls = [];
  const binding = {
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return { sql, bindings };
        },
      };
    },
  };
  const marker = "page.publish:user_owner:publish-0001";
  const owner = activeOwnerCondition("user_owner");

  prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: "user_owner",
      action: "page.publish",
      subjectType: "page",
      subjectId: "page_about",
      idempotencyKey: marker,
      requestFingerprint: "fingerprint",
      requestId: "request-0001",
      result: { version: 4 },
    },
    `EXISTS (
      SELECT 1 FROM pages
      WHERE id = ? AND version = ? AND last_operation_key = ?
    ) AND ${owner.sql}`,
    ["page_about", 4, marker, ...owner.bindings],
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO audit_events[\s\S]*SELECT/);
  assert.match(calls[0].sql, /last_operation_key = \?/);
  assert.match(calls[0].sql, /authority_role\.revoked_at IS NULL/);
  assert.deepEqual(calls[0].bindings.slice(-4), [
    "page_about",
    4,
    marker,
    "user_owner",
  ]);
});

test("module transitions compare and publish the complete registry vector", () => {
  const vector = functionText(
    artistStateSource,
    "db/artist-state-write.ts",
    "moduleVectorPredicate",
  );
  const transition = functionText(
    artistStateSource,
    "db/artist-state-write.ts",
    "transitionModules",
  );

  assert.match(vector, /return rows\s*\.map/);
  assert.match(
    vector,
    /module_key = \$\{trustedModuleLiteral\(row\.module_key\)\}/,
  );
  assert.match(vector, /row\.revision \+ \(changed \? 1 : 0\)/);
  assert.match(vector, /active = \$\{changed \? nextActive : row\.active\}/);

  assert.match(
    transition,
    /const currentVector = moduleVectorPredicate\(rows\);/,
  );
  assert.match(
    transition,
    /const updatedVector = moduleVectorPredicate\(rows, operationState\);/,
  );
  assert.match(
    transition,
    /UPDATE module_registry_state[\s\S]*revision = revision \+ 1,[\s\S]*last_operation_key = \?1/,
  );
  assert.match(
    transition,
    /COUNT\(\*\) FROM artist_modules WHERE \$\{currentVector\}\) = \?3/,
  );
  assert.match(transition, /registry\.revision,\s*MODULE_KEYS\.length/);
  assert.match(
    transition,
    /module_registry_state[\s\S]*revision = \?[\s\S]*last_operation_key = \?/,
  );
  assert.match(
    transition,
    /COUNT\(\*\) FROM artist_modules WHERE \$\{updatedVector\}\) = \?/,
  );
  assert.match(
    transition,
    /if \(changedRows\(results\[0\]\) !== 1\)[\s\S]*throw staleMutation\("module state"\)/,
  );
  assert.match(transition, /changedRows\(results\[1\]\) !== expectedChanges/);
});

test("page structure and publication stay behind owner predicates", () => {
  const saveDraft = functionText(
    pageWriteSource,
    "db/page-write.ts",
    "savePageDraft",
  );
  const publish = functionText(
    pageWriteSource,
    "db/page-write.ts",
    "publishPage",
  );

  assert.match(saveDraft, /aggregate\.draft_module_key !== input\.moduleKey/);
  assert.match(saveDraft, /aggregate\.draft_kind !== input\.kind/);
  assert.match(
    saveDraft,
    /const structuralAuthority = structuralChange\s*\? ownerAuthority/,
  );
  assert.ok(
    (
      saveDraft.match(
        /AND \$\{pageAuthority\.sql\}\s*AND \$\{structuralAuthority\.sql\}/g,
      ) ?? []
    ).length >= 2,
  );

  assert.match(
    publish,
    /const authority = activeOwnerCondition\(context\.actorUserId\);/,
  );
  assert.doesNotMatch(publish, /activePageEditorCondition/);
  assert.equal((publish.match(/UPDATE pages/g) ?? []).length, 1);
  assert.match(
    publish,
    /SET published_revision_id = draft_revision_id,[\s\S]*module_key = \([\s\S]*WHERE id = pages\.draft_revision_id[\s\S]*kind = \([\s\S]*WHERE id = pages\.draft_revision_id[\s\S]*publication_state = 'published',[\s\S]*version = version \+ 1,[\s\S]*last_operation_key = \?1/,
  );
});

test("authority predicates reject disabled identities and revoked grants", () => {
  const owner = activeOwnerCondition("user_owner");
  assert.match(owner.sql, /authority_role\.role_key = 'owner'/);
  assert.match(owner.sql, /authority_role\.revoked_at IS NULL/);
  assert.match(owner.sql, /authority_user\.status = 'active'/);
  assert.deepEqual(owner.bindings, ["user_owner"]);

  const editor = activePageEditorCondition("user_editor", "about");
  assert.match(editor.sql, /editor_role\.role_key = 'editor'/);
  assert.match(editor.sql, /editor_role\.revoked_at IS NULL/);
  assert.match(editor.sql, /editor_user\.status = 'active'/);
  assert.match(editor.sql, /editor_permission\.permission_key = \?/);
  assert.match(editor.sql, /editor_permission\.revoked_at IS NULL/);
  assert.deepEqual(editor.bindings, [
    "user_editor",
    "user_editor",
    "user_editor",
    "pages.write",
    "about",
  ]);

  assert.deepEqual(
    activeCatalogEditorCondition("user_editor", "release-one").bindings,
    [
      "user_editor",
      "user_editor",
      "user_editor",
      "catalog.write",
      "release-one",
    ],
  );
  assert.deepEqual(activeMediaEditorCondition("user_editor", "*").bindings, [
    "user_editor",
    "user_editor",
    "user_editor",
    "media.write",
    "*",
  ]);

  const identity = activeApplicationIdentityCondition("user_customer");
  assert.match(identity.sql, /authority_role\.revoked_at IS NULL/);
  assert.match(identity.sql, /authority_user\.status = 'active'/);
  assert.deepEqual(identity.bindings, ["user_customer"]);
});

test("a nonexistent editor revocation cannot create a success receipt", () => {
  const revoke = functionText(
    roleWriteSource,
    "db/role-write.ts",
    "revokeEditor",
  );

  assert.match(
    revoke,
    /UPDATE role_assignments[\s\S]*role_key = 'editor' AND revoked_at IS NULL/,
  );
  assert.match(
    revoke,
    /role_key = 'editor'[\s\S]*revoked_at IS NOT NULL[\s\S]*revoked_by_user_id = \?[\s\S]*last_operation_key = \?/,
  );
  assert.match(
    revoke,
    /if \(changedRows\(results\[0\]\) !== 1\) throw staleMutation\("editor role"\)/,
  );
  assert.match(
    revoke,
    /if \(changedRows\(results\[2\]\) !== 1\)[\s\S]*throw staleMutation\("editor revocation receipt"\)/,
  );
  assert.ok(
    revoke.indexOf("changedRows(results[0])") <
      revoke.indexOf("return { value: result, replayed: false }"),
  );
});
