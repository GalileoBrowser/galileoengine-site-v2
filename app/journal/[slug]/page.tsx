import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownContent } from "@/components/markdown-content";
import { ModeNotice } from "@/components/mode-notice";
import { formatJournalDate } from "@/lib/journal/content";
import { getPublishedPost } from "@/lib/journal/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublishedPost(slug);
  if (!result.data) {
    return {
      title: result.mode === "error" ? "Journal unavailable" : "Article not found",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: result.data.title,
    description: result.data.excerpt,
    alternates: { canonical: `/journal/${result.data.slug}` },
    openGraph: {
      type: "article",
      title: result.data.title,
      description: result.data.excerpt,
      publishedTime: result.data.publishedAt ?? undefined,
      authors: [result.data.author.displayName],
      images: result.data.coverUrl ? [result.data.coverUrl] : undefined,
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublishedPost(slug);

  if (!result.data && result.mode !== "error") notFound();

  if (!result.data) {
    return (
      <main className="article-main" id="main-content">
        <ModeNotice mode="error" message={result.message ?? "This article is unavailable."} />
        <section className="article-shell">
          <div className="journal-empty">
            <h1>We could not load this field note.</h1>
            <p>
              Return to the journal and try again. No draft content has been exposed.
            </p>
            <Link className="secondary-button" href="/journal">
              Back to Journal
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const post = result.data;

  return (
    <main className="article-main" id="main-content">
      <article>
        <header className="article-hero">
          <div className="article-hero__inner">
            <Link className="article-breadcrumb" href="/journal">
              <span aria-hidden="true">←</span> Galileo Journal
            </Link>
            <p className="article-kicker">{post.category}</p>
            <h1>{post.title}</h1>
            <p className="article-deck">{post.excerpt}</p>
            <div className="article-byline">
              <strong>{post.author.displayName}</strong>
              <time dateTime={post.publishedAt ?? post.createdAt}>
                {formatJournalDate(post.publishedAt ?? post.createdAt)}
              </time>
              <span>{post.readingMinutes} min read</span>
            </div>
          </div>
        </header>

        <ModeNotice mode={result.mode} message={result.message} />

        <div className="article-shell">
          <MarkdownContent markdown={post.bodyMarkdown} />
          <aside className="article-aside">
            <span>Editorial standard</span>
            <p>
              This note describes a scoped result or decision. It does not replace the public
              project status or release gates.
            </p>
            <Link href="/status.html">Read current status</Link>
          </aside>
        </div>
      </article>
    </main>
  );
}
