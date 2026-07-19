import { env } from "cloudflare:workers";
import Link from "next/link";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  readActiveModuleKeys,
  readAdminPageSummaries,
  readInstallationState,
} from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export default async function AdministrationOverview() {
  const [authenticatedUser, installation, activeModules, pages] =
    await Promise.all([
      getChatGPTUser(),
      readInstallationState(env.DB),
      readActiveModuleKeys(env.DB),
      readAdminPageSummaries(env.DB),
    ]);
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const owner = hasApplicationRole(identity, "owner");
  const publishedPages = pages.filter(
    ({ publicationState }) => publicationState === "published",
  ).length;

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Overview</p>
        <h2>Site state</h2>
        <p>
          D1 is the authority for published artist material, modules,
          navigation, pages, identities, roles, and audit history.
        </p>
      </header>
      <dl className="open-status-list">
        <div>
          <dt>Installation</dt>
          <dd>{installation?.status ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Published pages</dt>
          <dd>{publishedPages}</dd>
        </div>
        <div>
          <dt>Active optional modules</dt>
          <dd>{activeModules.length}</dd>
        </div>
      </dl>
      <div className="action-row">
        {owner ? (
          <Link className="button button-primary" href="/admin/artist">
            Edit artist state
          </Link>
        ) : null}
        <Link className="button button-secondary" href="/admin/pages">
          Manage pages
        </Link>
      </div>
    </div>
  );
}
