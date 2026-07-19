import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  readCatalogCollection,
  readCatalogRelease,
  readCatalogTrack,
} from "@/db/catalog-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";

async function currentAccessRequest(binding: D1Database) {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(binding, authenticatedUser);
  return Object.freeze({
    identity,
    now: new Date().toISOString(),
  });
}

export async function readCurrentCatalogRelease(
  binding: D1Database,
  slug: string,
) {
  return readCatalogRelease(binding, slug, await currentAccessRequest(binding));
}

export async function readCurrentCatalogTrack(
  binding: D1Database,
  slug: string,
) {
  return readCatalogTrack(binding, slug, await currentAccessRequest(binding));
}

export async function readCurrentCatalogCollection(
  binding: D1Database,
  slug: string,
) {
  return readCatalogCollection(
    binding,
    slug,
    await currentAccessRequest(binding),
  );
}
