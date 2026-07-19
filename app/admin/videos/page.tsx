import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { listAdminVideos } from "@/db/video-read.ts";
import { readActiveEditorPermissions } from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Video administration" };

export default async function VideoAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner", "editor")) notFound();
  await requireActiveModule(env.DB, "video");
  const [allVideos, permissions] = await Promise.all([
    listAdminVideos(env.DB),
    hasApplicationRole(identity, "editor")
      ? readActiveEditorPermissions(env.DB, identity.userId)
      : Promise.resolve([]),
  ]);
  const owner = hasApplicationRole(identity, "owner");
  const pageScopes = new Set(
    permissions
      .filter(({ permissionKey }) => permissionKey === "pages.write")
      .map(({ scopeId }) => scopeId),
  );
  const videos = owner
    ? allVideos
    : allVideos.filter(
        ({ slug }) => pageScopes.has("*") || pageScopes.has(slug),
      );

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Drafts, transcripts, and delivery</p>
        <h2>Videos</h2>
        <p>
          External players require visitor consent. Artist-hosted media remains
          behind the central server access decision.
        </p>
      </header>
      {owner || pageScopes.has("*") ? (
        <Link className="button button-primary" href="/admin/videos/new">
          Add video
        </Link>
      ) : null}
      <div className="admin-row-list">
        {videos.map((video) => (
          <article className="admin-row" key={video.id}>
            <div>
              <p className="eyebrow">/{video.slug}</p>
              <h3>{video.title}</h3>
              <p>
                Draft revision {video.draftRevision} · {video.publicationState}{" "}
                · state revision {video.revision}
              </p>
            </div>
            <Link className="text-link" href={`/admin/videos/${video.slug}`}>
              Edit
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
