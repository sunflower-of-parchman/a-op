import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { readCustomerFavoriteState } from "@/db/customer-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import type { FavoriteTargetType } from "@/lib/customer-library/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { FavoriteToggle } from "./FavoriteToggle";

export interface PublicFavoriteControlProps {
  readonly targetType: FavoriteTargetType;
  readonly targetId: string;
  readonly label: string;
}

export async function PublicFavoriteControl({
  targetType,
  targetId,
  label,
}: PublicFavoriteControlProps) {
  const authenticatedUser = await getChatGPTUser();
  if (!authenticatedUser) return null;
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) return null;

  let favorite;
  try {
    favorite = await readCustomerFavoriteState(
      env.DB,
      identity.userId,
      targetType,
      targetId,
    );
  } catch (error) {
    if (error instanceof RuntimeError && error.code === "MODULE_INACTIVE") {
      return null;
    }
    throw error;
  }

  return (
    <FavoriteToggle
      initialActive={favorite?.active ?? false}
      initialRevision={favorite?.revision ?? null}
      label={label}
      targetId={targetId}
      targetType={targetType}
    />
  );
}
