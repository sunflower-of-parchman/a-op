import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { readActiveModuleKeys } from "@/db/site-read.ts";
import { MODULE_REGISTRY } from "@/lib/modules/index.ts";

export const dynamic = "force-dynamic";

export default async function ActiveModuleAdministration({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const activeModules = await readActiveModuleKeys(env.DB);
  const activeSet = new Set(activeModules);
  const definition = MODULE_REGISTRY.find(
    ({ key, adminRoutes }) =>
      activeSet.has(key) &&
      adminRoutes.some(
        (route) =>
          route === `/admin/${section}` ||
          route.startsWith(`/admin/${section}/`),
      ),
  );
  if (!definition) notFound();

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Active module</p>
        <h2>{definition.label}</h2>
        <p>
          This module is active and its durable state is preserved through the
          shared artist, identity, access, and administration contracts.
        </p>
      </header>
      <p>
        Its complete working surface joins the application in the capability
        milestone that owns {definition.label.toLowerCase()} behavior.
      </p>
    </div>
  );
}
