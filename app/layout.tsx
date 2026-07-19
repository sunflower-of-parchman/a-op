import "@fontsource/lato/300.css";
import "@fontsource/lato/400.css";
import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PlayerBoundary } from "@/components/player";
import { readActiveModuleKeys } from "@/db/site-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import "./globals.css";

const description =
  "An open-source web application for musicians to publish, stream, license, and deliver music through their own site.";

function requestOrigin(requestHeaders: Headers): URL {
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || requestHeaders.get("host")?.trim();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const isLocal =
    host !== undefined && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host);
  const protocol = forwardedProtocol === "http" || isLocal ? "http" : "https";

  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    return new URL("http://localhost:3000");
  }

  return new URL(`${protocol}://${host}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const metadataBase = requestOrigin(requestHeaders);

  return {
    title: {
      default: "a-op: artist-owned platform",
      template: "%s · a-op",
    },
    description,
    applicationName: "a-op",
    creator: "a-op contributors",
    metadataBase,
    openGraph: {
      type: "website",
      title: "a-op: artist-owned platform",
      description,
    },
    twitter: {
      card: "summary",
      title: "a-op: artist-owned platform",
      description,
    },
  };
}

const themeBootstrap = `
  try {
    const stored = localStorage.getItem("aop-theme");
    const preferred = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = preferred;
    document.documentElement.style.colorScheme = preferred;
  } catch (_) {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
`;

async function customerHistoryEnabled(): Promise<boolean> {
  const authenticatedUser = await getChatGPTUser();
  if (!authenticatedUser) return false;

  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) return false;

  const activeModules = await readActiveModuleKeys(env.DB);
  return activeModules.includes("customer-library");
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const historyEnabled = await customerHistoryEnabled();

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta id="theme-color" name="theme-color" content="#08090B" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <PlayerBoundary historyEnabled={historyEnabled}>
          {children}
        </PlayerBoundary>
      </body>
    </html>
  );
}
