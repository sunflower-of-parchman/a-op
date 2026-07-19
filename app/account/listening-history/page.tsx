import { env } from "cloudflare:workers";
import { ListeningHistoryList } from "@/components/account";
import styles from "@/components/account/customer-library/CustomerLibrary.module.css";
import { requireCustomerLibraryPage } from "@/components/account/customer-library/server";
import { readListeningHistory } from "@/db/customer-read.ts";

export const dynamic = "force-dynamic";

export default async function ListeningHistoryPage() {
  const identity = await requireCustomerLibraryPage(
    "/account/listening-history",
  );
  const history = await readListeningHistory(env.DB, identity.userId);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h2>Listening history</h2>
        <p>
          The title you heard stays recorded alongside the track’s current
          catalog availability. Resume starts from the saved listening position.
        </p>
      </header>
      <ListeningHistoryList history={history} />
    </div>
  );
}
