export type StructuredTextBlockType = "heading" | "paragraph" | "quote";

export interface StructuredTextBlock {
  readonly type: StructuredTextBlockType;
  readonly text: string;
}

export type UpdateAudience = "public" | "account";
export type UpdateResourceType =
  | "track"
  | "release"
  | "collection"
  | "course"
  | "video"
  | "page"
  | "license"
  | "membership"
  | "subscription"
  | "order";

export interface UpdateResourceInput {
  readonly type: UpdateResourceType;
  readonly id: string;
}

export interface UpdateDraftInput {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly body: readonly StructuredTextBlock[];
  readonly audience: UpdateAudience;
  readonly resource: UpdateResourceInput | null;
}

export interface EditorialDraftInput {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly body: readonly StructuredTextBlock[];
}

export interface UpdateResourceLinkDTO extends UpdateResourceInput {
  readonly label: string;
  readonly href: string;
}

export interface PublishedUpdateDTO {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly body: readonly StructuredTextBlock[];
  readonly audience: UpdateAudience;
  readonly resource: UpdateResourceLinkDTO | null;
  readonly publishedAt: string;
  readonly revision: number;
  readonly read: boolean;
}

export interface AdminUpdateDTO extends UpdateDraftInput {
  readonly id: string;
  readonly state: "draft" | "published" | "archived";
  readonly publishedAt: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface PublishedEditorialPostDTO extends EditorialDraftInput {
  readonly id: string;
  readonly publishedAt: string;
  readonly revision: number;
}

export interface AdminEditorialPostDTO extends EditorialDraftInput {
  readonly id: string;
  readonly state: "draft" | "published" | "archived";
  readonly publishedAt: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface UpdateReadReceiptDTO {
  readonly id: string;
  readonly updateId: string;
  readonly userId: string;
  readonly readAt: string;
}
