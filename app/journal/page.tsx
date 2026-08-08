import type { Metadata } from "next";
import Link from "next/link";
import { ModeNotice } from "@/components/mode-notice";
import { PostCard } from "@/components/post-card";
import { getPublishedPosts } from "@/lib/journal/queries";

export const metadata: Metadata = {
  title: "Journal",
  description:
    "Engineering notes, measured progress, and product updates from the GalileoEngine team.",
  alternates: { canonical: "/journal" },
};

const categories = [
  "Engine notes",
  "Development updates",
  "Galileo Browser",
  "Release notes",
];

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const selectedCategory = categories.includes(category ?? "") ? category : undefined;
  const result = await getPublishedPosts(selectedCategory);
  const [featured, ...remaining] = result.data;

  return (
    <main className="journal-main" id="main-content">
      <section className="journal-hero">
        <div className="journal-hero__inner">
          <div>
            <p className="journal-eyebrow">
              <span aria-hidden="true" /> Galileo Journal / field notes
            </p>
            <h1>Engineering notes. Limits attached.</h1>
            <p className="journal-hero__lead">
              Decisions, retained evidence, and product updates from the team building
              GalileoEngine and Galileo Browser.
            </p>
          </div>
          <aside className="journal-hero__index" aria-label="Journal editorial standard">
            <span>Editorial rule / 01</span>
            <strong>Show the work.</strong>
            <p>
              Every update states what was observed, where it was observed, and what the
              result does not establish.
            </p>
          </aside>
        </div>
      </section>

      <ModeNotice mode={result.mode} message={result.message} />

      {featured ? (
        <>
          <section className="featured-section">
            <div className="section-shell">
              <header className="section-heading">
                <div>
                  <p className="section-kicker">Latest field note</p>
                  <h2>One subject, examined properly.</h2>
                </div>
                <p>
                  Long-form notes explain the reasoning behind project boundaries, progress
                  gates, and product decisions.
                </p>
              </header>
              <PostCard post={featured} featured />
            </div>
          </section>

          <section className="journal-list-section">
            <div className="section-shell">
              <div className="journal-toolbar">
                <nav className="category-list" aria-label="Filter journal by category">
                  <Link href="/journal" aria-current={!selectedCategory ? "true" : undefined}>
                    All notes
                  </Link>
                  {categories.map((item) => (
                    <Link
                      href={`/journal?category=${encodeURIComponent(item)}`}
                      key={item}
                      aria-current={selectedCategory === item ? "true" : undefined}
                    >
                      {item}
                    </Link>
                  ))}
                </nav>
                <span>
                  {result.data.length} {result.data.length === 1 ? "entry" : "entries"}
                </span>
              </div>

              {remaining.length > 0 ? (
                <div className="posts-grid">
                  {remaining.map((post) => (
                    <PostCard post={post} key={post.id} />
                  ))}
                </div>
              ) : (
                <div className="journal-empty">
                  <h2>No additional notes in this view.</h2>
                  <p>
                    Choose another category or return to all notes. Published work will appear
                    here in reverse chronological order.
                  </p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="journal-list-section">
          <div className="section-shell journal-empty">
            <h2>{result.mode === "error" ? "The journal is unavailable." : "No notes published yet."}</h2>
            <p>
              {result.message ??
                "The first published field note will appear here when it clears editorial review."}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
