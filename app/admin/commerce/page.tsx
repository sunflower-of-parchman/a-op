import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  AdminCommerce,
  AdminCommerceBindings,
  AdminCommerceProductWorkspace,
} from "@/components/commerce";
import { readPendingCommerceBindings } from "@/db/commerce-binding-read.ts";
import { readAdminCommerceProducts } from "@/db/commerce-admin-read.ts";
import { listActiveCommerceProducts } from "@/db/commerce-read.ts";
import { readAdminCommerceEvidence } from "@/db/commerce-surface-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commerce administration",
};

export default async function CommerceAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();

  const [activeProducts, products, pendingBindings, evidence] =
    await Promise.all([
      listActiveCommerceProducts(env.DB),
      readAdminCommerceProducts(env.DB, identity.userId),
      readPendingCommerceBindings(env.DB),
      readAdminCommerceEvidence(env.DB),
    ]);
  return (
    <div className="admin-workspace">
      <AdminCommerceBindings bindings={pendingBindings} />
      <AdminCommerceProductWorkspace products={products} />
      <AdminCommerce
        activeProductCount={activeProducts.length}
        evidence={evidence}
      />
    </div>
  );
}
