# GalileoEngine website and Journal

The public presentation site for GalileoEngine and Galileo Browser, plus Galileo Journal and its private editorial Studio.

Current production site: <https://silviu3369.github.io/galileoengine-site/>

The current GitHub Pages deployment remains the approved production version. The Next.js application in this branch is the migration candidate for Vercel; it has not been published yet.

## Architecture

- Existing presentation pages remain static HTML and are copied into `public/legacy` during development and production builds.
- Next.js rewrites preserve the current URLs (`/`, `/platform.html`, `/roadmap.html`, and the other presentation routes).
- `/journal` and `/journal/[slug]` are public Next.js routes.
- `/login` and `/studio` provide invited-team authentication and editorial workflows.
- Supabase supplies Auth, Postgres, Storage, and row-level authorization.
- No service-role key is used by the web application. Every editorial operation runs as the signed-in user and is constrained by RLS.

This incremental structure keeps the approved presentation site intact while allowing the Journal to use server rendering and real authentication.

## Local development

Requirements: a current Node.js LTS release and pnpm 11.

```powershell
pnpm install
pnpm dev
```

Open <http://127.0.0.1:3000/>. The pre-development hook synchronizes the legacy presentation files automatically.

Without Supabase environment variables, the public Journal shows clearly labelled preview articles and Studio remains disabled. It never simulates authentication, saving, or publishing.

## Supabase setup

1. Create a Supabase project for Galileo Journal.
2. Apply `supabase/migrations/20260808160000_galileo_journal.sql` with the Supabase CLI or SQL editor.
3. Copy `.env.example` to `.env.local` and configure:

   ```dotenv
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

4. Add `http://localhost:3000/auth/callback` to the Supabase Auth redirect URLs.
5. Create or invite the confirmed co-founder accounts in Supabase Auth. The migration maps the two confirmed team emails to the administrator role. Add another `editor_invites` row only after that teammate's email is confirmed.
6. If GitHub sign-in is enabled, configure the GitHub provider and its callback in Supabase before exposing that option in production.

The database migration creates:

- public profiles with `reader`, `editor`, and `admin` roles;
- draft, review, published, and archived post states;
- immutable pre-update revision snapshots;
- public access only to published articles whose publication date has arrived;
- owner-scoped editor writes and administrator-only publish/archive controls;
- an 8 MB public image bucket with owner-folder write and delete policies.

## Editorial workflow

- Editors can create their own drafts and send them to review.
- Editors cannot publish, archive, or modify another author's article.
- Administrators can review, publish, update, archive, and manage all articles.
- The server re-reads ownership and current status before every mutation; hidden browser fields are not treated as trusted state.
- Published Markdown is rendered through a sanitizing pipeline.

## Verification

Run the complete local gate:

```powershell
pnpm typecheck
pnpm lint
pnpm test:site
pnpm build
```

The legacy validator can also exercise response types through a running server:

```powershell
python tests\validate_site.py --base-url http://127.0.0.1:3000/
```

The Supabase migration still needs to be applied to a real project before authentication and RLS can be tested end to end.

## Vercel migration

GitHub Pages can only host the static presentation files; it cannot run the Journal's Next.js server routes or Supabase session refresh.

After the local version is approved:

1. Import the GitHub repository into Vercel as a Next.js project.
2. Add the three public environment variables for Preview and Production.
3. Set `NEXT_PUBLIC_SITE_URL` to the environment's canonical URL.
4. Add the Vercel preview and production callback URLs in Supabase Auth.
5. Verify Journal reading, team sign-in, draft creation, review, image upload, publication, archive, and unauthorized access on a Vercel Preview deployment.
6. Promote the verified deployment and only then replace the GitHub Pages production address or attach the future custom domain.

## Public routes

- `/` — GalileoEngine homepage
- `/platform.html` — GalileoEngine and Servo boundary
- `/roadmap.html` — measured delivery path
- `/galileo-browser.html` — Galileo Browser product page
- `/status.html` — current project boundary
- `/team.html` — founding team
- `/journal` — public engineering journal
- `/login` — invited-team sign-in
- `/studio` — private editorial workspace

The site makes no release or everyday-browsing claim. GalileoEngine is an experimental browser platform derived from Servo; Galileo Browser is the desktop browser product built on that foundation.
