import { env } from "cloudflare:workers";
import Link from "next/link";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  readActiveEditorPermissions,
  readAdminPageSummaries,
} from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function PagesAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity) return null;

  const [allPages, permissions] = await Promise.all([
    readAdminPageSummaries(env.DB),
    hasApplicationRole(identity, "editor")
      ? readActiveEditorPermissions(env.DB, identity.userId)
      : Promise.resolve([]),
  ]);
  const owner = hasApplicationRole(identity, "owner");
  const scopes = new Set(permissions.map(({ scopeId }) => scopeId));
  const pages = owner
    ? allPages
    : allPages.filter(({ slug }) => scopes.has("*") || scopes.has(slug));

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Drafts and publication</p>
        <h2>Pages</h2>
        <p>Every edit creates an immutable revision before publication.</p>
      </header>
      {owner || scopes.has("*") ? (
        <Link className="button button-primary" href="/admin/pages/new">
          Add page
        </Link>
      ) : null}
      <div className="admin-row-list">
        {pages.map((page) => (
          <article className="admin-row" key={page.id}>
            <div>
              <p className="eyebrow">/{page.slug}</p>
              <h3>{page.draft.title}</h3>
              <p>
                Draft revision {page.draft.revision} · {page.publicationState}
                {page.moduleKey ? ` · ${page.moduleKey}` : ""}
              </p>
            </div>
            <Link className="text-link" href={`/admin/pages/${page.slug}`}>
              Edit
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
