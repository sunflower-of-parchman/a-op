import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { LegalDocumentWorkspace } from "@/components/legal/LegalDocumentWorkspace";
import { readAdminLegalDocument } from "@/db/legal-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { validateLegalDocumentId } from "@/lib/legal/validation.ts";

export const dynamic = "force-dynamic";

export default async function LegalDocumentEditorPage({
  params,
}: {
  readonly params: Promise<{ documentId: string }>;
}) {
  const result = validateLegalDocumentId((await params).documentId);
  if (!result.ok) notFound();
  const identity = await resolveApplicationIdentity(
    env.DB,
    await getChatGPTUser(),
  );
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  const document = await readAdminLegalDocument(
    env.DB,
    result.value,
    identity.userId,
  );
  if (!document) notFound();
  return <LegalDocumentWorkspace initial={document} />;
}
