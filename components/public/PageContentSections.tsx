import type { PageContentSection } from "@/db/site-read.ts";

function Paragraphs({ text }: Readonly<{ text: string }>) {
  return text
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph, index) => <p key={index}>{paragraph}</p>);
}

export function PageContentSections({
  sections,
}: Readonly<{ sections: readonly PageContentSection[] }>) {
  if (sections.length === 0) return null;

  return (
    <div className="page-content-sections">
      {sections.map((section) => {
        const content = (
          <>
            {section.heading ? <h2>{section.heading}</h2> : null}
            <Paragraphs text={section.bodyText} />
          </>
        );
        if (section.kind === "quote") {
          return (
            <blockquote
              className="page-content-section page-content-section--quote"
              key={section.id}
            >
              {content}
            </blockquote>
          );
        }
        if (section.kind === "callout") {
          return (
            <aside
              className="page-content-section page-content-section--callout"
              key={section.id}
            >
              {content}
            </aside>
          );
        }
        return (
          <section className="page-content-section" key={section.id}>
            {content}
          </section>
        );
      })}
    </div>
  );
}

export default PageContentSections;
