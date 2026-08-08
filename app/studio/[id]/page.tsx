import { notFound, redirect } from "next/navigation";
import { EditorForm } from "@/components/editor-form";
import { StudioSetup } from "@/components/studio-setup";
import { getCurrentStudioProfile, getStudioPost } from "@/lib/journal/queries";

export const metadata = { title: "Edit article" };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profileResult = await getCurrentStudioProfile();

  if (profileResult.mode === "preview") {
    return (
      <main className="studio-main" id="main-content">
        <div className="studio-shell"><StudioSetup headingLevel="h1" /></div>
      </main>
    );
  }

  if (!profileResult.data && profileResult.mode === "live") {
    redirect(`/login?next=${encodeURIComponent(`/studio/${id}`)}`);
  }

  const profile = profileResult.data;
  if (!profile || profile.role === "reader") {
    return (
      <main className="studio-main" id="main-content">
        <div className="studio-shell access-panel">
          <h1>Editorial access required.</h1>
          <p>This account cannot modify journal drafts.</p>
        </div>
      </main>
    );
  }

  const postResult = await getStudioPost(id);
  if (!postResult.data && postResult.mode !== "error") notFound();
  if (!postResult.data) {
    return (
      <main className="studio-main" id="main-content">
        <div className="studio-shell access-panel" role="alert">
          <h1>Draft unavailable.</h1>
          <p>{postResult.message ?? "Try again from the Studio dashboard."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="studio-main" id="main-content">
      <div className="studio-shell">
        <header className="studio-heading">
          <div className="studio-heading__copy">
            <p className="studio-kicker">Edit / {postResult.data.status}</p>
            <h1>Review the complete article.</h1>
            <p>Changes remain governed by your editorial role and the article status.</p>
          </div>
        </header>
        <EditorForm post={postResult.data} role={profile.role} />
      </div>
    </main>
  );
}
