import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-frame not-found">
      <h1>Page not found.</h1>
      <p>The requested page is not part of this installation.</p>
      <Link className="button button-secondary" href="/">
        Return home
      </Link>
    </div>
  );
}
