import type { Metadata } from "next";
import Link from "next/link";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import styles from "@/components/public/PublicInfoPage.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your account with ChatGPT.",
};

export default async function LoginPage() {
  const user = await getChatGPTUser();

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1>Log in</h1>
        <p className="intro-copy">
          Sign in with ChatGPT to reach your personal account, saved access, and
          customer library.
        </p>
      </header>

      <div className={styles.loginStatus}>
        {user ? (
          <>
            <h2>You are signed in</h2>
            <p>{user.fullName ?? user.email}</p>
            <div className={styles.actions}>
              <Link className="button button-primary" href="/account">
                Continue to account
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2>Continue with ChatGPT</h2>
            <p>
              ChatGPT supplies your identity. This site keeps its own
              server-owned account, role, and access records.
            </p>
            <div className={styles.actions}>
              <Link
                className="button button-primary"
                href={chatGPTSignInPath("/account")}
              >
                Sign in with ChatGPT
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
