import { redirect } from "next/navigation";
import { EditorForm } from "@/components/editor-form";
import { StudioSetup } from "@/components/studio-setup";
import { getCurrentStudioProfile } from "@/lib/journal/queries";

export const metadata = { title: "New article" };

export default async function NewArticlePage() {
  const profileResult = await getCurrentStudioProfile();

  if (profileResult.mode === "preview") {
    return (
      <main className="studio-main" id="main-content">
        <div className="studio-shell"><StudioSetup headingLevel="h1" /></div>
      </main>
    );
  }

  if (!profileResult.data && profileResult.mode === "live") redirect("/login?next=/studio/new");
  const profile = profileResult.data;

  if (!profile || profile.role === "reader") {
    return (
      <main className="studio-main" id="main-content">
        <div className="studio-shell access-panel">
          <h1>Editorial access required.</h1>
          <p>This account cannot create journal drafts.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="studio-main" id="main-content">
      <div className="studio-shell">
        <header className="studio-heading">
          <div className="studio-heading__copy">
            <p className="studio-kicker">New field note / private draft</p>
            <h1>Start with the evidence.</h1>
            <p>The preview updates locally. Saving writes the draft through Supabase RLS.</p>
          </div>
        </header>
        <EditorForm role={profile.role} />
      </div>
    </main>
  );
}
