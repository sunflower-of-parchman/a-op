export const CONTENT_SECTION_KINDS = ["prose", "quote", "callout"] as const;

export type ContentSectionKind = (typeof CONTENT_SECTION_KINDS)[number];
export type ContentSectionPublicationState = "draft" | "published" | "archived";

export interface ContentSectionDraftInput {
  readonly sectionKey: string;
  readonly kind: ContentSectionKind;
  readonly heading: string;
  readonly bodyText: string;
}

export interface ContentSectionRevisionDTO {
  readonly id: string;
  readonly revision: number;
  readonly kind: ContentSectionKind;
  readonly heading: string;
  readonly bodyText: string;
  readonly createdAt: string;
}

export interface AdminContentSectionDTO {
  readonly id: string;
  readonly sectionKey: string;
  readonly version: number;
  readonly publicationState: ContentSectionPublicationState;
  readonly draft: ContentSectionRevisionDTO;
  readonly published: ContentSectionRevisionDTO | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublishedContentSectionOptionDTO {
  readonly sectionId: string;
  readonly sectionKey: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly kind: ContentSectionKind;
  readonly heading: string;
  readonly label: string;
}
