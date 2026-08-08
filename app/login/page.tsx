import type { Metadata } from "next";
import { LoginForm } from "@/app/login/login-form";
import { safeStudioNextPath } from "@/lib/journal/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Team sign in",
  description: "Secure access to Galileo Studio for invited team members.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const query = await searchParams;
  const nextPath = safeStudioNextPath(query.next);

  return (
    <main className="auth-main" id="main-content">
      <div className="auth-layout">
        <section className="auth-copy">
          <p className="journal-eyebrow">
            <span aria-hidden="true" /> Galileo Studio / restricted
          </p>
          <h1>Publish with a visible chain of review.</h1>
          <p className="auth-copy__lead">
            Draft privately, attach evidence, preview the final article, and publish only when
            its scope is clear.
          </p>
        </section>
        <section aria-label="Sign in to Galileo Studio">
          <LoginForm configured={isSupabaseConfigured} nextPath={nextPath} />
          {query.error ? (
            <p className="auth-message auth-message--error" role="alert">
              The sign-in response was invalid or expired. Request a fresh link and try again.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
