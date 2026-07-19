import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PageWorkspace } from "@/components/admin";
import { listPageCompositionContentSectionOptions } from "@/db/content-section-read.ts";
import { readAdminPageDraftBySlug } from "@/db/site-read.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function PageAdministrationEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity) notFound();

  const owner = hasApplicationRole(identity, "owner");
  const allowed =
    owner ||
    (hasApplicationRole(identity, "editor") &&
      (await hasEditorPermission(env.DB, identity.userId, {
        permissionKey: "pages.write",
        scopeId: slug === "new" ? "*" : slug,
      })));
  if (!allowed) notFound();

  const publishedSections = await listPageCompositionContentSectionOptions(
    env.DB,
    identity.userId,
    slug === "new" ? "*" : slug,
  );

  if (slug === "new") {
    return (
      <PageWorkspace
        availableSections={publishedSections}
        canChangeStructure={owner}
        canPublish={owner}
        initial={{
          slug: "",
          title: "",
          introduction: "",
          bodyText: "",
          sectionRevisionIds: [],
          moduleKey: null,
          kind: "standard",
          publicationState: "draft",
          version: 0,
          created: false,
        }}
      />
    );
  }

  const page = await readAdminPageDraftBySlug(env.DB, slug, identity.userId);
  if (!page) notFound();
  const availableSections = [
    ...publishedSections,
    ...page.revision.sections
      .filter(
        ({ revisionId }) =>
          !publishedSections.some(
            (published) => published.revisionId === revisionId,
          ),
      )
      .map((section) => ({
        revisionId: section.revisionId,
        sectionKey: section.sectionKey,
        revision: section.revision,
        kind: section.kind,
        heading: section.heading,
      })),
  ];

  return (
    <PageWorkspace
      availableSections={availableSections}
      canChangeStructure={owner}
      canPublish={owner}
      initial={{
        slug: page.slug,
        title: page.revision.title,
        introduction: page.revision.introduction,
        bodyText: page.revision.bodyText,
        sectionRevisionIds: page.revision.sections.map(
          ({ revisionId }) => revisionId,
        ),
        moduleKey: page.moduleKey,
        kind: page.kind,
        publicationState: page.publicationState,
        version: page.version,
        created: true,
      }}
    />
  );
}
