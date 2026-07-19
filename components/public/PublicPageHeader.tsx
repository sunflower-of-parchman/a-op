export interface PublicPageHeaderProps {
  variant: "home" | "compact";
  title: string;
}

export function PublicPageHeader({ variant, title }: PublicPageHeaderProps) {
  return (
    <header
      className={`public-page-heading public-page-heading--${variant} page-frame`}
    >
      <h1>{title}</h1>
    </header>
  );
}

export default PublicPageHeader;
