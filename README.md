# GalileoEngine presentation site

The static presentation site for GalileoEngine and Galileo Browser.

Live site: <https://silviu3369.github.io/galileoengine-site/>

## Public pages

- `index.html` — GalileoEngine homepage
- `platform.html` — GalileoEngine and Servo boundary
- `roadmap.html` — measured delivery path
- `galileo-browser.html` — Galileo Browser product page
- `status.html` — current project boundary
- `team.html` — founding team
- `404.html` — branded not-found page

## Local preview

Run a static server from this folder:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4173/>. Test through HTTP rather than by opening the
HTML files directly so redirects, asset paths, and response types are exercised.

Validate the complete public surface with:

```powershell
python tests\validate_site.py --base-url http://127.0.0.1:4173/
```

The validator checks the public pages, compatibility redirects, local links,
required metadata, retired-brand cleanup, accessibility basics, asset response
types, and the custom not-found page.

## Publishing

GitHub Pages publishes the repository root from the `main` branch. The
`.nojekyll` marker keeps the static files unchanged. `robots.txt`, `sitemap.xml`,
canonical URLs, and social metadata target the production Pages address.

The site makes no release or everyday-browsing claim. GalileoEngine is an
experimental browser platform built on Servo; Galileo Browser is the desktop
browser product built on that foundation.
