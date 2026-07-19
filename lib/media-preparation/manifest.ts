import { contractHash, sha256Hex } from "./hash.ts";
import { requireDerivativeProfile } from "./profiles.ts";
import type {
  ApprovedMediaManifest,
  MediaManifestDerivative,
  MediaPreparationDependencies,
  PrepareApprovedMediaInput,
} from "./types.ts";
import {
  requireApprovedSource,
  requireContractSha256,
  requireInspection,
  requireMediaAlias,
} from "./validation.ts";

export async function prepareApprovedMedia(
  input: PrepareApprovedMediaInput,
  dependencies: MediaPreparationDependencies,
): Promise<ApprovedMediaManifest> {
  const source = requireApprovedSource(input.source);
  const requests = input.derivatives.map((request) => ({
    profile: requireDerivativeProfile(request.profileId),
    outputAlias: requireMediaAlias(
      request.outputAlias,
      "Derivative output alias",
    ),
  }));
  if (
    new Set(requests.map(({ profile }) => profile.id)).size !== requests.length
  ) {
    throw new TypeError("Each derivative profile may be requested only once.");
  }
  if (
    new Set(requests.map(({ outputAlias }) => outputAlias)).size !==
    requests.length
  ) {
    throw new TypeError("Each derivative output alias must be unique.");
  }
  if (requests.some(({ profile }) => profile.sourceKind !== source.kind)) {
    throw new TypeError(
      "A derivative profile does not accept this source kind.",
    );
  }
  if (
    requests.some(
      ({ profile }) => !profile.sourceContentTypes.includes(source.contentType),
    )
  ) {
    throw new TypeError(
      "A derivative profile does not accept this source content type.",
    );
  }
  if (
    requests.some(
      ({ profile }) =>
        !profile.intendedUses.some((use) => source.intendedUse.includes(use)),
    )
  ) {
    throw new TypeError(
      "A derivative profile is outside the approved intended media uses.",
    );
  }

  if (input.checkTools === true) {
    if (!dependencies.preflightTools) {
      throw new TypeError("Media tool preflight is not available.");
    }
    await dependencies.preflightTools();
  }

  const sourceBytes = await dependencies.readAliasBytes(source.alias);
  const sourceSha256 = await sha256Hex(sourceBytes);
  if (sourceSha256 !== source.expectedSourceSha256) {
    throw new Error(
      "Approved source SHA-256 does not match the selected alias.",
    );
  }
  const sourceInspection = requireInspection(
    await dependencies.inspectAlias(source.alias),
  );
  const proposalSha256 = requireContractSha256(
    input.setupProposalSha256,
    "Setup proposal SHA-256",
  );
  const approvalSha256 = requireContractSha256(
    input.setupApprovalSha256,
    "Setup approval SHA-256",
  );

  const scratch = await dependencies.createScratch();
  try {
    const derivatives: MediaManifestDerivative[] = [];
    for (const { profile, outputAlias } of requests) {
      const result = await dependencies.createDerivative(
        scratch,
        source.alias,
        profile,
      );
      const bytes = new Uint8Array(result.bytes);
      const derivativeSha256 = await sha256Hex(bytes);
      if (profile.processor === "copy" && derivativeSha256 !== sourceSha256) {
        throw new Error("A byte-copy derivative changed the approved source.");
      }
      await dependencies.writeAliasBytes(outputAlias, bytes);
      derivatives.push({
        role: "derivative",
        alias: outputAlias,
        sha256: derivativeSha256,
        byteLength: bytes.byteLength,
        sourceSha256,
        profileId: profile.id,
        processingVersion: profile.version,
        derivativeKind: profile.derivativeKind,
        contentType: profile.contentType,
        format: profile.format,
        bitrateKbps: profile.bitrateKbps,
        inspection: requireInspection(result.inspection),
      });
    }
    const body = {
      schemaVersion: 1 as const,
      proposalSha256,
      approvalSha256,
      source: {
        role: "source" as const,
        alias: source.alias,
        sha256: sourceSha256,
        byteLength: sourceBytes.byteLength,
        kind: source.kind,
        contentType: source.contentType,
        rightsConfirmed: true as const,
        intendedUse: source.intendedUse,
        inspection: sourceInspection,
      },
      derivatives,
    };
    return Object.freeze({
      ...body,
      manifestSha256: await contractHash(body),
    });
  } finally {
    await dependencies.removeScratch(scratch);
  }
}

export async function verifyApprovedMediaManifest(
  manifest: ApprovedMediaManifest,
  readAliasBytes: (alias: string) => Promise<Uint8Array>,
): Promise<void> {
  const { manifestSha256, ...body } = manifest;
  if ((await contractHash(body)) !== manifestSha256) {
    throw new Error("Approved media manifest SHA-256 is invalid.");
  }
  const entries = [manifest.source, ...manifest.derivatives];
  for (const entry of entries) {
    const bytes = await readAliasBytes(requireMediaAlias(entry.alias));
    if (
      bytes.byteLength !== entry.byteLength ||
      (await sha256Hex(bytes)) !== entry.sha256
    ) {
      throw new Error(`Prepared media does not match alias ${entry.alias}.`);
    }
  }
}
