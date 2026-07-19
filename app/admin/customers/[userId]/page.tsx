import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerDetailWorkspace } from "@/components/admin/customers";
import { readCustomerAdminDetail } from "@/db/customer-admin-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customer relationship" };

export default async function CustomerDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly userId: string }>;
}) {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  const { userId } = await params;
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(userId)) notFound();
  let detail: Awaited<ReturnType<typeof readCustomerAdminDetail>>;
  try {
    detail = await readCustomerAdminDetail(env.DB, identity.userId, userId);
  } catch (error) {
    if (error instanceof RuntimeError && error.status === 404) notFound();
    throw error;
  }
  return <CustomerDetailWorkspace detail={detail} />;
}
