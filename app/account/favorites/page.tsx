import { env } from "cloudflare:workers";
import { FavoriteList } from "@/components/account";
import styles from "@/components/account/customer-library/CustomerLibrary.module.css";
import { requireCustomerLibraryPage } from "@/components/account/customer-library/server";
import { readCustomerFavorites } from "@/db/customer-read.ts";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const identity = await requireCustomerLibraryPage("/account/favorites");
  const favorites = await readCustomerFavorites(env.DB, identity.userId);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h2>Favorites</h2>
        <p>
          Music you have saved from this artist. Removed favorites remain here
          until you leave the page so you can restore them immediately.
        </p>
      </header>
      <FavoriteList favorites={favorites} />
    </div>
  );
}
