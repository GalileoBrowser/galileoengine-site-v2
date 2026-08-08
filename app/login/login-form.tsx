"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FormState =
  | { kind: "idle"; message: "" }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function LoginForm({
  configured,
  nextPath,
}: {
  configured: boolean;
  nextPath: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle", message: "" });

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || !email.trim()) return;

    setState({ kind: "loading", message: "Requesting a secure sign-in link…" });
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });

    if (error) {
      setState({
        kind: "error",
        message:
          "We could not send a sign-in link. Confirm that this address has been invited to the editorial team.",
      });
      return;
    }

    setState({
      kind: "success",
      message: "Check your inbox. The secure link returns you directly to Galileo Studio.",
    });
  }

  async function signInWithGitHub() {
    if (!configured) return;

    setState({ kind: "loading", message: "Opening GitHub sign-in…" });
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo },
    });

    if (error) {
      setState({ kind: "error", message: "GitHub sign-in could not be started." });
    }
  }

  const busy = state.kind === "loading";

  return (
    <div className="auth-card">
      <h2>Team sign in</h2>
      <p className="auth-card__intro">
        Access is limited to invited GalileoEngine editors and administrators.
      </p>

      <form onSubmit={requestMagicLink}>
        <div className="form-field">
          <label htmlFor="email">Team email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={!configured || busy}
          />
        </div>
        <button className="primary-button auth-submit" type="submit" disabled={!configured || busy}>
          {busy ? "Please wait" : "Send secure link"}
        </button>
      </form>

      <div className="auth-divider">or</div>

      <button
        className="secondary-button auth-submit"
        type="button"
        onClick={signInWithGitHub}
        disabled={!configured || busy}
      >
        Continue with GitHub
      </button>

      {!configured ? (
        <p className="auth-message">
          Supabase must be connected before authentication is enabled.
        </p>
      ) : null}

      {state.message ? (
        <p
          className={`auth-message${state.kind === "error" ? " auth-message--error" : ""}`}
          role={state.kind === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
