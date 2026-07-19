"use client";

import type {
  StructuredTextBlock,
  StructuredTextBlockType,
} from "@/lib/updates/types.ts";
import styles from "./Updates.module.css";

export function StructuredBodyEditor({
  blocks,
  onChange,
}: {
  readonly blocks: readonly StructuredTextBlock[];
  readonly onChange: (blocks: readonly StructuredTextBlock[]) => void;
}) {
  function update(index: number, field: "type" | "text", value: string) {
    onChange(
      blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, [field]: value } : block,
      ),
    );
  }

  return (
    <section>
      <div className={styles.blockHeading}>
        <h3>Structured body</h3>
        <button
          className={styles.textButton}
          onClick={() => onChange([...blocks, { type: "paragraph", text: "" }])}
          type="button"
        >
          Add text block
        </button>
      </div>
      <div className={styles.blockList}>
        {blocks.map((block, index) => (
          <div className={styles.blockItem} key={`block-${index}`}>
            <label className={styles.field}>
              <span>Block type</span>
              <select
                onChange={(event) =>
                  update(
                    index,
                    "type",
                    event.target.value as StructuredTextBlockType,
                  )
                }
                value={block.type}
              >
                <option value="heading">Heading</option>
                <option value="paragraph">Paragraph</option>
                <option value="quote">Quote</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Text</span>
              <textarea
                maxLength={8000}
                onChange={(event) => update(index, "text", event.target.value)}
                required
                rows={block.type === "heading" ? 2 : 6}
                value={block.text}
              />
            </label>
            <button
              className={styles.textButton}
              disabled={blocks.length === 1}
              onClick={() =>
                onChange(blocks.filter((_, blockIndex) => blockIndex !== index))
              }
              type="button"
            >
              Remove block
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
