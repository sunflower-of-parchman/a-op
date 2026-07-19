import type { StructuredTextBlock } from "@/lib/updates/types.ts";
import styles from "./Updates.module.css";

export function StructuredBody({
  blocks,
}: {
  readonly blocks: readonly StructuredTextBlock[];
}) {
  return (
    <div className={styles.body}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") return <h2 key={key}>{block.text}</h2>;
        if (block.type === "quote")
          return <blockquote key={key}>{block.text}</blockquote>;
        return <p key={key}>{block.text}</p>;
      })}
    </div>
  );
}
