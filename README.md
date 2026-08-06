# Volt website

Static multi-page website for Volt Browser. The public entry point is `index.html`.

## Test locally

From PowerShell in this folder:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4173/>. Keep the terminal open while testing and press `Ctrl+C` to stop the server.

Do not test by double-clicking the HTML files. A local HTTP server catches path, redirect, script, and asset-loading problems that `file://` can hide.

## Validate before publishing

With the local server still running, open a second PowerShell terminal in this folder and run:

```powershell
python tests/validate_site.py --base-url http://127.0.0.1:4173/
```

The validator checks all seven public pages, required metadata and landmarks, duplicate IDs, local assets and links, and HTTP responses.

## Publish checklist

- Upload the contents of this folder with `index.html` at the hosting root.
- For GitHub Pages, publish the `main` branch from the repository root. The included `.nojekyll` file ensures the HTML pages are served unchanged.
- Confirm the final domain and add a canonical URL, `og:url`, social preview image, and `sitemap.xml` for that domain.
- Confirm that the GitHub repository and contribution links are accessible to the intended audience.
- Confirm the host Content Security Policy permits the current Google Fonts and `unpkg.com` runtime requests, or bundle those dependencies before enforcing a stricter policy.
- Re-run the validator against the production URL after deployment.

The repository is currently not publicly reachable from an unauthenticated session, so its external links must be rechecked before a public launch.
