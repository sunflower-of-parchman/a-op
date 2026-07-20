export interface PublicPageHeaderProps {
  variant: "home" | "compact";
  title: string;
}

export function PublicPageHeader({ title }: PublicPageHeaderProps) {
  return <h1 className="sr-only">{title}</h1>;
}

export default PublicPageHeader;
