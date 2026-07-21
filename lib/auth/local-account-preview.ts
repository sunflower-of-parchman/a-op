import type { ChatGPTUser } from "@/app/chatgpt-auth";

const LOCAL_ACCOUNT_PREVIEW_FLAG = "AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW";
const LOCAL_ACCOUNT_PREVIEW_PERSONA = "AOP_LOCAL_ACCOUNT_PREVIEW_PERSONA";
const LOCAL_ACCOUNT_PREVIEW_USERS = Object.freeze({
  customer: Object.freeze({
    displayName: "Fictional Customer",
    email: "customer@a-op.invalid",
    fullName: "Fictional Customer",
  }),
  owner: Object.freeze({
    displayName: "Fictional Owner",
    email: "owner@a-op.invalid",
    fullName: "Fictional Owner",
  }),
});

type AuthenticationEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveLocalAccountPreviewUser(
  environment: AuthenticationEnvironment,
): ChatGPTUser | null {
  if (
    environment.AOP_RUNTIME_ENV !== "development" ||
    environment[LOCAL_ACCOUNT_PREVIEW_FLAG] !== "1"
  ) {
    return null;
  }

  return environment[LOCAL_ACCOUNT_PREVIEW_PERSONA] === "owner"
    ? LOCAL_ACCOUNT_PREVIEW_USERS.owner
    : LOCAL_ACCOUNT_PREVIEW_USERS.customer;
}
