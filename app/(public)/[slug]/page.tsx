import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublishedLegalDocument } from "@/components/legal/PublishedLegalDocument";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PageContentSections } from "@/components/public/PageContentSections";
import { readPublishedLegalDocument } from "@/db/legal-read.ts";
import { readPublishedPageBySlug } from "@/db/site-read.ts";
import type { LegalDocumentId } from "@/lib/legal/index.ts";

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
    return (
      <>
        <header className="functional-page-heading page-frame">
          <h1>{legal.title}</h1>
        </header>
        <PublishedLegalDocument document={legal} />
        <div className="page-frame page-introduction">
          <Link className="text-link" href="/">
            Return home
          </Link>
        </div>
      </>
    );
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
