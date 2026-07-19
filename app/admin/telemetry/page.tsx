import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { TelemetryAdminWorkspace } from "@/components/telemetry";
import { readTelemetryAdminWorkspace } from "@/db/telemetry-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Telemetry administration" };

type SearchValue = string | readonly string[] | undefined;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function first(value: SearchValue): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

function defaultRange(): { readonly from: string; readonly to: string } {
  const to = new Date();
  const from = new Date(to.valueOf());
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default async function TelemetryAdministrationPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, SearchValue>>;
}) {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  await requireActiveModule(env.DB, "telemetry");

  const defaults = defaultRange();
  const query = await searchParams;
  const requestedFrom = first(query.from);
  const requestedTo = first(query.to);
  const fromDayUtc = DAY.test(requestedFrom) ? requestedFrom : defaults.from;
  const toDayUtc = DAY.test(requestedTo) ? requestedTo : defaults.to;
  const safeFrom = fromDayUtc <= toDayUtc ? fromDayUtc : defaults.from;
  const safeTo = fromDayUtc <= toDayUtc ? toDayUtc : defaults.to;
  const workspace = await readTelemetryAdminWorkspace(
    env.DB,
    identity.userId,
    safeFrom,
    safeTo,
  );
  return <TelemetryAdminWorkspace workspace={workspace} />;
}
