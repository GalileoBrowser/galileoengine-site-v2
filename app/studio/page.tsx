import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/studio/actions";
import { StudioSetup } from "@/components/studio-setup";
import { formatJournalDate } from "@/lib/journal/content";
import { getCurrentStudioProfile, getStudioPosts } from "@/lib/journal/queries";

export default async function StudioPage() {
  const profileResult = await getCurrentStudioProfile();

  if (profileResult.mode === "preview") {
    return (
      <main className="studio-main" id="main-content">
        <div className="studio-shell">
          <header className="studio-heading">
            <div className="studio-heading__copy">
              <p className="studio-kicker">Galileo Studio / local preview</p>
              <h1>Editorial control, without hidden states.</h1>
              <p>Draft, review, and publication remain separate, visible decisions.</p>
            </div>
          </header>
          <StudioSetup />
        </div>
      </main>
    );
  }

  if (!profileResult.data && profileResult.mode === "live") redirect("/login?next=/studio");

  const profile = profileResult.data;
  if (!profile) {
    return (
      <main className="studio-main" id="main-content">
        <div className="studio-shell access-panel" role="alert">
          <h1>Editorial profile unavailable.</h1>
          <p>{profileResult.message ?? "Try signing in again."}</p>
        </div>
      </main>
    );
  }

  if (profile.role === "reader") {
    return (
      <main className="studio-main" id="main-content">
        <div className="studio-shell access-panel">
          <h1>This account is not an editor.</h1>
          <p>
            Your sign-in is valid, but Studio access requires an editor or administrator role.
          </p>
          <form action={signOut}>
            <button className="secondary-button" type="submit">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  const postsResult = await getStudioPosts();
  const counts = {
    draft: postsResult.data.filter((post) => post.status === "draft").length,
    review: postsResult.data.filter((post) => post.status === "review").length,
    published: postsResult.data.filter((post) => post.status === "published").length,
  };

  return (
    <main className="studio-main" id="main-content">
      <div className="studio-shell">
        <header className="studio-heading">
          <div className="studio-heading__copy">
            <p className="studio-kicker">Galileo Studio / {profile.role}</p>
            <h1>Make every public claim reviewable.</h1>
            <p>
              Signed in as {profile.displayName}. Drafts remain private until their status is
              deliberately changed.
            </p>
          </div>
          <div className="editor-actions">
            <Link className="primary-button" href="/studio/new">New article</Link>
            <form action={signOut}>
              <button className="secondary-button" type="submit">Sign out</button>
            </form>
          </div>
        </header>

        <section className="studio-summary" aria-label="Article status summary">
          <article><span>Drafts</span><strong>{counts.draft}</strong></article>
          <article><span>In review</span><strong>{counts.review}</strong></article>
          <article><span>Published</span><strong>{counts.published}</strong></article>
        </section>

        {postsResult.data.length ? (
          <div className="studio-table-wrap" tabIndex={0} aria-label="Editorial articles">
            <table className="studio-table">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {postsResult.data.map((post) => (
                  <tr key={post.id}>
                    <td>{post.title}</td>
                    <td>{post.category}</td>
                    <td><span className={`status-chip status-chip--${post.status}`}>{post.status}</span></td>
                    <td>{formatJournalDate(post.updatedAt)}</td>
                    <td><Link href={`/studio/${post.id}`}>Edit</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="studio-empty">
            <h2>No articles yet.</h2>
            <p>Create the first draft. Nothing becomes public until it is published.</p>
          </div>
        )}
      </div>
    </main>
  );
}
