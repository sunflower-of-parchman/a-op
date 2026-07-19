import { canonicalSha256 } from "./canonical.ts";
import type { SetupProposalArtifact } from "./types.ts";
import { validateSetupProposal } from "./validation.ts";

export async function createProposalArtifact(
  value: unknown,
): Promise<SetupProposalArtifact> {
  const proposal = validateSetupProposal(value);
  return Object.freeze({
    proposal,
    proposalHash: await canonicalSha256(proposal),
  });
}
