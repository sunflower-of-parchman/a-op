export interface NavigationItem {
  label: string;
  href: string;
  external?: boolean;
}

export const publicNavigation = [
  { label: "Music", href: "/music" },
  { label: "About", href: "/about" },
  { label: "Courses", href: "/courses" },
  { label: "Videos", href: "/videos" },
  { label: "Membership", href: "/membership" },
  { label: "Licensing", href: "/licensing" },
  { label: "Contact", href: "/contact" },
  { label: "What's New", href: "/whats-new" },
] satisfies readonly NavigationItem[];

export const footerNavigation = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "FAQ", href: "/faq" },
] satisfies readonly NavigationItem[];
