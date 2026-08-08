import Link from "next/link";

export default function NotFound() {
  return (
    <main className="article-main" id="main-content">
      <section className="article-hero">
        <div className="article-hero__inner">
          <p className="article-kicker">404 / outside the archive</p>
          <h1>This field note is not here.</h1>
          <p className="article-deck">
            It may have moved, remained a draft, or never been published.
          </p>
          <Link className="primary-button" href="/journal">
            Return to Journal
          </Link>
        </div>
      </section>
    </main>
  );
}
