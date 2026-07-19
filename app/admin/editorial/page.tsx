import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { listAdminEditorialPosts } from "@/db/editorial-read.ts";
import { readActiveEditorPermissions } from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Editorial administration" };

export default async function EditorialAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner", "editor")) notFound();
  await requireActiveModule(env.DB, "whats-new");
  const [allPosts, permissions] = await Promise.all([
    listAdminEditorialPosts(env.DB),
    hasApplicationRole(identity, "editor")
      ? readActiveEditorPermissions(env.DB, identity.userId)
      : Promise.resolve([]),
  ]);
  const owner = hasApplicationRole(identity, "owner");
  const scopes = new Set(
    permissions
      .filter(({ permissionKey }) => permissionKey === "pages.write")
      .map(({ scopeId }) => scopeId),
  );
  const posts = owner
    ? allPosts
    : allPosts.filter(({ slug }) => scopes.has("*") || scopes.has(slug));
  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Structured editorial</p>
        <h2>Editorial posts</h2>
        <p>
          Structured text is rendered without executable markup and frozen at
          publication.
        </p>
      </header>
      <div className="action-row">
        {owner || scopes.has("*") ? (
          <Link className="button button-primary" href="/admin/editorial/new">
            Add editorial post
          </Link>
        ) : null}
        <Link className="button button-secondary" href="/admin/whats-new">
          What&apos;s New
        </Link>
      </div>
      <div className="admin-row-list">
        {posts.map((post) => (
          <article className="admin-row" key={post.id}>
            <div>
              <p className="eyebrow">/{post.slug}</p>
              <h3>{post.title}</h3>
              <p>
                Revision {post.revision} · {post.state}
              </p>
            </div>
            <Link className="text-link" href={`/admin/editorial/${post.slug}`}>
              Edit
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
