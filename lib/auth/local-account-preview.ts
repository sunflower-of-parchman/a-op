import type { ChatGPTUser } from "@/app/chatgpt-auth";

const LOCAL_ACCOUNT_PREVIEW_FLAG = "AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW";
const LOCAL_ACCOUNT_PREVIEW_USER: ChatGPTUser = Object.freeze({
  displayName: "Fictional Customer",
  email: "customer@a-op.invalid",
  fullName: "Fictional Customer",
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

  return LOCAL_ACCOUNT_PREVIEW_USER;
}
