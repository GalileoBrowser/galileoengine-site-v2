# GalileoEngine website

The public presentation site for GalileoEngine and Galileo Browser, including an engineering Journal backed by GitHub Discussions.

- Official organization site: <https://galileobrowser.com/>
- Galileo Discussions: <https://galileobrowser.com/journal/>
- Journal discussions: <https://github.com/GalileoBrowser/galileoengine-site-v2/discussions/categories/announcements>
- Legacy V1 site: <https://silviu3369.github.io/galileoengine-site/>

## Architecture

- GitHub Pages hosts the static presentation site.
- GitHub Discussions provides Journal publishing, author identity, replies, reactions, notifications, and moderation.
- The `Announcements` discussion category is the canonical Galileo Journal channel. Only maintainers and administrators can create announcement discussions; the community can reply.
- GitHub Actions rebuilds the Journal index when the site changes or an announcement discussion is created, edited, moved, or deleted.
- The site has no custom authentication, application server, database, Supabase project, or Vercel deployment.

This keeps the public engineering record close to the source repository and avoids simulating unfinished backend capabilities.

## Weekly evidence snapshot

The Roadmap keeps separate measurements instead of publishing one blended readiness score:

- Phase 0 Core history for GalileoEngine and Servo on the same 286 named WPT subtests;
- Servo revision movement and the explicitly recorded Galileo integration base;
- the evidence state of every row in the reviewed Galileo feature inventory.

The graph series lives in `data/evidence/phase0-core-series.json`. Its first checkpoint comes from Servo's official WPT artefact at the verified fork commit and is recorded in `data/evidence/2026-W30-phase0-core-fork-base.json`. Galileo's value at that point is labelled as an inherited identical-source baseline, not a separate execution. The first separate Galileo/Servo comparison is retained in `data/evidence/2026-W33-phase0-core-comparison.json`.

The current series has two reviewed checkpoints. Weekly automation is not active yet, and the latest captures used different Linux environments. Until both binaries run in one controlled job, the graph is a bounded upstream reference rather than a benchmark. A failed collection must not create a point: the site keeps the last reviewed data instead of drawing a guessed line.

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
- `/platform/` — the browser engine and its relationship with Servo
- `/roadmap/` — measured delivery path
- `/galileo-browser/` — Galileo Browser product page
- `/status/` — current project boundary
- `/team/` — founding team
- `/support/` — contribution and funding paths
- `/journal/` — Journal index generated from GitHub Discussions

The build keeps the former `.html` addresses as non-indexed compatibility redirects, so existing bookmarks continue to work while the canonical site uses clean routes.

GalileoEngine is an experimental browser engine derived from Servo. Galileo Browser is the desktop browser product built on it. The site makes no release or everyday-browsing claim.
