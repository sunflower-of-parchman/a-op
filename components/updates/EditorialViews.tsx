import Link from "next/link";
import type {
  PublishedEditorialPostDTO,
  StructuredTextBlock,
} from "@/lib/updates/types.ts";
import { StructuredBody } from "./StructuredBody";
import styles from "./Updates.module.css";

export function EditorialIndex({
  posts,
}: {
  readonly posts: readonly PublishedEditorialPostDTO[];
}) {
  return (
    <section className={`${styles.content} page-frame`}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Editorial</p>
        <h2>Writing published by the artist.</h2>
      </header>
      {posts.length === 0 ? (
        <p className={styles.empty}>No editorial posts are published yet.</p>
      ) : (
        <ol className={styles.list}>
          {posts.map((post) => (
            <li className={styles.row} key={post.id}>
              <div className={styles.rowIdentity}>
                <p className={styles.eyebrow}>Editorial</p>
                <h2>
                  <Link href={`/journal/${post.slug}`}>{post.title}</Link>
                </h2>
              </div>
              <p className={styles.summary}>{post.excerpt}</p>
              <Link className={styles.textLink} href={`/journal/${post.slug}`}>
                Read post
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function EditorialDetail({
  title,
  excerpt,
  body,
}: {
  readonly title: string;
  readonly excerpt: string;
  readonly body: readonly StructuredTextBlock[];
}) {
  return (
    <article className="page-frame">
      <header className={styles.detailHeader}>
        <p className={styles.eyebrow}>Editorial</p>
        <h1>{title}</h1>
        {excerpt ? <p className={styles.summary}>{excerpt}</p> : null}
      </header>
      <div className={styles.detail}>
        <StructuredBody blocks={body} />
      </div>
    </article>
  );
}
