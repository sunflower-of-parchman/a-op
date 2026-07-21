import type { PublicPageHero } from "@/db/page-presentation.ts";
import type { PublicArtwork } from "@/db/public-media.ts";
import { MediaMosaic } from "./MediaMosaic";
import styles from "./PageHero.module.css";

export function PageHero({
  hero,
  mosaicImages,
  title,
}: {
  readonly hero: PublicPageHero | null;
  readonly mosaicImages?: readonly PublicArtwork[];
  readonly title: string;
}) {
  if (mosaicImages) {
    return <MediaMosaic images={mosaicImages} title={title} />;
  }
  if (!hero) {
    return (
      <header className={`page-frame ${styles.plain}`}>
        <h1>{title}</h1>
      </header>
    );
  }

  return (
    <header className={styles.hero}>
      <img alt={hero.altText} className={styles.image} src={hero.url} />
      <div className="page-frame">
        <h1 className={styles.title}>{title}</h1>
      </div>
    </header>
  );
}

export default PageHero;
