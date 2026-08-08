# GalileoEngine website

The public presentation site for GalileoEngine and Galileo Browser, including an engineering Journal backed by GitHub Discussions.

- Public V2 site: <https://silviu3369.github.io/galileoengine-site-v2/>
- Galileo Journal: <https://silviu3369.github.io/galileoengine-site-v2/journal/>
- Journal discussions: <https://github.com/Silviu3369/galileoengine-site-v2/discussions/categories/announcements>
- Legacy V1 site: <https://silviu3369.github.io/galileoengine-site/>

## Architecture

- GitHub Pages hosts the static presentation site.
- GitHub Discussions provides Journal publishing, author identity, replies, reactions, notifications, and moderation.
- The `Announcements` discussion category is the canonical Galileo Journal channel. Only maintainers and administrators can create announcement discussions; the community can reply.
- GitHub Actions rebuilds the Journal index when the site changes or an announcement discussion is created, edited, moved, or deleted.
- The site has no custom authentication, application server, database, Supabase project, or Vercel deployment.

This keeps the public engineering record close to the source repository and avoids simulating unfinished backend capabilities.

## Publishing a Journal entry

1. Open the repository's `Announcements` discussion category.
2. Create a new discussion using a direct, descriptive title.
3. Write the entry in Markdown and state evidence, environment, limits, and the next gate where relevant.
4. Publish the discussion. The GitHub Pages workflow rebuilds the Journal index automatically.

The discussion remains the canonical article and conversation. The website displays its title, excerpt, author, publication date, reply count, and upvotes.

## Local build

Requirements: Node.js 20.9 or later and Python 3.

```powershell
pnpm build
python tests\validate_site.py
```

The build produces `dist/`. Without a GitHub token, the Journal uses its deliberate empty state. To build with live Discussions locally, set `GH_TOKEN` to a token that can read the public repository before running the build.

## Verification

```powershell
pnpm build
python tests\validate_site.py
```

The validator checks public pages, redirects, local links, brand cleanup, accessibility basics, canonical URLs, and required assets. The GitHub workflow deploys only the generated `dist/` artifact.

## Public routes

- `/` — GalileoEngine homepage
- `/platform.html` — GalileoEngine and Servo boundary
- `/roadmap.html` — measured delivery path
- `/galileo-browser.html` — Galileo Browser product page
- `/status.html` — current project boundary
- `/team.html` — founding team
- `/support.html` — future organization support model
- `/journal/` — Journal index generated from GitHub Discussions

GalileoEngine is an experimental browser platform derived from Servo. Galileo Browser is the desktop browser product built on that foundation. The site makes no release or everyday-browsing claim.
