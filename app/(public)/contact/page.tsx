import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { ContactForm, ContactUnavailable } from "@/components/contact";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { readPublicContactForm } from "@/db/contact-read.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  await requireActiveModule(env.DB, "contact");
  const form = await readPublicContactForm(env.DB);
  return (
    <>
      <PublicPageHeader title="Contact" variant="compact" />
      {form ? <ContactForm form={form} /> : <ContactUnavailable />}
    </>
  );
}
