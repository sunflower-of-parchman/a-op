import { env } from "cloudflare:workers";
import Link from "next/link";
import {
  chatGPTSignOutPath,
  isLocalAccountPreviewEnabled,
  requireChatGPTUser,
} from "@/app/chatgpt-auth";
import {
  AccountDownloads,
  AccountLicenses,
  CustomerActivationControl,
  ProfileEditor,
} from "@/components/account";
import { readCustomerAccessLibrary } from "@/db/customer-access-read.ts";
import { readCustomerCreditAccountDetail } from "@/db/credit-ledger-read.ts";
import { readCustomerLicenseHistory } from "@/db/licensing-read.ts";
import { readActiveModuleKeys } from "@/db/site-read.ts";
import { countUnreadUpdates, listPublishedUpdates } from "@/db/updates-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity";

import styles from "./AccountPage.module.css";

interface ProfileRow {
  display_name: string;
  revision: number;
}

export const dynamic = "force-dynamic";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function AccountPage() {
  const authenticatedUser = await requireChatGPTUser("/account");
  const [identity, activeModuleKeys] = await Promise.all([
    resolveApplicationIdentity(env.DB, authenticatedUser),
    readActiveModuleKeys(env.DB),
  ]);
  const customerActive = identity?.roles.includes("customer") ?? false;

  if (!customerActive || !identity) {
    return (
      <div className="account-content">
        <h2>Activate account</h2>
        <p>
          Create the customer profile connected to this signed-in ChatGPT
          identity.
        </p>
        <CustomerActivationControl />
      </div>
    );
  }

  const activeModules = new Set(activeModuleKeys);
  const whatsNewActive = activeModules.has("whats-new");
  const [
    access,
    downloadCredits,
    licenseCredits,
    licenseHistory,
    profile,
    updates,
    unreadCount,
  ] = await Promise.all([
    activeModules.has("customer-library")
      ? readCustomerAccessLibrary(env.DB, identity, new Date().toISOString())
      : Promise.resolve(null),
    readCustomerCreditAccountDetail(env.DB, "download", identity.userId),
    activeModules.has("licensing")
      ? readCustomerCreditAccountDetail(env.DB, "license", identity.userId)
      : Promise.resolve(null),
    activeModules.has("licensing")
      ? readCustomerLicenseHistory(env.DB, identity.userId)
      : Promise.resolve(null),
    env.DB.prepare(
      `SELECT display_name, revision FROM profiles WHERE user_id = ?1 LIMIT 1`,
    )
      .bind(identity.userId)
      .first<ProfileRow>(),
    whatsNewActive
      ? listPublishedUpdates(env.DB, identity.userId)
      : Promise.resolve([]),
    whatsNewActive
      ? countUnreadUpdates(env.DB, identity.userId)
      : Promise.resolve(0),
  ]);

  const downloadableTracks =
    access?.resources.filter(
      (item) =>
        item.resource.resourceType === "track" && item.downloadUrl !== null,
    ) ?? [];

  const metrics = [
    {
      label: "Download credits",
      value: downloadCredits?.account.available ?? 0,
    },
    {
      label: "License credits",
      value: licenseCredits?.account.available ?? 0,
    },
    {
      label: "Tracks purchased",
      value: downloadableTracks.length,
    },
    {
      label: "Licenses created",
      value: licenseHistory?.licenses.length ?? 0,
    },
  ];
  const latestUpdate = updates[0] ?? null;

  const summary = (
    <dl className={styles.summary} aria-label="Account summary">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div className={styles.page}>
      {whatsNewActive ? (
        <div className={styles.accountTop}>
          {summary}
          <section
            className={styles.updates}
            aria-labelledby="account-whats-new-title"
          >
            <div className={styles.updatesHeader}>
              <div>
                <h2 id="account-whats-new-title">What&apos;s New</h2>
                <p>
                  {unreadCount === 0
                    ? "You are up to date."
                    : `${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}`}
                </p>
              </div>
              <Link href="/whats-new">View all updates</Link>
            </div>

            {latestUpdate ? (
              <article className={styles.latestUpdate}>
                <time dateTime={latestUpdate.publishedAt}>
                  {dateLabel(latestUpdate.publishedAt)}
                </time>
                <div>
                  <h3>{latestUpdate.title}</h3>
                  <p>{latestUpdate.summary}</p>
                </div>
                <Link href={`/whats-new/${latestUpdate.slug}`}>Read</Link>
              </article>
            ) : (
              <p className={styles.noUpdates}>No updates are available yet.</p>
            )}
          </section>
        </div>
      ) : (
        summary
      )}

      {access ? (
        <section className={styles.section} aria-label="Downloads">
          <AccountDownloads tracks={downloadableTracks} />
        </section>
      ) : null}

      {licenseHistory ? (
        <section className={styles.section} aria-label="Licenses">
          <AccountLicenses history={licenseHistory} />
        </section>
      ) : null}

      {profile ? (
        <section className={styles.section} aria-labelledby="profile-title">
          <div className={styles.sectionHeading}>
            <h2 id="profile-title">Profile</h2>
            <p>
              The name shown in your account. You sign in with{" "}
              {authenticatedUser.email}.
            </p>
          </div>
          <ProfileEditor
            displayName={profile.display_name}
            revision={profile.revision}
          />
        </section>
      ) : null}

      {!isLocalAccountPreviewEnabled() ? (
        <section className={styles.signOut} aria-label="Sign out">
          <div>
            <h2>Sign out</h2>
            <p>Sign out when you are finished on this device.</p>
          </div>
          <a className="button button-secondary" href={chatGPTSignOutPath("/")}>
            Sign out
          </a>
        </section>
      ) : null}
    </div>
  );
}
