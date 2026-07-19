import assert from "node:assert/strict";
import test from "node:test";

import {
  requirePublicationMediaKey,
  resolveExternalPublicationAuthority,
} from "../lib/media-preparation/publication-authority.ts";

const proposalHash = `sha256:${"1".repeat(64)}`;
const sourceFingerprint = `sha256:${"2".repeat(64)}`;
const actionHash = `sha256:${"3".repeat(64)}`;

function approval(overrides = {}) {
  return {
    schemaVersion: "aop.external-action-approval.v1",
    approvalId: "approve-fictional-public-media",
    proposalId: "fictional-setup-proposal",
    proposalHash,
    sourceStateFingerprint: sourceFingerprint,
    actionId: "publish-fictional-track",
    actionHash,
    approvedAt: "2026-07-19T12:00:00.000Z",
    approvedBy: "michael",
    statement: "I approve this exact external action hash.",
    ...overrides,
  };
}

test("CLI publication authority reduces an exact public approval artifact to safe headers", () => {
  const authority = resolveExternalPublicationAuthority({
    visibility: "public",
    manifestProposalSha256: proposalHash,
    externalApproval: approval(),
  });
  assert.deepEqual(authority, {
    actionId: "publish-fictional-track",
    actionSha256: actionHash,
  });
  assert.deepEqual(Object.keys(authority).sort(), ["actionId", "actionSha256"]);
  assert.equal(
    requirePublicationMediaKey("fictional-track-audio"),
    "fictional-track-audio",
  );
});

test("public publication rejects missing, malformed, and proposal-mismatched approval artifacts", () => {
  assert.throws(
    () =>
      resolveExternalPublicationAuthority({
        visibility: "public",
        manifestProposalSha256: proposalHash,
      }),
    /requires an external-action approval/,
  );
  assert.throws(
    () =>
      resolveExternalPublicationAuthority({
        visibility: "public",
        manifestProposalSha256: proposalHash,
        externalApproval: approval({ approvedBy: "artist-owner" }),
      }),
    /external-action approval has 1 validation issue/i,
  );
  assert.throws(
    () =>
      resolveExternalPublicationAuthority({
        visibility: "public",
        manifestProposalSha256: proposalHash,
        externalApproval: approval({
          proposalHash: `sha256:${"4".repeat(64)}`,
        }),
      }),
    /does not match the approved media manifest proposal/,
  );
});

test("protected publication accepts no external approval artifact", () => {
  assert.equal(
    resolveExternalPublicationAuthority({
      visibility: "protected",
      manifestProposalSha256: proposalHash,
    }),
    null,
  );
  assert.throws(
    () =>
      resolveExternalPublicationAuthority({
        visibility: "protected",
        manifestProposalSha256: proposalHash,
        externalApproval: approval(),
      }),
    /accepts no external-action approval/,
  );
});
