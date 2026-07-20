import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublishedLegalDocument } from "@/components/legal/PublishedLegalDocument";
import { LegalStarterDocument } from "@/components/legal/LegalStarterDocument";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PageContentSections } from "@/components/public/PageContentSections";
import { readPublishedLegalDocument } from "@/db/legal-read.ts";
import { readPublishedPageBySlug } from "@/db/site-read.ts";
import type { LegalDocumentId } from "@/lib/legal/index.ts";
import { getLegalDocumentStarter } from "@/lib/legal/public-starters.ts";

export const dynamic = "force-dynamic";

function legalDocumentId(slug: string): LegalDocumentId | null {
  return slug === "privacy" || slug === "terms" ? slug : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const legalId = legalDocumentId(slug);
  const legal = legalId
    ? await readPublishedLegalDocument(env.DB, legalId)
    : null;
  if (legal) {
    return { title: legal.title, description: legal.introduction || undefined };
  }
  if (legalId) {
    const starter = getLegalDocumentStarter(legalId);
    return { title: starter.title, description: starter.introduction };
  }
  const page = await readPublishedPageBySlug(env.DB, slug);
  return page
    ? { title: page.revision.title, description: page.revision.introduction }
    : {};
}

export default async function PublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const legalId = legalDocumentId(slug);
  const legal = legalId
    ? await readPublishedLegalDocument(env.DB, legalId)
    : null;
  if (legal) {
    return <PublishedLegalDocument document={legal} />;
  }
  if (legalId) {
    return <LegalStarterDocument document={getLegalDocumentStarter(legalId)} />;
  }
  const page = await readPublishedPageBySlug(env.DB, slug);
  if (!page) notFound();

  return (
    <>
      {page.kind === "standard" ? (
        <PublicPageHeader title={page.revision.title} variant="compact" />
      ) : (
        <header className="functional-page-heading page-frame">
          <h1>{page.revision.title}</h1>
        </header>
      )}
      <div className="page-frame page-introduction">
        <p className="intro-copy">{page.revision.introduction}</p>
        {page.revision.bodyText ? <p>{page.revision.bodyText}</p> : null}
        <PageContentSections sections={page.revision.sections} />
        <Link className="text-link" href="/">
          Return home
        </Link>
      </div>
    </>
  );
}
