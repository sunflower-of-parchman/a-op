import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import {
  resolveApplicationIdentity,
  type ApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export async function requireCustomerLibraryPage(
  returnTo: string,
): Promise<ApplicationIdentity> {
  const authenticatedUser = await requireChatGPTUser(returnTo);
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);

  if (!identity || !identity.roles.includes("customer")) notFound();

  try {
    await requireActiveModule(env.DB, "customer-library");
  } catch (error) {
    if (error instanceof RuntimeError && error.code === "MODULE_INACTIVE") {
      notFound();
    }
    throw error;
  }

  return identity;
}
