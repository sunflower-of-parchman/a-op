import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { MediaMosaic } from "@/components/public/MediaMosaic";
import { readPublicMosaicImages } from "@/db/public-mosaic.ts";
import styles from "./LoginPage.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your account.",
};

export default async function LoginPage() {
  const [user, mosaicImages] = await Promise.all([
    getChatGPTUser(),
    readPublicMosaicImages(env.DB),
  ]);

  return (
    <section className={styles.page}>
      <div className={styles.formSide}>
        <h1>Welcome back</h1>
        {user ? (
          <>
            <Link className={styles.primaryAction} href="/account">
              Continue to account
            </Link>
          </>
        ) : (
          <>
            <p className={styles.introduction}>
              Sign in to reach your account, saved music, and access.
            </p>
            <Link
              className={styles.primaryAction}
              href={chatGPTSignInPath("/account")}
            >
              Continue with ChatGPT
            </Link>
            <p className={styles.accountNote}>
              New here? Continuing creates your free account.
            </p>
          </>
        )}
      </div>

      <div className={styles.mosaicSide}>
        <MediaMosaic images={mosaicImages} title="" variant="auth" />
      </div>
    </section>
  );
}
