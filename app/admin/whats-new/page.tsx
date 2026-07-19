import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { readActiveEditorPermissions } from "@/db/site-read.ts";
import { listAdminUpdates } from "@/db/updates-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "What's New administration" };

export default async function UpdatesAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner", "editor")) notFound();
  await requireActiveModule(env.DB, "whats-new");
  const [allUpdates, permissions] = await Promise.all([
    listAdminUpdates(env.DB),
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
  const updates = owner
    ? allUpdates
    : allUpdates.filter(({ slug }) => scopes.has("*") || scopes.has(slug));
  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Updates and customer reads</p>
        <h2>What&apos;s New</h2>
        <p>
          Published updates are immutable and signed-in read receipts are
          durable.
        </p>
      </header>
      <div className="action-row">
        {owner || scopes.has("*") ? (
          <Link className="button button-primary" href="/admin/whats-new/new">
            Add update
          </Link>
        ) : null}
        <Link className="button button-secondary" href="/admin/editorial">
          Editorial posts
        </Link>
      </div>
      <div className="admin-row-list">
        {updates.map((update) => (
          <article className="admin-row" key={update.id}>
            <div>
              <p className="eyebrow">{update.audience} audience</p>
              <h3>{update.title}</h3>
              <p>
                Revision {update.revision} · {update.state}
              </p>
            </div>
            <Link
              className="text-link"
              href={`/admin/whats-new/${update.slug}`}
            >
              Edit
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
