import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/galileo-symbol.png" alt="" width="34" height="34" />
        <span>
          Galileo<strong>Engine</strong>
        </span>
      </div>
      <p>Field notes from the GalileoEngine founding team.</p>
      <p className="app-footer__legal">
        Evidence before claims. <Link href="/status.html">Current status</Link>
        {" · "}
        <Link href="/login">Team sign in</Link>
      </p>
    </footer>
  );
}
