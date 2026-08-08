import Link from "next/link";
import { formatJournalDate } from "@/lib/journal/content";
import type { JournalPost } from "@/lib/journal/types";

export function PostCard({ post, featured = false }: { post: JournalPost; featured?: boolean }) {
  return (
    <article className={featured ? "post-card post-card--featured" : "post-card"}>
      <div className="post-card__visual" aria-hidden="true">
        {post.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverUrl} alt="" />
        ) : (
          <>
            <span>{post.category}</span>
            <i />
            <b />
          </>
        )}
      </div>
      <div className="post-card__copy">
        <div className="post-meta">
          <span>{post.category}</span>
          <time dateTime={post.publishedAt ?? post.createdAt}>
            {formatJournalDate(post.publishedAt ?? post.createdAt)}
          </time>
          <span>{post.readingMinutes} min read</span>
        </div>
        <h2>
          <Link href={`/journal/${post.slug}`}>{post.title}</Link>
        </h2>
        <p>{post.excerpt}</p>
        <div className="post-card__footer">
          <span>By {post.author.displayName}</span>
          <Link href={`/journal/${post.slug}`} aria-label={`Read ${post.title}`}>
            Read article <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
