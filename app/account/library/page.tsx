import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { CustomerAccessLibrary } from "@/components/account/CustomerAccessLibrary";
import { requireCustomerLibraryPage } from "@/components/account/customer-library/server";
import { readCustomerAccessLibrary } from "@/db/customer-access-read.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library",
};

export default async function LibraryPage() {
  const identity = await requireCustomerLibraryPage("/account/library");
  const library = await readCustomerAccessLibrary(
    env.DB,
    identity,
    new Date().toISOString(),
  );

  return <CustomerAccessLibrary data={library} />;
}
