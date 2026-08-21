# GalileoEngine website

The public website for Galileo Engine and Galileo Browser.

- Official site: <https://galileobrowser.com/>
- GitHub organization: <https://github.com/GalileoBrowser>
- Project discussions: <https://github.com/GalileoBrowser/galileoengine-site-v2/discussions>

## Architecture

The site is static and is published with GitHub Pages. It has no application server, database, custom authentication, Supabase project, or Vercel deployment.

The Newsletter uses the public website repository's `Announcements` discussion category as its publishing source. A maintainer writes or edits a GitHub Discussion; the Pages workflow reads the category through GitHub's GraphQL API, regenerates the Newsletter index and article routes, validates them, and deploys the result. Comments stay attached to the source discussion.

Local builds use `data/newsletter-discussions.json` as a reproducible snapshot. A build with `GITHUB_TOKEN` reads the live public Discussions instead. Production enables embedded comments through the giscus GitHub App and the `GISCUS_ENABLED` repository variable. If that integration is unavailable, generated articles retain a clean direct link to their public discussion.

## Evidence and status

Roadmap keeps current engineering status and longer-term milestones together while separating verified evidence from plans:

- a bounded Phase 0 Core WPT shard;
- the reviewed Galileo feature inventory;
- security and performance gates that remain unmeasured;
- dated milestones taken from the project history.

The reviewed snapshot lives in `data/progress/2026-W33.json`, with the compact site audit in `data/galileo-audit.json`. The 286-subtest shard is a narrow upstream reference, not a general browser-compatibility score. The retained Galileo and Servo runs used different Linux environments, so the site does not present them as a benchmark.

Weekly automation is not active. Until a newer reviewed snapshot exists, the site keeps the last verified data instead of estimating progress.

## Local build

Requirements: Node.js 20.9 or later and Python 3.

```powershell
pnpm build
python tests\validate_site.py
```

To preview the current live Announcements locally without changing site code:

```powershell
$env:GITHUB_TOKEN = gh auth token
pnpm build
Remove-Item Env:GITHUB_TOKEN
```

The build produces `dist/`, including clean route directories and noindex compatibility redirects for former addresses.

## Public routes

- `/` — project overview
- `/platform/` — Galileo Engine and its relationship with Servo
- `/galileo-browser/` — the browser product
- `/roadmap/` — milestones, current evidence, and the engineering boundary
- `/newsletter/` — project writing and Discussion-backed updates
- `/newsletter/discussions/<number>/` — generated update with its public conversation
- `/about/` — project identity, Servo foundation, and engineering principles
- `/contact/` — shared project email and the right channel for each message
- `/team/` — co-founders, responsibilities, direct email, and GitHub profiles
- `/github/` — public organization, repositories, Discussions, and issue trackers
- `/get-involved/` — code, testing, discussion, and future funding information
- `/contributing/` — contribution scope, review expectations, and evidence guidelines

Former `/status/` and `/support/` URLs are retained only as noindex compatibility redirects to the relevant section above. They are not separate pages or navigation items. Legacy `.html` addresses also redirect to their clean routes.

## Deployment

`.github/workflows/pages.yml` builds the static artifact, serves it locally for validation, and deploys only after those checks pass. Pushes to `main`, changes to repository Discussions, and manual workflow runs trigger a rebuild. Only Announcements are rendered as Newsletter posts.

Galileo Engine is derived from Servo. Galileo Browser is the desktop product built on it. Neither the site nor the repository currently presents it as ready for everyday or security-sensitive browsing.
